import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

// Single source of truth for in-call peer chat. Flat to-and-fro, text only.
// Messages live for 48h: we only ever query messages newer than the cutoff and
// lazily hard-delete older ones when a chat is opened (no scheduled job).
//
// Extracted to webrtc-core: the Supabase client is INJECTED and the role is an
// opaque string (role-agnostic). Keyed by `roomId`; the DB column stays
// `chat_messages.pair_id` for compatibility with the shared project schema.
const CHAT_TTL_MS = 48 * 60 * 60 * 1000;
export const CHAT_MAX_LEN = 2000;

// System messages (e.g. the auto "X is trying to join" ping) are stored with a
// hidden control-char prefix so they can be rendered distinctly without a DB
// column. The prefix is invisible and effectively impossible to type by hand.
export const CHAT_SYSTEM_PREFIX = "sys";
export const makeSystemMessage = (text: string) => `${CHAT_SYSTEM_PREFIX}${text}`;
export const isSystemMessage = (body: string) => body.startsWith(CHAT_SYSTEM_PREFIX);
export const systemMessageText = (body: string) =>
  body.startsWith(CHAT_SYSTEM_PREFIX) ? body.slice(CHAT_SYSTEM_PREFIX.length) : body;
const cutoffIso = () => new Date(Date.now() - CHAT_TTL_MS).toISOString();
const lastReadKey = (roomId: string, role: string) => `chat_lastread_${roomId}_${role}`;

export interface ChatMessage {
  id: string;
  pair_id: string;
  sender_role: string;
  sender_id: string;
  body: string;
  created_at: string;
}

// A soft, short "bubble" blip synthesized via Web Audio (no asset needed).
// Best-effort: if the browser blocks audio (no prior gesture), it stays silent.
// Globally throttled so a burst can't turn into a string of blips.
let sharedAudioCtx: AudioContext | null = null;
let lastBlipAt = 0;
const playBubble = () => {
  const t = Date.now();
  if (t - lastBlipAt < 1500) return;
  lastBlipAt = t;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!sharedAudioCtx) sharedAudioCtx = new Ctx();
    const ctx = sharedAudioCtx;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.07, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.26);
  } catch {
    /* best-effort; ignore if audio is blocked */
  }
};

export interface PairChat {
  messages: ChatMessage[];
  unread: boolean;
  loading: boolean;
  /** Mark the chat view as visible/hidden. Loading + mark-read happen on show. */
  setActive: (active: boolean) => void;
  markRead: () => void;
  /** Returns true on success. */
  send: (text: string) => Promise<boolean>;
}

export function usePairChat(
  supabase: SupabaseClient,
  roomId: string,
  selfRole: string,
  selfId: string,
): PairChat {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unread, setUnread] = useState(false);
  const [loading, setLoading] = useState(false);
  // activeRef is read synchronously inside the realtime closure; `active` state
  // drives the mark-read effect below. Kept in sync by setActive.
  const activeRef = useRef(false);
  const [active, setActiveState] = useState(false);
  // Unique per mount so the realtime channel topic is never shared between two
  // consumers of the same (room, role). Without this, transitioning between
  // surfaces can race the old channel's async teardown — leaving the new one
  // without postgres_changes (silent: no unread dot, no blip).
  const instanceIdRef = useRef<string>("");
  if (!instanceIdRef.current) instanceIdRef.current = Math.random().toString(36).slice(2);

  // Merge + de-dupe by id, always sorted by real timestamp — so a message can
  // never be dropped by a load/realtime race or rendered twice.
  const upsertMessages = useCallback((incoming: ChatMessage[]) => {
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      for (const m of incoming) byId.set(m.id, m);
      return [...byId.values()].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    });
  }, []);

  const markRead = useCallback(() => {
    try {
      localStorage.setItem(lastReadKey(roomId, selfRole), new Date().toISOString());
    } catch {
      /* ignore storage failures (private mode) */
    }
    setUnread(false);
  }, [roomId, selfRole]);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    // Best-effort cleanup of expired messages. .then() is required — the
    // supabase builder is lazy and won't issue the request otherwise.
    supabase
      .from("chat_messages")
      .delete()
      .eq("pair_id", roomId)
      .lt("created_at", cutoffIso())
      .then(({ error }: { error: unknown }) => {
        if (error) console.error("Chat cleanup failed:", error);
      });
    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("pair_id", roomId)
      .gt("created_at", cutoffIso())
      .order("created_at", { ascending: true });
    upsertMessages((data ?? []) as ChatMessage[]);
    setLoading(false);
  }, [supabase, roomId, upsertMessages]);

  // One persistent subscription per mounted consumer. Drives the live unread
  // dot, plays the arrival blip on any incoming peer message (regardless of
  // focus/visibility), and feeds the view when it's active.
  useEffect(() => {
    if (!roomId) return;
    let active = true;

    (async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("created_at, sender_role")
        .eq("pair_id", roomId)
        .gt("created_at", cutoffIso())
        .order("created_at", { ascending: false })
        .limit(1);
      if (!active) return;
      const latest = data?.[0];
      if (!latest || latest.sender_role === selfRole) return;
      const lastRead = localStorage.getItem(lastReadKey(roomId, selfRole));
      if (!lastRead || new Date(latest.created_at).getTime() > new Date(lastRead).getTime()) {
        setUnread(true);
      }
    })();

    const channel = supabase
      .channel(`chat-${roomId}-${selfRole}-${instanceIdRef.current}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `pair_id=eq.${roomId}` },
        (payload: { new: ChatMessage }) => {
          const m = payload.new as ChatMessage;
          if (activeRef.current) upsertMessages([m]);
          if (m.sender_role === selfRole) return;
          if (!activeRef.current) setUnread(true);
          playBubble();
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, roomId, selfRole, upsertMessages]);

  const setActive = useCallback(
    (next: boolean) => {
      activeRef.current = next;
      setActiveState(next);
      if (next) loadHistory();
    },
    [loadHistory],
  );

  // Keep the read marker current the whole time the chat view is open — on open,
  // and on every message seen while open (including ones that arrive live).
  useEffect(() => {
    if (active) markRead();
  }, [active, messages, markRead]);

  const send = useCallback(
    async (text: string) => {
      const body = text.trim();
      if (!body) return false;
      const { data, error } = await supabase
        .from("chat_messages")
        .insert({ pair_id: roomId, sender_role: selfRole, sender_id: selfId, body: body.slice(0, CHAT_MAX_LEN) })
        .select()
        .single();
      if (error) return false;
      if (data) upsertMessages([data as ChatMessage]);
      return true;
    },
    [supabase, roomId, selfRole, selfId, upsertMessages],
  );

  return { messages, unread, loading, setActive, markRead, send };
}
