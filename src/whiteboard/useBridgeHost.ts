import { useRef, useEffect, useCallback } from "react";
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

function bridgeLog(
  supabase: SupabaseClient,
  sessionId: string | null,
  role: string,
  event: string,
  meta?: Record<string, unknown>,
) {
  if (!sessionId) return;
  supabase
    .from("call_telemetry")
    .insert({
      call_id: sessionId,
      participant_id: `bridge-host-${role}`,
      participant_role: role,
      event_type: `bridge_host_${event}`,
      metadata: (meta ?? null) as any,
    })
    .then(({ error }: { error: { message: string } | null }) => {
      if (error) console.warn("[BridgeHost] telemetry insert failed", error.message);
    });
}

interface UseBridgeHostArgs {
  /** Injected Supabase client (core never imports the app's client). */
  supabase: SupabaseClient;
  sessionId: string | null;
  /** Opaque role string. */
  participantRole: string;
  bridgeKey: string | null;
  whiteboardOpen: boolean;
  wbHandle: WhiteboardHandle | null;
  getIceServers: () => Promise<RTCIceServer[]>;
  onBridgeData: (msg: any) => void;
}

interface BridgeHostResult {
  bridgeConnected: boolean;
  sendToBridge: (payload: any) => void;
  teardown: () => void;
}

const CHUNK_SIZE = 8_000;

export function useBridgeHost({
  supabase,
  sessionId,
  participantRole,
  bridgeKey,
  whiteboardOpen,
  wbHandle,
  getIceServers,
  onBridgeData,
}: UseBridgeHostArgs): BridgeHostResult {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const connectedRef = useRef(false);
  const suppressEchoUntilRef = useRef(0);
  const whiteboardOpenRef = useRef(whiteboardOpen);
  const wbHandleRef = useRef(wbHandle);
  const onBridgeDataRef = useRef(onBridgeData);
  const chunkAssembliesRef = useRef(new Map<string, { chunks: RtcPayloadChunk[]; total: number }>());
  const msgIdRef = useRef(0);
  const iceCandidateBufferRef = useRef<RTCIceCandidate[]>([]);
  const teardownCalledRef = useRef(false);
  const stopHealthPollRef = useRef<(() => void) | null>(null);
  const effectMountIdRef = useRef(0);

  whiteboardOpenRef.current = whiteboardOpen;
  wbHandleRef.current = wbHandle;
  onBridgeDataRef.current = onBridgeData;

  const sendRaw = useCallback((dc: RTCDataChannel, payload: any) => {
    if (dc.readyState !== "open") return;
    const encoded = JSON.stringify(payload);
    if (encoded.length <= CHUNK_SIZE) {
      dc.send(encoded);
      return;
    }
    msgIdRef.current += 1;
    const messageId = `bridge-${participantRole}-${Date.now()}-${msgIdRef.current}`;
    const chunks = chunkEncodedRtcPayload(messageId, encoded, CHUNK_SIZE);
    for (const chunk of chunks) {
      dc.send(JSON.stringify({ kind: "chunk", ...chunk }));
    }
  }, [participantRole]);

  const sendToBridge = useCallback((payload: any) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") return;
    if (Date.now() < suppressEchoUntilRef.current) return;
    try {
      sendRaw(dc, payload);
    } catch (err: any) {
      bridgeLog(supabase, sessionId, participantRole, "send_error", {
        kind: payload?.kind,
        error: err?.message || String(err),
        bufferedAmount: dc.bufferedAmount,
      });
    }
  }, [supabase, sendRaw, sessionId, participantRole]);

  const closeBridgePC = useCallback(() => {
    if (stopHealthPollRef.current) { stopHealthPollRef.current(); stopHealthPollRef.current = null; }
    if (dcRef.current) {
      try { dcRef.current.close(); } catch {}
      dcRef.current = null;
    }
    if (pcRef.current) {
      try { pcRef.current.close(); } catch {}
      pcRef.current = null;
    }
    connectedRef.current = false;
    iceCandidateBufferRef.current = [];
    chunkAssembliesRef.current.clear();
  }, []);

  const handleBridgeMessage = useCallback(async (rawData: string | ArrayBuffer | Blob) => {
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
      handleBridgeMessage(JSON.stringify(decoded));
      return;
    }

    if (msg?.kind === "scene" || msg?.kind === "scene-delta" || msg?.kind === "pointer") {
      bridgeLog(supabase, sessionId, participantRole, "recv_from_ipad", {
        kind: msg.kind,
        elementCount: msg.elements?.length ?? 0,
      });
      suppressEchoUntilRef.current = Date.now() + 100;
      onBridgeDataRef.current(msg);
    }
  }, [supabase, sessionId, participantRole]);

  const createBridgePC = useCallback(async (sigChannel: RealtimeChannel) => {
    closeBridgePC();
    const iceServers = await getIceServers();
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sigChannel.send({
          type: "broadcast",
          event: "bridge-ice",
          payload: { candidate: e.candidate.toJSON(), from: "laptop" },
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      bridgeLog(supabase, sessionId, participantRole, "ice_state", { state: pc.iceConnectionState });
    };
    pc.onconnectionstatechange = () => {
      bridgeLog(supabase, sessionId, participantRole, "conn_state", { state: pc.connectionState });
    };

    if (sessionId) {
      stopHealthPollRef.current = startRtcHealthPoll({
        supabase,
        callId: sessionId,
        participantId: `bridge-host-${participantRole}`,
        participantRole,
        label: "bridge-host",
        pc,
        dcRef,
      });
    }

    const dc = pc.createDataChannel("canvas", { ordered: true });
    dcRef.current = dc;

    dc.onopen = () => {
      connectedRef.current = true;
      const handle = wbHandleRef.current;
      const wbOpen = whiteboardOpenRef.current;
      bridgeLog(supabase, sessionId, participantRole, "dc_open", {
        hasWbHandle: !!handle,
        whiteboardOpen: wbOpen,
      });
      // Always send a definitive status the instant the channel opens so the
      // iPad flips out of "Connecting" immediately — even when the whiteboard
      // is open but empty (previously this sent nothing, leaving the iPad stuck
      // on "Connecting" until the first draw/toggle).
      if (wbOpen) {
        sendRaw(dc, { kind: "toggle", open: true });
        const snap = handle?.getElementsSnapshot();
        if (snap?.length) {
          sendRaw(dc, { kind: "scene", elements: snap });
        }
      } else {
        sendRaw(dc, { kind: "toggle", open: false });
      }
    };

    dc.onclose = () => {
      connectedRef.current = false;
      bridgeLog(supabase, sessionId, participantRole, "dc_close");
    };

    dc.onmessage = (e) => {
      handleBridgeMessage(e.data).catch((err) => {
        bridgeLog(supabase, sessionId, participantRole, "recv_error", { error: String(err) });
        console.error(err);
      });
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sigChannel.send({
      type: "broadcast",
      event: "bridge-offer",
      payload: { sdp: pc.localDescription },
    });
  }, [supabase, closeBridgePC, getIceServers, sendRaw, handleBridgeMessage, sessionId, participantRole]);

  // Subscribe to signaling channel when bridgeKey is available
  useEffect(() => {
    if (!sessionId || !bridgeKey) return;
    teardownCalledRef.current = false;
    effectMountIdRef.current += 1;
    const mountId = effectMountIdRef.current;
    bridgeLog(supabase, sessionId, participantRole, "effect_mount", { mountId });

    const channelName = bridgeChannelName(sessionId, participantRole, bridgeKey);
    const sigChannel = supabase.channel(channelName);
    channelRef.current = sigChannel;

    sigChannel
      .on("broadcast", { event: "bridge-join" }, () => {
        void createBridgePC(sigChannel);
      })
      .on("broadcast", { event: "bridge-answer" }, async ({ payload }: { payload: any }) => {
        const pc = pcRef.current;
        if (!pc || !payload?.sdp) return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          for (const c of iceCandidateBufferRef.current) {
            await pc.addIceCandidate(c).catch(() => {});
          }
          iceCandidateBufferRef.current = [];
        } catch (err) {
          console.error("[BridgeHost] Failed to set remote description:", err);
        }
      })
      .on("broadcast", { event: "bridge-ice" }, async ({ payload }: { payload: any }) => {
        if (payload?.from === "laptop") return;
        const pc = pcRef.current;
        if (!pc) return;
        const candidate = new RTCIceCandidate(payload.candidate);
        if (pc.remoteDescription) {
          await pc.addIceCandidate(candidate).catch(() => {});
        } else {
          iceCandidateBufferRef.current.push(candidate);
        }
      })
      .subscribe();

    return () => {
      bridgeLog(supabase, sessionId, participantRole, "effect_unmount", { mountId });
      if (!teardownCalledRef.current) {
        closeBridgePC();
      }
      supabase.removeChannel(sigChannel);
      channelRef.current = null;
    };
  }, [supabase, sessionId, bridgeKey, participantRole, createBridgePC, closeBridgePC]);

  // Notify iPad when whiteboard opens/closes
  useEffect(() => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") return;

    if (whiteboardOpen) {
      sendRaw(dc, { kind: "toggle", open: true });
      const handle = wbHandleRef.current;
      if (handle) {
        const snap = handle.getElementsSnapshot();
        if (snap?.length) {
          sendRaw(dc, { kind: "scene", elements: snap });
        }
      }
    } else {
      sendRaw(dc, { kind: "toggle", open: false });
    }
  }, [whiteboardOpen, sendRaw]);

  const teardown = useCallback(() => {
    teardownCalledRef.current = true;
    const dc = dcRef.current;
    if (dc && dc.readyState === "open") {
      try { sendRaw(dc, { kind: "session-ended" }); } catch {}
    }
    closeBridgePC();
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, [supabase, closeBridgePC, sendRaw]);

  return {
    bridgeConnected: connectedRef.current,
    sendToBridge,
    teardown,
  };
}
