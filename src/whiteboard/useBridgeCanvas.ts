import { useRef, useEffect, useState, useCallback } from "react";
import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import { bridgeChannelName } from "../lib/canvasBridge";
import {
  decodeRtcPayload,
  chunkEncodedRtcPayload,
  decodeChunkedRtcPayload,
  type RtcPayloadChunk,
} from "../lib/rtcPayload";
import type { WhiteboardHandle } from "./WhiteboardPanel";
import { startRtcHealthPoll } from "../lib/rtcHealthPoll";

export type BridgeCanvasStatus = "connecting" | "connected" | "whiteboard-closed" | "session-ended";

const CHUNK_SIZE = 8_000;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 2_000;

function bridgeLog(
  supabase: SupabaseClient,
  sessionId: string,
  role: string,
  event: string,
  meta?: Record<string, unknown>,
) {
  supabase
    .from("call_telemetry")
    .insert({
      call_id: sessionId,
      participant_id: `bridge-ipad-${role}`,
      participant_role: role,
      event_type: `bridge_ipad_${event}`,
      metadata: (meta ?? null) as any,
    })
    .then(({ error }: { error: { message: string } | null }) => {
      if (error) console.warn("[BridgeCanvas] telemetry insert failed", error.message);
    });
}

// Fallback ICE (same as the call engine's fallback)
const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
];

async function fetchIceServers(supabase: SupabaseClient): Promise<RTCIceServer[]> {
  try {
    const { data, error } = await supabase.functions.invoke("get-turn-credentials");
    if (error) throw error;
    const cf = (data as any)?.iceServers;
    if (!cf) throw new Error("No iceServers in response");
    const cfArr: RTCIceServer[] = Array.isArray(cf) ? cf : [cf];
    return [{ urls: "stun:stun.cloudflare.com:3478" }, ...cfArr];
  } catch {
    return FALLBACK_ICE_SERVERS;
  }
}

interface UseBridgeCanvasArgs {
  /** Injected Supabase client (core never imports the app's client). */
  supabase: SupabaseClient;
  sessionId: string;
  role: string;
  bridgeKey: string;
  wbHandle: WhiteboardHandle | null;
}

interface UseBridgeCanvasResult {
  status: BridgeCanvasStatus;
  sendDelta: (elements: any[]) => void;
  sendPointer: (p: { x: number; y: number; button: "down" | "up" }) => void;
}

export function useBridgeCanvas({ supabase, sessionId, role, bridgeKey, wbHandle }: UseBridgeCanvasArgs): UseBridgeCanvasResult {
  const [status, setStatus] = useState<BridgeCanvasStatus>("connecting");
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chunkAssembliesRef = useRef(new Map<string, { chunks: RtcPayloadChunk[]; total: number }>());
  const msgIdRef = useRef(0);
  const iceCandidateBufferRef = useRef<RTCIceCandidate[]>([]);
  const wbHandleRef = useRef(wbHandle);
  const sessionEndedRef = useRef(false);
  const stopHealthPollRef = useRef<(() => void) | null>(null);
  const effectMountIdRef = useRef(0);

  wbHandleRef.current = wbHandle;

  const sendRaw = useCallback((payload: any) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") {
      bridgeLog(supabase, sessionId, role, "send_drop", {
        reason: !dc ? "no_dc" : `state_${dc.readyState}`,
        kind: payload?.kind,
      });
      return;
    }
    try {
      const encoded = JSON.stringify(payload);
      if (encoded.length <= CHUNK_SIZE) {
        dc.send(encoded);
        return;
      }
      msgIdRef.current += 1;
      const messageId = `bridge-ipad-${Date.now()}-${msgIdRef.current}`;
      const chunks = chunkEncodedRtcPayload(messageId, encoded, CHUNK_SIZE);
      for (const chunk of chunks) {
        dc.send(JSON.stringify({ kind: "chunk", ...chunk }));
      }
    } catch (err: any) {
      bridgeLog(supabase, sessionId, role, "send_error", {
        kind: payload?.kind,
        error: err?.message || String(err),
        bufferedAmount: dc.bufferedAmount,
      });
    }
  }, [supabase, sessionId, role]);

  const sendDelta = useCallback((elements: any[]) => {
    bridgeLog(supabase, sessionId, role, "send_delta", { elementCount: elements.length });
    sendRaw({ kind: "scene-delta", elements });
  }, [supabase, sendRaw, sessionId, role]);

  const sendPointer = useCallback((p: { x: number; y: number; button: "down" | "up" }) => {
    sendRaw({ kind: "pointer", ...p });
  }, [sendRaw]);

  const closePC = useCallback(() => {
    if (stopHealthPollRef.current) { stopHealthPollRef.current(); stopHealthPollRef.current = null; }
    if (dcRef.current) { try { dcRef.current.close(); } catch {} dcRef.current = null; }
    if (pcRef.current) { try { pcRef.current.close(); } catch {} pcRef.current = null; }
    iceCandidateBufferRef.current = [];
    chunkAssembliesRef.current.clear();
  }, []);

  const handleMessage = useCallback(async (rawData: string | ArrayBuffer | Blob) => {
    const msg = await decodeRtcPayload(rawData);

    if (msg?.kind === "chunk") {
      const { messageId, index, total, payloadType, data } = msg;
      if (!messageId || typeof index !== "number" || typeof total !== "number" || !data) return;
      const existing = chunkAssembliesRef.current.get(messageId) || {
        chunks: Array.from({ length: total }) as RtcPayloadChunk[],
        total,
      };
      existing.chunks[index] = { messageId, index, total, payloadType: payloadType || "text", data };
      chunkAssembliesRef.current.set(messageId, existing);
      if (existing.chunks.filter(Boolean).length !== existing.total) return;
      chunkAssembliesRef.current.delete(messageId);
      const decoded = await decodeChunkedRtcPayload(existing.chunks);
      handleMessage(JSON.stringify(decoded));
      return;
    }

    if (msg?.kind === "toggle") {
      bridgeLog(supabase, sessionId, role, "recv_toggle", { open: msg.open });
      if (msg.open) {
        setStatus("connected");
      } else {
        setStatus("whiteboard-closed");
      }
    } else if (msg?.kind === "scene" || msg?.kind === "scene-delta") {
      bridgeLog(supabase, sessionId, role, "recv_scene", { kind: msg.kind, elementCount: msg.elements?.length ?? 0 });
      setStatus("connected");
      wbHandleRef.current?.applyRemoteScene(msg.elements || [], undefined);
    } else if (msg?.kind === "pointer") {
      wbHandleRef.current?.applyRemotePointer({ ...msg, pointerId: "bridge-laptop" });
    } else if (msg?.kind === "session-ended") {
      sessionEndedRef.current = true;
      setStatus("session-ended");
      closePC();
    }
  }, [supabase, closePC, sessionId, role]);

  useEffect(() => {
    if (!sessionId || !role || !bridgeKey) return;
    effectMountIdRef.current += 1;
    const mountId = effectMountIdRef.current;
    bridgeLog(supabase, sessionId, role, "effect_mount", { mountId });

    const channelName = bridgeChannelName(sessionId, role, bridgeKey);
    const sigChannel = supabase.channel(channelName);
    channelRef.current = sigChannel;

    const attemptJoin = () => {
      if (sessionEndedRef.current) return;
      sigChannel.send({
        type: "broadcast",
        event: "bridge-join",
        payload: { from: "ipad" },
      });
    };

    sigChannel
      .on("broadcast", { event: "bridge-offer" }, async ({ payload }: { payload: any }) => {
        if (!payload?.sdp) return;
        closePC();
        reconnectAttemptsRef.current = 0;

        const iceServers = await fetchIceServers(supabase);
        const pc = new RTCPeerConnection({ iceServers });
        pcRef.current = pc;

        pc.oniceconnectionstatechange = () => {
          bridgeLog(supabase, sessionId, role, "ice_state", { state: pc.iceConnectionState });
        };
        pc.onconnectionstatechange = () => {
          bridgeLog(supabase, sessionId, role, "conn_state", { state: pc.connectionState });
        };

        stopHealthPollRef.current = startRtcHealthPoll({
          supabase,
          callId: sessionId,
          participantId: `bridge-ipad-${role}`,
          participantRole: role,
          label: "bridge-ipad",
          pc,
          dcRef,
        });

        pc.onicecandidate = (e) => {
          if (e.candidate) {
            sigChannel.send({
              type: "broadcast",
              event: "bridge-ice",
              payload: { candidate: e.candidate.toJSON(), from: "ipad" },
            });
          }
        };

        pc.ondatachannel = (e) => {
          const dc = e.channel;
          dcRef.current = dc;
          dc.onopen = () => {
            reconnectAttemptsRef.current = 0;
            bridgeLog(supabase, sessionId, role, "dc_open");
          };
          dc.onclose = () => {
            bridgeLog(supabase, sessionId, role, "dc_close");
            if (sessionEndedRef.current) return;
            // Attempt reconnect
            if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
              reconnectAttemptsRef.current += 1;
              reconnectTimerRef.current = setTimeout(attemptJoin, RECONNECT_DELAY_MS);
            }
          };
          dc.onmessage = (ev) => {
            handleMessage(ev.data).catch((err) => {
              bridgeLog(supabase, sessionId, role, "recv_error", { error: String(err) });
              console.error(err);
            });
          };
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
            if (!sessionEndedRef.current && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
              reconnectAttemptsRef.current += 1;
              closePC();
              reconnectTimerRef.current = setTimeout(attemptJoin, RECONNECT_DELAY_MS);
            }
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        for (const c of iceCandidateBufferRef.current) {
          await pc.addIceCandidate(c).catch(() => {});
        }
        iceCandidateBufferRef.current = [];

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sigChannel.send({
          type: "broadcast",
          event: "bridge-answer",
          payload: { sdp: pc.localDescription },
        });
      })
      .on("broadcast", { event: "bridge-ice" }, async ({ payload }: { payload: any }) => {
        if (payload?.from === "ipad") return;
        const pc = pcRef.current;
        if (!pc) return;
        const candidate = new RTCIceCandidate(payload.candidate);
        if (pc.remoteDescription) {
          await pc.addIceCandidate(candidate).catch(() => {});
        } else {
          iceCandidateBufferRef.current.push(candidate);
        }
      })
      .subscribe((s: string) => {
        if (s === "SUBSCRIBED") {
          attemptJoin();
        }
      });

    return () => {
      bridgeLog(supabase, sessionId, role, "effect_unmount", { mountId });
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      closePC();
      supabase.removeChannel(sigChannel);
      channelRef.current = null;
    };
  }, [supabase, sessionId, role, bridgeKey, closePC, handleMessage]);

  return {
    status,
    sendDelta,
    sendPointer,
  };
}
