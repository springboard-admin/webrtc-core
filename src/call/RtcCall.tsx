import { useState, useEffect, useRef, useCallback } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "../ui/button";
import { toast } from "../ui/use-toast";
import { Toaster } from "../ui/toaster";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Maximize2, Minimize2, Monitor, MonitorOff, VideoOff as VideoOffIcon, Wifi, Settings, ChevronDown, MessageSquare, X, SquarePen, Tablet, MoreVertical } from "lucide-react";
import { WhiteboardPanel, type WhiteboardHandle } from "../whiteboard/WhiteboardPanel";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Label } from "../ui/label";
import { WebRTCDiagnostics } from "../lib/webrtcDiagnostics";
import { chunkEncodedRtcPayload, decodeChunkedRtcPayload, decodeRtcPayload, encodeRtcPayload, type RtcPayloadChunk } from "../lib/rtcPayload";
import { useBridgeHost } from "../whiteboard/useBridgeHost";
import { generateBridgeKey } from "../lib/canvasBridge";
import { startRtcHealthPoll } from "../lib/rtcHealthPoll";
import { DraggablePiP } from "./DraggablePiP";
import { ShareToDeviceModal } from "./ShareToDeviceModal";
import { useIsMobile } from "./useIsMobile";
import { usePairChat } from "../chat/usePairChat";
import { PairChatThread } from "../chat/PairChatThread";
import type { RtcCallProps, CallLifecycleEvent } from "../types";

// Presence nudge ("peer is on the page" cue) is gated off in the core; consumers
// drive presence via their own app surfaces. Kept as a const so the guarded
// code paths below stay intact without behavior change.
const PRESENCE_NUDGE_ENABLED = false;

const log = (role: string, ...args: any[]) => {
  console.log(`[WebRTC][${role}][${new Date().toISOString()}]`, ...args);
};

const isValidUUID = (s: string | null): boolean =>
  !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

// Force Opus into mono FEC+DTX at 48 kbps for resilient, low-bitrate speech.
// 48 kbps gives FEC enough headroom to embed redundancy without competing with audio data.
// Safe regex munge: leaves all non-Opus SDP lines untouched, falls back on any error.
const tuneOpusSdp = (sdp: string | undefined | null): string => {
  if (!sdp) return sdp || "";
  try {
    const pt = sdp.match(/a=rtpmap:(\d+)\s+opus\/48000/i)?.[1];
    if (!pt) return sdp;
    const fmtpLine = new RegExp(`a=fmtp:${pt}\\s.*`, "i");
    const desired = `a=fmtp:${pt} minptime=10;useinbandfec=1;usedtx=1;stereo=0;maxaveragebitrate=48000`;
    if (fmtpLine.test(sdp)) return sdp.replace(fmtpLine, desired);
    return sdp.replace(new RegExp(`(a=rtpmap:${pt}\\s+opus/48000[^\\n]*\\n)`, "i"), `$1${desired}\r\n`);
  } catch {
    return sdp;
  }
};

// Apply DOM properties + play() in addition to srcObject. Safari/Firefox sometimes
// ignore the HTML autoplay/playsinline attributes for WebRTC MediaStreams, so set
// them programmatically and trigger play() explicitly on every (re)attach.
const setupVideoEl = (
  el: HTMLVideoElement | null,
  stream: MediaStream | null,
  muted: boolean,
) => {
  if (!el) return;
  el.autoplay = true;
  el.playsInline = true;
  el.muted = muted;
  if (stream && el.srcObject !== stream) {
    el.srcObject = stream;
  } else if (!stream && el.srcObject) {
    el.srcObject = null;
  }
  el.play().catch(() => {});
};

// Soft two-tone chime via Web Audio (no asset needed). Used to alert the
// mentor that their student has landed on the page. Best-effort: silently
// no-ops if the AudioContext is unavailable or blocked by autoplay policy.
const playPresenceChime = () => {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.15, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.setValueAtTime(880, now + 0.18);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.52);
    osc.onended = () => { try { ctx.close(); } catch {} };
  } catch {
    // ignore — chime is a nicety, never critical
  }
};

// Fallback TURN servers (used if Cloudflare credential fetch fails)
const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  // OpenRelay TURN (free, community-maintained)
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
];

// Cached Cloudflare ICE servers (refreshed every 50 min; TTL is 1h)
let cachedIceServers: RTCIceServer[] | null = null;
let cachedAt = 0;
const ICE_CACHE_MS = 50 * 60 * 1000;

async function getIceServers(supabase: SupabaseClient): Promise<RTCIceServer[]> {
  if (cachedIceServers && Date.now() - cachedAt < ICE_CACHE_MS) return cachedIceServers;
  try {
    const { data, error } = await supabase.functions.invoke("get-turn-credentials");
    if (error) throw error;
    const cf = (data as any)?.iceServers;
    if (!cf) throw new Error("No iceServers in response");
    // Cloudflare returns a single object; normalize to an array and prepend STUN.
    const cfArr: RTCIceServer[] = Array.isArray(cf) ? cf : [cf];
    cachedIceServers = [
      { urls: "stun:stun.cloudflare.com:3478" },
      ...cfArr,
    ];
    cachedAt = Date.now();
    return cachedIceServers;
  } catch (err) {
    console.warn("[TURN] Cloudflare fetch failed, using fallback:", err);
    return FALLBACK_ICE_SERVERS;
  }
}


const CONNECTION_TIMEOUT_MS = 15000;
const MAX_RETRY_ATTEMPTS = 3;
const HEALTH_CHECK_INTERVAL_MS = 5000;
const DISCONNECT_THRESHOLD_MS = 25000;
const CONNECTING_THRESHOLD_MS = 20000;
// If the peer never connects within this window, the realtime signaling channel
// itself may be silently dead (subscribed but not delivering offers/answers).
// All the PC-level retries above re-send over the SAME channel, so they can't
// recover from that. This triggers a full channel teardown + fresh re-subscribe.
const SIGNALING_RECOVERY_MS = 45000;
const MAX_SIGNALING_RECOVERY = 3;

// Provisional, media-health-led thresholds — tuned via the calibration loop.
// Bitrate only contributes to RED at true collapse (static/low-motion video
// legitimately lowers bitrate, so it's a poor yellow signal). Yellow is loss/RTT.
const STRENGTH_BITRATE_RED_BPS = 30_000;   // sustained inbound collapse → red
const STRENGTH_LOSS_RED = 0.05;
const STRENGTH_LOSS_YELLOW = 0.02;
const STRENGTH_RTT_RED_S = 0.30;
const STRENGTH_RTT_YELLOW_S = 0.15;
const STRENGTH_RANK = { green: 0, yellow: 1, red: 2 } as const;
type ConnStrength = "green" | "yellow" | "red";
// Widget shows the WORSE of the two directions, so both peers see the same color.
const worseStrength = (a: ConnStrength, b: ConnStrength): ConnStrength =>
  STRENGTH_RANK[a] >= STRENGTH_RANK[b] ? a : b;

export const RtcCall = ({
  supabase,
  roomId,
  self,
  peerRole,
  signalingRole,
  selfName,
  features,
  slots,
  buildBridgeUrl,
  onLifecycle,
  onTelemetry,
  onCallEnd,
}: RtcCallProps) => {
  // Internal aliases let the lifted engine code stay verbatim. The core is
  // role-agnostic: `participantRole` is just self.role (any string), and the
  // deterministic offerer is `isInitiator` (NOT a role comparison).
  const pairId = roomId;
  const participantId = self.id;
  const participantRole = self.role;
  const isInitiator = signalingRole === "initiator";
  const featureWhiteboard = features?.whiteboard !== false;
  const featureScreenShare = features?.screenShare !== false;
  const featureChat = features?.chat !== false;
  const featureBridge = features?.bridge !== false;

  const emitLifecycle = useCallback((e: CallLifecycleEvent) => {
    try { onLifecycle?.(e); } catch (err) { console.error("onLifecycle handler threw:", err); }
  }, [onLifecycle]);

  const onCallEndRef = useRef(onCallEnd);
  useEffect(() => { onCallEndRef.current = onCallEnd; }, [onCallEnd]);
  // Pre-fetch Cloudflare TURN credentials so the first PC uses them.
  useEffect(() => { void getIceServers(supabase); }, []);
  const callEndFiredRef = useRef(false);
  const fireCallEndOnce = (sid: string | null, connected: boolean, reason: string) => {
    if (callEndFiredRef.current) return;
    callEndFiredRef.current = true;
    console.warn(`[RtcCall][${participantRole}] fireCallEnd reason=${reason} connected=${connected}`);
    emitLifecycle({ type: "ended", at: Date.now(), wasConnected: connected, reason } as CallLifecycleEvent);
    try { onCallEndRef.current?.({ wasConnected: connected }); } catch (e) { console.error("onCallEnd handler threw:", e); }
  };

  // Lock page scroll while in-call so the call window can fill the viewport
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  // Mirror mute/camera intent into refs so the OS-suspend recovery path (which
  // runs from event listeners, outside React render) can read the latest value.
  const isMutedRef = useRef(isMuted); isMutedRef.current = isMuted;
  const isCameraOffRef = useRef(isCameraOff); isCameraOffRef.current = isCameraOff;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [waitingSeconds, setWaitingSeconds] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showNoShowPrompt, setShowNoShowPrompt] = useState(false);
  const [weakNetworkDismissed, setWeakNetworkDismissed] = useState(false);
  const [peerDisconnected, setPeerDisconnected] = useState(false);
  const [peerOnPage, setPeerOnPage] = useState(false);
  // Late-join resilience: peer-present (derived from `join` broadcasts, NOT the
  // disabled presence channel), reconnect-in-progress, and cap-exhausted states.
  const [peerPresent, setPeerPresent] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [connectionStalled, setConnectionStalled] = useState(false);
  // Connection-strength widget: worst(local, peer) media-health state.
  const [connStrength, setConnStrength] = useState<"green" | "yellow" | "red">("green");
  // Mid-call auto-reconnect: after a long stall, the pill copy acknowledges it.
  const [reconnectEscalated, setReconnectEscalated] = useState(false);
  const [peerCameraOff, setPeerCameraOff] = useState(false);
  const isMobile = useIsMobile();
  const [audioOnly, setAudioOnly] = useState(false);
  // Per-direction network verdicts. myUplinkBad = my upload is poor.
  // myDownlinkBad = my download from peer is poor (= peer's upload to me is poor).
  const [myUplinkBad, setMyUplinkBad] = useState(false);
  const [myDownlinkBad, setMyDownlinkBad] = useState(false);
  // What peer told us about their own directions.
  const [peerUplinkBad, setPeerUplinkBad] = useState(false);
  const [peerDownlinkBad, setPeerDownlinkBad] = useState(false);
  const [showDevicePicker, setShowDevicePicker] = useState(false);
  const [studentDetailsOpen, setStudentDetailsOpen] = useState(false);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = useState<string>("");
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>("");

  // Chat state. Chat content/transport is unified with the off-call chat via
  // usePairChat (Supabase); the WebRTC "chat" data channel is still created for
  // SDP stability but no longer used for messages.
  const [chatOpen, setChatOpen] = useState(false);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const pairChat = usePairChat(supabase, pairId, participantRole, participantId);

  // Whiteboard state
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);
  const wbDataChannelRef = useRef<RTCDataChannel | null>(null);
  const wbHandleRef = useRef<WhiteboardHandle | null>(null);
  const wbPointerLastSendRef = useRef(0);
  const wbSceneSeqRef = useRef(0);
  const wbLastAckedRemoteSeqRef = useRef(0);
  const wbLastAppliedLocalSeqRef = useRef(0);
  const wbPendingSceneRef = useRef<{ seq: number; elements: any[] } | null>(null);
  const wbLastSentVersionsRef = useRef<Map<string, number>>(new Map());
  const wbFlushScheduledRef = useRef(false);
  const wbDrainPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wbChunkAssembliesRef = useRef<Map<string, { chunks: RtcPayloadChunk[]; total: number; updatedAt: number }>>(new Map());
  const wbChunkCleanupRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wbMessageIdRef = useRef(0);

  // Canvas bridge state (share whiteboard to iPad/tablet)
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [bridgeKey, setBridgeKey] = useState<string | null>(null);
  const [bridgeSessionId, setBridgeSessionId] = useState<string | null>(null);
  const bridgeDataHandlerRef = useRef<(msg: any) => void>(() => {});
  const stopHealthPollRef = useRef<(() => void) | null>(null);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const waitingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const elapsedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const joinIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const videoAttachRetryRef = useRef<NodeJS.Timeout | null>(null);
  const healthCheckRef = useRef<NodeJS.Timeout | null>(null);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const recoveryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recoveryAttemptsRef = useRef(0);
  const peerJoinSeenRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const myJoinedAtRef = useRef<Date | null>(null);
  const bothConnectedAtRef = useRef<Date | null>(null);
  const connectedAtWrittenRef = useRef(false);
  const creatingSessionRef = useRef(false);
  const wasConnectedRef = useRef(false);
  const elapsedTimerStartedRef = useRef(false);
  const makingOfferRef = useRef(false);
  const retryCountRef = useRef(0);
  const iceRestartAttemptedRef = useRef(false);
  const disconnectedAtRef = useRef<number | null>(null);
  const peerDisconnectedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectingAtRef = useRef<number | null>(null);
  const networkStatsRef = useRef<NodeJS.Timeout | null>(null);
  // Track previous getStats snapshot for delta calculations
  const prevStatsRef = useRef<{
    ts: number;
    recvBytes: number;
    recvPackets: number;
    recvPacketsLost: number;
    framesDecoded: number;
    sentBytes: number;
    sentPackets: number;
    remoteLost: number;
  } | null>(null);
  // Adaptive video bitrate ceiling (driven by sustained loss/rtt deltas in the stats loop).
  const videoMaxBitrateRef = useRef<number>(2_500_000);
  const videoScaleDownRef = useRef<number>(1);
  const adaptBadStreakRef = useRef<number>(0);
  const adaptGoodStreakRef = useRef<number>(0);
  // Sustained-bad counters per direction
  const uplinkBadCountRef = useRef(0);
  const downlinkBadCountRef = useRef(0);
  const uplinkLoggedRef = useRef(false);
  const downlinkLoggedRef = useRef(false);
  const netQualityChannelRef = useRef<RTCDataChannel | null>(null);
  const noShowSnoozedAtRef = useRef<number | null>(null);

  // Stable signaling refs
  const offerSentRef = useRef(false);
  const iceCandidateBufferRef = useRef<RTCIceCandidateInit[]>([]);
  const needsRestartRef = useRef(false);
  // Late-join resilience refs.
  // lastPeerJoinAtRef: timestamp of the most recent peer `join` broadcast — the
  // flag-independent "peer is here right now" signal (presence channel is off).
  const lastPeerJoinAtRef = useRef(0);
  // channelHealthyRef: whether the realtime signaling channel is currently subscribed.
  const channelHealthyRef = useRef(false);
  // lastChannelSubAtRef: when the channel last reached SUBSCRIBED — drives a
  // periodic forced re-subscribe while waiting alone, in case the socket dies
  // silently (no status callback) over a long wait.
  const lastChannelSubAtRef = useRef(0);
  // Connection-strength: local + peer latest state, anti-flicker candidate/count,
  // inbound frame-advance tracking, and last-logged state for transition telemetry.
  const localStrengthRef = useRef<"green" | "yellow" | "red">("green");
  const peerStrengthRef = useRef<"green" | "yellow" | "red">("green");
  const strengthCandidateRef = useRef<"green" | "yellow" | "red">("green");
  const strengthStableCountRef = useRef(0);
  const loggedStrengthRef = useRef<string>("");
  // reconnectFnRef: teardown→recreate→resubscribe sequence, captured inside init()
  // so the component-level manualReconnect() can invoke it.
  const reconnectFnRef = useRef<(() => void) | null>(null);
  const manualReconnectAtRef = useRef(0);
  // Mid-call reconnection controller: ONE serialized loop with backoff that owns
  // all post-connection recovery (replaces the old 3 racing mechanisms).
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectEscalateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Held in a ref so createPeerConnection's state handlers (defined earlier) can
  // invoke the controller (defined later) without a definition cycle.
  const startReconnectRef = useRef<((reason?: string) => void) | null>(null);
  const recoveryReasonRef = useRef<string>("");
  const stopReconnectRef = useRef<(() => void) | null>(null);

  // Media-ready gating: mentor waits for peer's media-ready (or 10s) before sending offer.
  const peerMediaReadyRef = useRef(false);
  const mediaReadyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Page-instance epoch. Minted ONCE per component mount (see init) — NOT per
  // PeerConnection. It identifies this browser page instance so the peer can
  // detect a genuine refresh (new mount = new epoch) apart from the stable
  // sessionId (which survives a refresh) and apart from our own local PC
  // rebuilds (which keep the same epoch). Per-mount is essential: minting per-PC
  // caused a rebuild ping-pong (my rebuild → new epoch → peer rebuilds → its new
  // epoch → I rebuild → ∞). We stamp myEpoch on every signaling message and
  // track the peer's as remoteEpoch. A changed remoteEpoch means the peer's page
  // reloaded and our PC is bonded to dead DTLS → recover once.
  const myEpochRef = useRef<string>("");
  const remoteEpochRef = useRef<string | null>(null);
  // Sustained-freeze recovery: frames stalled while still "connected" (Fix 2).
  const frozenStreakRef = useRef(0);
  const peerOnPageChimedRef = useRef(false);
  // Remote autoplay resilience: persistent play() retry + silent gesture net.
  const remotePlayRetryRef = useRef<NodeJS.Timeout | null>(null);
  const remoteGestureHookedRef = useRef(false);
  // Whiteboard restore-on-rejoin: buffer a remote scene that arrives before the
  // panel has mounted, then apply it once the panel is ready.
  const pendingRemoteSceneRef = useRef<any[] | null>(null);

  // Video bitrate ramp: start at 1.0 Mbps, ramp to 2.5 Mbps after 10s of stable "connected".
  // Whiteboard open caps to 500 kbps to prioritize data-channel throughput.
  const videoRampCompleteRef = useRef(false);
  const videoRampTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const whiteboardOpenRef = useRef(false);

  // WebRTC diagnostics (observer-only, never affects call flow)
  const diagnosticsRef = useRef<WebRTCDiagnostics | null>(null);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // Events logged before the call session id exists (e.g. getUserMedia outcome,
  // which fires before createCallSession()) are buffered here and flushed once
  // the session id is known, so early media telemetry is never dropped.
  const pendingTelemetryRef = useRef<{ eventType: string; metadata?: Record<string, unknown> }[]>([]);

  const logTelemetry = async (eventType: string, metadata?: Record<string, any>) => {
    // Optional extra sink for consumers that want to mirror events elsewhere.
    try { onTelemetry?.(eventType, metadata); } catch { /* never break the call */ }
    if (!isValidUUID(sessionIdRef.current)) {
      pendingTelemetryRef.current.push({ eventType, metadata });
      return;
    }
    await supabase.from("call_telemetry").insert({
      call_id: sessionIdRef.current!,
      participant_id: participantId,
      participant_role: participantRole,
      event_type: eventType,
      metadata: metadata || null,
    });
  };

  const flushPendingTelemetry = () => {
    if (!isValidUUID(sessionIdRef.current) || pendingTelemetryRef.current.length === 0) return;
    const queued = pendingTelemetryRef.current;
    pendingTelemetryRef.current = [];
    for (const ev of queued) {
      void supabase.from("call_telemetry").insert({
        call_id: sessionIdRef.current!,
        participant_id: participantId,
        participant_role: participantRole,
        event_type: ev.eventType,
        metadata: ev.metadata || null,
      });
    }
  };

  // Silent safety net: if the browser blocks unmuted autoplay even after the
  // muted-fallback below, un-mute + play on the user's NEXT interaction with the
  // page (toolbar click, whiteboard, key press). The user never has to know —
  // video is already playing (muted) by this point; this only restores audio.
  const hookRemoteResumeGesture = useCallback(() => {
    if (remoteGestureHookedRef.current) return;
    remoteGestureHookedRef.current = true;
    const resume = () => {
      const el = remoteVideoRef.current;
      if (el) { el.muted = false; el.play().catch(() => {}); }
      remoteGestureHookedRef.current = false;
    };
    (["pointerdown", "keydown", "touchstart"] as const).forEach((ev) =>
      document.addEventListener(ev, resume, { once: true, capture: true } as AddEventListenerOptions),
    );
  }, []);

  // Drive the remote element to ACTUALLY play (not just have srcObject set).
  // 1) retry unmuted play() until it's truly playing (fixes the reconnect case
  //    where the autoplay window lapsed); 2) if still blocked, attach muted so
  //    video always renders, then try to un-mute for audio; 3) last resort, arm
  //    the silent gesture net. No user action is ever required to see video.
  const ensureRemotePlaying = useCallback(() => {
    if (remotePlayRetryRef.current) return;
    let attempts = 0;
    remotePlayRetryRef.current = setInterval(async () => {
      const el = remoteVideoRef.current;
      if (!el || !el.srcObject) return; // not attached yet — keep waiting
      if (!el.paused && el.readyState >= 2) {
        if (remotePlayRetryRef.current) { clearInterval(remotePlayRetryRef.current); remotePlayRetryRef.current = null; }
        return;
      }
      attempts++;
      try {
        await el.play(); // unmuted first to preserve audio
      } catch {
        try {
          el.muted = true;
          await el.play();   // muted autoplay can't be blocked -> video renders
          el.muted = false;  // immediately try to restore audio
          await el.play();
        } catch {
          el.muted = true;
          el.play().catch(() => {});
          hookRemoteResumeGesture();
        }
      }
      if (attempts > 40 && remotePlayRetryRef.current) {
        clearInterval(remotePlayRetryRef.current); remotePlayRetryRef.current = null;
      }
    }, 400);
  }, [hookRemoteResumeGesture]);

  const attachRemoteStream = useCallback(() => {
    const stream = remoteStreamRef.current;
    const videoEl = remoteVideoRef.current;

    if (!stream || !videoEl) {
      log(participantRole, "attachRemoteStream: missing stream or video element, will retry");
      return false;
    }

    setupVideoEl(videoEl, stream, false);
    log(participantRole, "attachRemoteStream: srcObject set, tracks:", stream.getTracks().map(t => `${t.kind}:${t.readyState}:enabled=${t.enabled}`));

    // Ensure it actually plays — persistent retry + muted fallback, no gesture.
    ensureRemotePlaying();

    return true;
  }, [participantRole, ensureRemotePlaying]);

  const startVideoAttachRetry = useCallback(() => {
    if (videoAttachRetryRef.current) return;
    let attempts = 0;
    videoAttachRetryRef.current = setInterval(() => {
      attempts++;
      if (attachRemoteStream() || attempts > 20) {
        if (attempts > 20) log(participantRole, "⚠️ Gave up retrying video attach after 20 attempts");
        clearInterval(videoAttachRetryRef.current!);
        videoAttachRetryRef.current = null;
      }
    }, 250);
  }, [attachRemoteStream, participantRole]);

  // Ref callbacks for <video> elements. React may unmount/remount the element
  // (state changes flip class/parent containers), which nulls srcObject. Re-attach
  // whenever the element mounts so video never goes blank after a re-render.
  const setRemoteVideoEl = useCallback((el: HTMLVideoElement | null) => {
    remoteVideoRef.current = el;
    if (el && remoteStreamRef.current) {
      setupVideoEl(el, remoteStreamRef.current, false);
      ensureRemotePlaying();
    }
  }, [ensureRemotePlaying]);
  const setLocalVideoEl = useCallback((el: HTMLVideoElement | null) => {
    localVideoRef.current = el;
    if (!el) return;
    const activeStream = screenStreamRef.current ?? localStreamRef.current;
    setupVideoEl(el, activeStream, true);
  }, []);

  // Apply a video sender maxBitrate. Called only on transitions (connection
  // stabilization ramp, whiteboard open/close) — never on a recurring interval.
  const applyVideoMaxBitrate = useCallback((bps: number) => {
    const pc = pcRef.current;
    const sender = pc?.getSenders().find((s) => s.track?.kind === "video");
    if (!sender) return;
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
      params.encodings[0] = { ...params.encodings[0], maxBitrate: bps };
      sender.setParameters(params).catch((e) => log(participantRole, "applyVideoMaxBitrate failed:", e));
      log(participantRole, "applyVideoMaxBitrate →", bps);
    } catch (e) {
      log(participantRole, "applyVideoMaxBitrate error:", e);
    }
  }, [participantRole]);

  // Watch the LOCAL video track for OS-driven mute (e.g. mobile app switch /
  // backgrounding suspends the camera). The peer can't distinguish a suspended
  // camera from a black frame, so announce it explicitly via the same
  // camera-toggle broadcast used for the manual toggle. Self-correcting: when
  // the OS unmutes (or recovery re-acquires) we re-broadcast camera-on.
  const attachLocalVideoWatchers = useCallback((track: MediaStreamTrack) => {
    track.onmute = () => {
      log(participantRole, "Local video track muted (OS suspend?)");
      if (!isCameraOffRef.current) {
        channelRef.current?.send({
          type: "broadcast",
          event: "camera-toggle",
          payload: { from: participantRole, cameraOff: true },
        });
        logTelemetry("camera_toggle", { camera_off: true, source: "os_suspend" });
      }
    };
    track.onunmute = () => {
      log(participantRole, "Local video track unmuted");
      if (!isCameraOffRef.current) {
        channelRef.current?.send({
          type: "broadcast",
          event: "camera-toggle",
          payload: { from: participantRole, cameraOff: false },
        });
      }
    };
    track.onended = () => log(participantRole, "Local video track ended (OS suspend?)");
  }, [participantRole]);

  // Recover camera/mic after the OS suspends them on background. On resume a
  // merely-muted track unmutes itself, but iOS/Safari often ENDS the track —
  // a dead sender then transmits nothing forever (peer freezes on the last
  // frame, never recovers). For each ended track we re-acquire via getUserMedia
  // and swap it into the existing sender with replaceTrack — no renegotiation.
  const recoveringTracksRef = useRef(false);
  const recoverSuspendedTracks = useCallback(async () => {
    const pc = pcRef.current;
    const stream = localStreamRef.current;
    if (!pc || !stream || recoveringTracksRef.current) return;

    const oldVideo = stream.getVideoTracks()[0];
    const oldAudio = stream.getAudioTracks()[0];
    const videoDead = !!oldVideo && oldVideo.readyState === "ended";
    const audioDead = !!oldAudio && oldAudio.readyState === "ended";

    if (!videoDead && !audioDead) {
      // Tracks survived (only muted). Nothing to do unless the OS actually
      // suspended one — avoid broadcasting on every ordinary tab refocus.
      if (!oldVideo?.muted && !oldAudio?.muted) return;
      if (oldVideo) oldVideo.enabled = !isCameraOffRef.current;
      if (oldAudio) oldAudio.enabled = !isMutedRef.current;
      channelRef.current?.send({
        type: "broadcast",
        event: "camera-toggle",
        payload: { from: participantRole, cameraOff: isCameraOffRef.current },
      });
      return;
    }

    recoveringTracksRef.current = true;
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({
        video: videoDead ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } } : false,
        audio: audioDead ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : false,
      });

      if (videoDead) {
        const nv = fresh.getVideoTracks()[0];
        if (nv) {
          nv.enabled = !isCameraOffRef.current;
          await pc.getSenders().find((s) => s.track?.kind === "video")?.replaceTrack(nv);
          try { oldVideo.stop(); } catch { /* already stopped */ }
          stream.removeTrack(oldVideo);
          stream.addTrack(nv);
          attachLocalVideoWatchers(nv);
        }
      }
      if (audioDead) {
        const na = fresh.getAudioTracks()[0];
        if (na) {
          na.enabled = !isMutedRef.current;
          await pc.getSenders().find((s) => s.track?.kind === "audio")?.replaceTrack(na);
          try { oldAudio.stop(); } catch { /* already stopped */ }
          stream.removeTrack(oldAudio);
          stream.addTrack(na);
        }
      }

      setupVideoEl(localVideoRef.current, stream, true);
      channelRef.current?.send({
        type: "broadcast",
        event: "camera-toggle",
        payload: { from: participantRole, cameraOff: isCameraOffRef.current },
      });
      logTelemetry("media_recover", { video: videoDead, audio: audioDead, outcome: "recovered" });
      log(participantRole, "Recovered OS-suspended tracks", { videoDead, audioDead });
    } catch (e) {
      logTelemetry("media_recover", { outcome: "failed", error_name: (e as { name?: string })?.name ?? null });
      log(participantRole, "Track recovery failed:", e);
    } finally {
      recoveringTracksRef.current = false;
    }
  }, [participantRole, attachLocalVideoWatchers]);

  // Keep whiteboardOpenRef in sync for use inside callbacks/timers without re-creating them.
  useEffect(() => { whiteboardOpenRef.current = whiteboardOpen; }, [whiteboardOpen]);

  // When the whiteboard opens (e.g. auto-opened by a peer's restore on rejoin),
  // apply the restored scene once both the panel has mounted AND the scene has
  // arrived. Poll for a short window since toggle:open and the scene arrive as
  // two separate messages and can land in either order.
  useEffect(() => {
    if (!whiteboardOpen) return;
    let tries = 0;
    const id = setInterval(() => {
      tries++;
      if (wbHandleRef.current && pendingRemoteSceneRef.current) {
        wbHandleRef.current.applyRemoteScene(pendingRemoteSceneRef.current, undefined);
        pendingRemoteSceneRef.current = null;
        clearInterval(id);
      } else if (tries > 30) {
        clearInterval(id); // ~3s window; nothing to restore
      }
    }, 100);
    return () => clearInterval(id);
  }, [whiteboardOpen]);

  // Presence runs on a DEDICATED channel, fully separate from the WebRTC
  // signaling channel (`call-${pairId}`), so presence can never interfere with
  // the offer/answer/ICE handshake. We announce "in_call" and watch for the
  // peer being "on_page" (arrived but not yet joined) to show a waiting cue.
  useEffect(() => {
    if (!PRESENCE_NUDGE_ENABLED) return;
    if (!pairId) return;
    const presence = supabase.channel(`presence-${pairId}`, {
      config: { presence: { key: `${participantRole}-incall` } },
    });

    const evaluate = () => {
      const state = presence.presenceState() as Record<string, Array<{ role?: string; status?: string }>>;
      let peerPresentOnPage = false;
      for (const entries of Object.values(state)) {
        for (const e of entries) {
          if (e.role && e.role !== participantRole && e.status === "on_page") peerPresentOnPage = true;
        }
      }
      setPeerOnPage(peerPresentOnPage);
      if (peerPresentOnPage && isInitiator && !peerOnPageChimedRef.current) {
        peerOnPageChimedRef.current = true;
        playPresenceChime();
      }
      if (!peerPresentOnPage) peerOnPageChimedRef.current = false;
    };

    presence
      .on("presence", { event: "sync" }, evaluate)
      .on("presence", { event: "join" }, evaluate)
      .on("presence", { event: "leave" }, evaluate)
      .subscribe((st) => {
        if (st === "SUBSCRIBED") {
          presence.track({ role: participantRole, status: "in_call" }).catch(() => {});
        }
      });

    return () => {
      supabase.removeChannel(presence);
    };
  }, [pairId, participantRole]);

  // Canvas bridge: share whiteboard to iPad/tablet via secondary WebRTC data channel
  const bridgeHost = useBridgeHost({
    supabase,
    sessionId: bridgeSessionId,
    participantRole,
    bridgeKey,
    whiteboardOpen,
    wbHandle: wbHandleRef.current,
    getIceServers: () => getIceServers(supabase),
    onBridgeData: (msg: any) => bridgeDataHandlerRef.current(msg),
  });
  const bridgeSendRef = useRef(bridgeHost.sendToBridge);
  bridgeSendRef.current = bridgeHost.sendToBridge;


  // Role-agnostic session model: the core keys everything by `roomId` (the
  // contract is that roomId is unique per call instance), so there is no
  // separate session row and no churn/zombie logic. We record presence in the
  // generic `call_participants` table and emit `onLifecycle` so the consuming
  // app can persist its own business records (e.g. legacy call_sessions).
  const createCallSession = async () => {
    if (creatingSessionRef.current || sessionIdRef.current) return;
    creatingSessionRef.current = true;

    const myJoinedAt = myJoinedAtRef.current?.toISOString() || new Date().toISOString();
    const callId = pairId; // == roomId

    sessionIdRef.current = callId;
    diagnosticsRef.current?.setCallId(callId);

    await supabase.from("call_participants").upsert(
      { call_id: callId, participant_id: participantId, role: participantRole, joined_at: myJoinedAt },
      { onConflict: "call_id,participant_id" },
    );

    emitLifecycle({ type: "joined", at: Date.now() });

    channelRef.current?.send({
      type: "broadcast",
      event: "session-created",
      payload: { sessionId: callId },
    });
    creatingSessionRef.current = false;
  };

  const endCallSession = async () => {
    if (!sessionIdRef.current) return;
    const now = new Date().toISOString();
    await supabase
      .from("call_participants")
      .update({ left_at: now })
      .eq("call_id", sessionIdRef.current)
      .eq("participant_id", participantId);
  };

  const recordPeerLeft = async () => {
    if (!sessionIdRef.current) return;
    const now = new Date().toISOString();
    // Identify the peer's participant row by role (2-party call) and stamp left.
    await supabase
      .from("call_participants")
      .update({ left_at: now })
      .eq("call_id", sessionIdRef.current)
      .eq("role", peerRole)
      .is("left_at", null);
  };

  const startElapsedTimer = useCallback(() => {
    if (elapsedTimerStartedRef.current) return;
    elapsedTimerStartedRef.current = true;
    if (waitingTimerRef.current) {
      clearInterval(waitingTimerRef.current);
      waitingTimerRef.current = null;
    }
    setShowNoShowPrompt(false);
    const startTime = Date.now();
    elapsedTimerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 500);
  }, []);

  const flushIceCandidateBuffer = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) return;
    const buffered = iceCandidateBufferRef.current.splice(0);
    if (buffered.length > 0) {
      log(participantRole, `Flushing ${buffered.length} buffered ICE candidates`);
    }
    for (const candidate of buffered) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        log(participantRole, "Error flushing buffered ICE candidate:", err);
      }
    }
  }, [participantRole]);

  const createPeerConnection = useCallback(() => {
    log(participantRole, "createPeerConnection called");
    if (pcRef.current) {
      log(participantRole, "Closing existing PC, state:", pcRef.current.signalingState);
      if (stopHealthPollRef.current) { stopHealthPollRef.current(); stopHealthPollRef.current = null; }
      pcRef.current.close();
      pcRef.current = null;
    }

    // Reset signaling state
    offerSentRef.current = false;
    iceCandidateBufferRef.current = [];
    needsRestartRef.current = false;
    remoteStreamRef.current = null;
    iceRestartAttemptedRef.current = false;
    disconnectedAtRef.current = null;
    connectingAtRef.current = null;

    // Clear connection timeout
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }

    const pc = new RTCPeerConnection({ iceServers: cachedIceServers || FALLBACK_ICE_SERVERS });
    // Kick off (or refresh) Cloudflare creds in background so next PC has them.
    void getIceServers(supabase);

    // Attach diagnostics observer (passive, never affects call flow)
    try {
      diagnosticsRef.current?.destroy();
      diagnosticsRef.current = new WebRTCDiagnostics(pc, participantId, participantRole, {
        supabase,
        restUrl: (supabase as any).supabaseUrl ?? "",
        restKey: (supabase as any).supabaseKey ?? "",
      });
      if (sessionIdRef.current) diagnosticsRef.current.setCallId(sessionIdRef.current);
    } catch {
      // diagnostics must never break the call
    }

    // Chat now runs over Supabase (unified with the off-call chat) via
    // usePairChat below. The WebRTC "chat" data channel is still created so the
    // SDP/negotiation is byte-for-byte unchanged, but it no longer drives the
    // UI — this handler is intentionally inert.
    const wireChatChannel = (dc: RTCDataChannel) => {
      dataChannelRef.current = dc;
    };

    const startWbChunkCleanup = () => {
      if (wbChunkCleanupRef.current) return;
      wbChunkCleanupRef.current = setInterval(() => {
        const now = Date.now();
        for (const [messageId, assembly] of wbChunkAssembliesRef.current.entries()) {
          if (now - assembly.updatedAt > 15_000) wbChunkAssembliesRef.current.delete(messageId);
        }
        if (!wbChunkAssembliesRef.current.size && wbChunkCleanupRef.current) {
          clearInterval(wbChunkCleanupRef.current);
          wbChunkCleanupRef.current = null;
        }
      }, 5_000);
    };

    const applyWhiteboardMessage = (msg: any) => {
      if (msg.kind === "toggle") {
        setWhiteboardOpen(!!msg.open);
      } else if (msg.kind === "scene") {
        wbLastAckedRemoteSeqRef.current = Math.max(wbLastAckedRemoteSeqRef.current, typeof msg.seq === "number" ? msg.seq : 0);
        // On rejoin the peer pushes toggle:open then this scene; the panel may
        // not have mounted yet. Buffer it so the drawing isn't lost, then the
        // whiteboard-open effect applies it once the panel is ready.
        if (!wbHandleRef.current) {
          pendingRemoteSceneRef.current = msg.elements || [];
        } else {
          wbHandleRef.current.applyRemoteScene(msg.elements || [], typeof msg.seq === "number" ? msg.seq : undefined);
        }
        bridgeSendRef.current({ kind: "scene", elements: msg.elements || [] });
      } else if (msg.kind === "scene-delta") {
        // Delta merges via reconcileElements (id+version); skip the monotonic
        // seq drop so out-of-order deltas still apply correctly.
        wbHandleRef.current?.applyRemoteScene(msg.elements || [], undefined);
        bridgeSendRef.current({ kind: "scene-delta", elements: msg.elements || [] });
      } else if (msg.kind === "pointer") {
        wbHandleRef.current?.applyRemotePointer(msg);
      }
    };

    const handleWhiteboardChannelMessage = async (rawData: string | ArrayBuffer | Blob) => {
      const msg = await decodeRtcPayload(rawData);
      if (msg?.kind !== "chunk") {
        applyWhiteboardMessage(msg);
        return;
      }

      if (!msg.messageId || typeof msg.index !== "number" || typeof msg.total !== "number" || !msg.payloadType || typeof msg.data !== "string") {
        return;
      }

      const existing = wbChunkAssembliesRef.current.get(msg.messageId) || {
        chunks: Array.from({ length: msg.total }) as RtcPayloadChunk[],
        total: msg.total,
        updatedAt: Date.now(),
      };
      existing.total = msg.total;
      existing.updatedAt = Date.now();
      existing.chunks[msg.index] = {
        messageId: msg.messageId,
        index: msg.index,
        total: msg.total,
        payloadType: msg.payloadType,
        data: msg.data,
      };
      wbChunkAssembliesRef.current.set(msg.messageId, existing);
      startWbChunkCleanup();

      if (existing.chunks.filter(Boolean).length !== existing.total) return;

      wbChunkAssembliesRef.current.delete(msg.messageId);
      const decoded = await decodeChunkedRtcPayload(existing.chunks);
      applyWhiteboardMessage(decoded);
    };

    // Whiteboard message handler
    const wireWhiteboardChannel = (dc: RTCDataChannel) => {
      dc.bufferedAmountLowThreshold = 24_000;
      dc.onopen = () => {
        log(participantRole, "Whiteboard data channel open");
        // Reset delta baseline so the next deltas are computed against the
        // full-scene snapshot we're about to (re)send to the peer.
        wbLastSentVersionsRef.current.clear();
        // Restore-on-rejoin: if OUR whiteboard is open, tell the peer to open
        // too (and the scene below restores the drawing). A peer whose board is
        // closed sends nothing here, so it can never force the other side shut —
        // the non-refreshing (open) peer is the source of truth.
        if (whiteboardOpenRef.current) {
          void sendWb({ kind: "toggle", open: true });
        }
        // Re-sync any existing local scene to peer
        const snap = wbHandleRef.current?.getElementsSnapshot?.();
        if (snap && snap.length > 0) {
          for (const e of snap) {
            if (e?.id) wbLastSentVersionsRef.current.set(e.id, e.version ?? 0);
          }
          void sendWb({ kind: "scene", seq: wbSceneSeqRef.current, elements: snap }, { coalesceScene: true });
        }
      };
      dc.onclose = () => {
        if (wbDrainPollRef.current) {
          clearInterval(wbDrainPollRef.current);
          wbDrainPollRef.current = null;
        }
        wbFlushScheduledRef.current = false;
      };
      dc.onerror = () => {
        if (wbDrainPollRef.current) {
          clearInterval(wbDrainPollRef.current);
          wbDrainPollRef.current = null;
        }
      };
      dc.onbufferedamountlow = () => {
        if (!wbFlushScheduledRef.current) return;
        wbFlushScheduledRef.current = false;
        const pending = wbPendingSceneRef.current;
        if (!pending) return;
        wbPendingSceneRef.current = null;
        void sendWb({ kind: "scene", seq: pending.seq, elements: pending.elements }, { coalesceScene: true });
      };
      dc.onmessage = (e) => {
        void handleWhiteboardChannelMessage(e.data).catch(() => {});
      };
      wbDataChannelRef.current = dc;
    };

    // Network quality verdict channel
    const wireNetQualityChannel = (dc: RTCDataChannel) => {
      dc.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.kind === "netq") {
            setPeerUplinkBad(!!msg.myUplinkBad);
            setPeerDownlinkBad(!!msg.myDownlinkBad);
            // Peer's connection-strength → recompute the shared worst-of-two so
            // both screens show the identical color.
            if (msg.strength === "green" || msg.strength === "yellow" || msg.strength === "red") {
              peerStrengthRef.current = msg.strength;
              setConnStrength(worseStrength(localStrengthRef.current, peerStrengthRef.current));
            }
          }
        } catch {}
      };
      netQualityChannelRef.current = dc;
    };

    // Mentor creates all channels.
    // Whiteboard gets "high" SCTP priority so strokes preempt video bursts;
    // chat is "medium"; netquality stays unordered + lossy.
    if (isInitiator) {
      const chatDc = pc.createDataChannel("chat", { ordered: true, priority: "medium" } as RTCDataChannelInit);
      chatDc.onopen = () => log(participantRole, "Data channel open");
      wireChatChannel(chatDc);
      const wbDc = pc.createDataChannel("whiteboard", { ordered: true, priority: "high" } as RTCDataChannelInit);
      wireWhiteboardChannel(wbDc);
      const nqDc = pc.createDataChannel("netquality", { ordered: false, maxRetransmits: 0 });
      wireNetQualityChannel(nqDc);
    }

    pc.ondatachannel = (e) => {
      log(participantRole, "Remote data channel received:", e.channel.label);
      if (e.channel.label === "whiteboard") {
        wireWhiteboardChannel(e.channel);
      } else if (e.channel.label === "netquality") {
        wireNetQualityChannel(e.channel);
      } else {
        wireChatChannel(e.channel);
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate && channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "ice-candidate",
          payload: { candidate: e.candidate.toJSON(), from: participantRole, epoch: myEpochRef.current },
        });
      }
    };

    pc.onicegatheringstatechange = () => {
      log(participantRole, "ICE gathering state:", pc.iceGatheringState);
    };

    pc.oniceconnectionstatechange = () => {
      log(participantRole, "ICE connection state:", pc.iceConnectionState);

      if (pc.iceConnectionState === "failed") {
        // Single owner handles ICE restart → rebuild ladder (pre- and post-connection).
        startReconnectRef.current?.("ice-failed");
      }

      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
        iceRestartAttemptedRef.current = false;
        disconnectedAtRef.current = null;
        connectingAtRef.current = null;
      }

      if (pc.iceConnectionState === "disconnected") {
        if (!disconnectedAtRef.current) {
          disconnectedAtRef.current = Date.now();
        }
      }
    };

    pc.onsignalingstatechange = () => {
      log(participantRole, "Signaling state:", pc.signalingState);
    };

    // ontrack handler
    pc.ontrack = (e) => {
      log(participantRole, "🎥 ontrack — kind:", e.track.kind, "readyState:", e.track.readyState);

      let stream: MediaStream;
      if (e.streams[0]) {
        stream = e.streams[0];
      } else {
        if (!remoteStreamRef.current) {
          remoteStreamRef.current = new MediaStream();
        }
        remoteStreamRef.current.addTrack(e.track);
        stream = remoteStreamRef.current;
      }

      remoteStreamRef.current = stream;

      e.track.onended = () => log(participantRole, "Remote track ended:", e.track.kind);
      e.track.onmute = () => {
        // Native mute is a timeout heuristic and is unreliable under packet
        // loss — a stale mute can fire after the camera is re-enabled and leave
        // the "camera off" overlay stuck on. The explicit camera-toggle
        // broadcast is the source of truth for peerCameraOff; do not set it here.
        log(participantRole, "Remote track muted:", e.track.kind);
      };
      e.track.onunmute = () => {
        log(participantRole, "Remote track unmuted:", e.track.kind);
        if (e.track.kind === "video") setPeerCameraOff(false);
      };

      if (e.track.kind === "video") setPeerCameraOff(e.track.muted);

      // Receiver-side smoothing: a larger jitter buffer absorbs pacer bursts
      // that otherwise show up as the 2-4s "pause then catch-up" cycle.
      try {
        const r: any = e.receiver;
        if (r && "jitterBufferTarget" in r) {
          r.jitterBufferTarget = e.track.kind === "video" ? 120 : 80;
        }
      } catch {}

      // Always try to attach
      const attached = attachRemoteStream();
      if (!attached) startVideoAttachRetry();

      if (!wasConnectedRef.current) {
        log(participantRole, "✅ PEER CONNECTED");
        setIsConnected(true);
        setPeerDisconnected(false);
        setIsReconnecting(false);
        setConnectionStalled(false);
        wasConnectedRef.current = true;
        bothConnectedAtRef.current = new Date();
        // Stamp connected_at once (first time the call is two-way connected) so
        // the generic participant row carries a real talk-time start. Talk/overlap
        // duration is then derivable per call as min(left_at) - max(connected_at),
        // for ANY roles — no redundant precomputed column needed.
        if (!connectedAtWrittenRef.current && sessionIdRef.current) {
          connectedAtWrittenRef.current = true;
          void supabase
            .from("call_participants")
            .update({ connected_at: new Date().toISOString() })
            .eq("call_id", sessionIdRef.current)
            .eq("participant_id", participantId);
        }
        startElapsedTimer();
        logTelemetry("peer_connected");
        if (joinIntervalRef.current) {
          clearInterval(joinIntervalRef.current);
          joinIntervalRef.current = null;
        }
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }
        if (recoveryTimerRef.current) {
          clearTimeout(recoveryTimerRef.current);
          recoveryTimerRef.current = null;
        }
        retryCountRef.current = 0;
      } else if (peerDisconnected) {
        log(participantRole, "✅ PEER RECONNECTED");
        setIsConnected(true);
        setPeerDisconnected(false);
        setIsReconnecting(false);
        setConnectionStalled(false);
        stopReconnectRef.current?.();
        if (joinIntervalRef.current) {
          clearInterval(joinIntervalRef.current);
          joinIntervalRef.current = null;
        }
      }
    };

    pc.onconnectionstatechange = () => {
      log(participantRole, "Connection state:", pc.connectionState);

      if (pc.connectionState === "connected") {
        setIsConnected(true);
        setPeerDisconnected(false);
        setIsReconnecting(false);
        setConnectionStalled(false);
        stopReconnectRef.current?.();
        if (peerDisconnectedTimerRef.current) {
          clearTimeout(peerDisconnectedTimerRef.current);
          peerDisconnectedTimerRef.current = null;
        }
        disconnectedAtRef.current = null;
        connectingAtRef.current = null;
        if (remoteStreamRef.current) attachRemoteStream();

        // Start (or restart) the 10s ramp timer. After 10s of continuous "connected",
        // raise video maxBitrate from 1.0 Mbps to 2.5 Mbps — unless whiteboard is open.
        if (videoRampTimerRef.current) clearTimeout(videoRampTimerRef.current);
        videoRampCompleteRef.current = false;
        videoRampTimerRef.current = setTimeout(() => {
          videoRampTimerRef.current = null;
          const cur = pcRef.current;
          if (!cur || cur.connectionState !== "connected") return;
          videoRampCompleteRef.current = true;
          if (!whiteboardOpenRef.current) {
            applyVideoMaxBitrate(2_500_000);
          }
        }, 10_000);
      }

      if (pc.connectionState === "connecting") {
        if (!connectingAtRef.current) connectingAtRef.current = Date.now();
      }

      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        // Cancel any in-flight ramp; it will restart from scratch on next "connected".
        if (videoRampTimerRef.current) {
          clearTimeout(videoRampTimerRef.current);
          videoRampTimerRef.current = null;
        }
        videoRampCompleteRef.current = false;

        // Post-connection recovery is owned entirely by the serialized reconnect
        // controller (startReconnectRef). "disconnected" is frequently transient
        // (ICE blips heal within 1-3s on a LAN), so we debounce it 5s before
        // engaging; "failed" is hard, so engage immediately.
        if (pc.connectionState === "failed") {
          setIsConnected(false);
          if (wasConnectedRef.current) {
            logTelemetry("peer_disconnected", { connectionState: pc.connectionState });
            startReconnectRef.current?.("conn-failed");
          }
        } else if (wasConnectedRef.current && !peerDisconnectedTimerRef.current) {
          peerDisconnectedTimerRef.current = setTimeout(() => {
            peerDisconnectedTimerRef.current = null;
            const cur = pcRef.current;
            if (!cur) return;
            if (cur.connectionState !== "connected") {
              setIsConnected(false);
              logTelemetry("peer_disconnected", { connectionState: cur.connectionState });
              startReconnectRef.current?.("disconnected");
            }
          }, 5000);
        }
      }
    };


    // Add local tracks with explicit encoding parameters.
    // Without caps, Chrome's GCC probes upward on a LAN, overshoots the decoder,
    // triggers PLI → keyframe burst → ~2-4s freeze-then-rush cycle.
    if (localStreamRef.current) {
      const tracks = localStreamRef.current.getTracks();
      log(participantRole, "Adding", tracks.length, "local tracks to PC");
      const senders: RTCRtpSender[] = tracks.map((track) => pc.addTrack(track, localStreamRef.current!));

      // Video sender: start at 1.0 Mbps (ramps to 2.5 after 10s connected — prevents
      // GCC overshoot at call start). Low priority so audio + DC preempt.
      const videoSender = senders.find((s) => s.track?.kind === "video");
      if (videoSender && videoSender.track) {
        try { (videoSender.track as any).contentHint = "motion"; } catch {}
        try {
          const params = videoSender.getParameters();
          if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
          params.encodings[0] = {
            ...params.encodings[0],
            maxBitrate: 1_000_000,
            maxFramerate: 30,
            scaleResolutionDownBy: 1,
            networkPriority: "low" as RTCPriorityType,
            priority: "low" as RTCPriorityType,
          };
          // Prefer dropping resolution before framerate when bandwidth drops —
          // smooth blurry video is better UX than sharp stuttering video.
          (params as any).degradationPreference = "maintain-framerate";
          videoSender.setParameters(params).catch((e) => log(participantRole, "video setParameters failed:", e));
        } catch (e) { log(participantRole, "video params error:", e); }
      }

      // Audio sender: 48 kbps Opus, high priority (never throttled). Extra headroom
      // gives FEC room to embed redundancy without crowding actual audio data.
      const audioSender = senders.find((s) => s.track?.kind === "audio");
      if (audioSender) {
        try {
          const params = audioSender.getParameters();
          if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
          params.encodings[0] = {
            ...params.encodings[0],
            maxBitrate: 48_000,
            networkPriority: "high" as RTCPriorityType,
            priority: "high" as RTCPriorityType,
          };
          audioSender.setParameters(params).catch((e) => log(participantRole, "audio setParameters failed:", e));
        } catch (e) { log(participantRole, "audio params error:", e); }
      }

      // Prefer VP9 over VP8 — far steadier on LAN under a fixed cap.
      try {
        const RtpRx: any = (window as any).RTCRtpReceiver;
        const caps = RtpRx?.getCapabilities?.("video");
        if (caps?.codecs?.length) {
          const order = ["video/VP9", "video/VP8", "video/H264"];
          const sorted = [...caps.codecs].sort((a: any, b: any) => {
            const ai = order.indexOf(a.mimeType); const bi = order.indexOf(b.mimeType);
            return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
          });
          const videoTx = pc.getTransceivers().find((t) => t.sender === videoSender);
          if (videoTx && (videoTx as any).setCodecPreferences) {
            videoTx.setCodecPreferences(sorted);
          }
        }
      } catch (e) { log(participantRole, "codec pref error:", e); }
    } else {
      log(participantRole, "⚠️ No local stream when creating PC!");
    }

    pcRef.current = pc;

    if (stopHealthPollRef.current) stopHealthPollRef.current();
    if (sessionIdRef.current) {
      stopHealthPollRef.current = startRtcHealthPoll({
        supabase,
        callId: sessionIdRef.current,
        participantId,
        participantRole,
        label: "main",
        pc,
      });
    }

    return pc;
  }, [pairId, participantId, participantRole, startElapsedTimer, attachRemoteStream, startVideoAttachRetry, applyVideoMaxBitrate]);

  const sendOffer = useCallback(async () => {
    let pc = pcRef.current;
    // Self-heal a wedged offerer. If the mentor offered into an empty room and got
    // stuck in "have-local-offer" (no answer ever came), a plain re-offer would bail
    // at the `!== "stable"` check below and deadlock — this is exactly the late-join
    // bug. Rebuild from a clean stable PC so the (late) peer's handshake can complete.
    // Restricted to a not-yet-progressing PC so we never tear down a connecting/
    // connected call (protects mid-call reconnect, ICE restart, screen-share renegotiation).
    if (
      pc && isInitiator && !makingOfferRef.current &&
      pc.signalingState === "have-local-offer" &&
      pc.connectionState !== "connecting" && pc.connectionState !== "connected"
    ) {
      log(participantRole, "sendOffer: offerer wedged in have-local-offer — rebuilding PC");
      createPeerConnection();
      pc = pcRef.current;
    }
    if (!pc || offerSentRef.current || makingOfferRef.current || pc.signalingState === "closed") return;

    log(participantRole, "sendOffer: creating offer");
    makingOfferRef.current = true;
    try {
      const offer = await pc.createOffer({ iceRestart: iceRestartAttemptedRef.current });
      if (pc.signalingState !== "stable") {
        makingOfferRef.current = false;
        return;
      }
      await pc.setLocalDescription({ type: offer.type, sdp: tuneOpusSdp(offer.sdp) });
      offerSentRef.current = true;
      // Reset after use so subsequent track-change renegotiations (screen share)
      // don't unintentionally trigger an ICE restart. Renegotiation/restart
      // paths re-arm this flag explicitly before calling sendOffer().
      iceRestartAttemptedRef.current = false;
      log(participantRole, "📤 Offer sent");
      logTelemetry("signaling_offer_sent");
      channelRef.current?.send({
        type: "broadcast",
        event: "sdp-offer",
        payload: { sdp: pc.localDescription, from: participantRole, epoch: myEpochRef.current },
      });

      // Initial-connect timeout — if the first offer never reaches "connected",
      // hand to the single recovery owner (it runs the ICE-restart → rebuild
      // ladder). Post-connection drops are driven by the state-change handlers.
      if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = setTimeout(() => {
        if (wasConnectedRef.current) return;
        if (pcRef.current?.connectionState !== "connected") {
          startReconnectRef.current?.("stuck-connecting");
        }
      }, CONNECTION_TIMEOUT_MS);
    } catch (err) {
      log(participantRole, "❌ Offer error:", err);
      offerSentRef.current = false;
    } finally {
      makingOfferRef.current = false;
    }
  }, [participantRole, createPeerConnection]);

  // Manual Reconnect CTA handler. Resets both budgets and runs the full
  // teardown→recreate→resubscribe (captured in reconnectFnRef from init). The 3s
  // debounce + the button's disabled-while-reconnecting state prevent spamming.
  const manualReconnect = () => {
    const now = Date.now();
    if (now - manualReconnectAtRef.current < 3000) return;
    manualReconnectAtRef.current = now;
    setConnectionStalled(false);
    setIsReconnecting(true);
    retryCountRef.current = 0;
    recoveryAttemptsRef.current = 0;
    iceRestartAttemptedRef.current = true;
    logTelemetry("manual_reconnect_clicked");
    reconnectFnRef.current?.();
    // Self-clearing safety net so the indicator can never pin if the retry fails.
    window.setTimeout(() => setIsReconnecting(false), 12000);
  };

  const revertScreenShareOnReconnect = useCallback(() => {
    if (isScreenSharing && screenStreamRef.current) {
      log(participantRole, "Reverting screen share to camera on reconnection");
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      setIsScreenSharing(false);
      setupVideoEl(localVideoRef.current, localStreamRef.current, true);
    }
  }, [isScreenSharing, participantRole]);

  // Peer-instance change detector. Called at the top of every inbound signaling
  // handler with the sender's epoch. If the peer is a DIFFERENT instance than
  // the one our PC is DTLS-bonded to (they refreshed / rebuilt), we must rebuild
  // our PC too — a fresh peer cannot re-handshake onto our old bonded PC, which
  // is the "frozen remote video after refresh" bug. The remoteDescription==null
  // guard prevents a rebuild ping-pong: a peer that just rebuilt has a fresh PC,
  // so it adopts our new epoch without rebuilding again.
  const onPeerEpoch = useCallback((epoch?: string) => {
    if (!epoch) return;                          // legacy peer without epoch
    const prev = remoteEpochRef.current;
    if (prev === epoch) return;                  // same instance — nothing to do
    remoteEpochRef.current = epoch;              // adopt the peer's current instance
    if (prev === null) return;                   // first sighting — just handshake
    const pc = pcRef.current;
    if (!pc || pc.remoteDescription == null) return; // our PC is fresh — adopt, no rebuild
    // Peer's page reloaded: our PC is bonded to dead DTLS. Hand to the single
    // owner as a forced rebuild. Because our epoch is per-mount (not per-PC),
    // the rebuild does NOT change our epoch, so the peer won't counter-rebuild —
    // no ping-pong.
    log(participantRole, `🔄 peer epoch changed (${prev} → ${epoch}) — recover`);
    logTelemetry("peer_epoch_changed", { role: participantRole });
    peerMediaReadyRef.current = false;
    startReconnectRef.current?.("peer-restart");
  }, [participantRole]);

  // === Serialized mid-call reconnection controller ===
  // The single owner of ALL post-connection recovery (replaces the old three
  // racing mechanisms — inline ICE restart + connection-timeout rebuild +
  // health-check rebuild — that fought each other and never let ICE settle).
  // Mentor: ICE restart (attempts 1-2) then full PC rebuild, re-offering each
  // time. Student (answerer): re-announce presence so the mentor re-offers;
  // rebuild only if its PC is dead. Backoff so attempts never churn. Runs until
  // reconnected (cleared by stopReconnect on the "connected" transition). The
  // always-present toolbar End Call is the only manual escape — no choice modal.
  const RECONNECT_BACKOFF_MS = [3000, 5000, 8000, 12000];
  const RECONNECT_ESCALATE_MS = 300_000; // 5 min → acknowledge it may be the network

  const stopReconnect = () => {
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    if (reconnectEscalateTimerRef.current) { clearTimeout(reconnectEscalateTimerRef.current); reconnectEscalateTimerRef.current = null; }
    reconnectAttemptRef.current = 0;
    recoveryReasonRef.current = "";
    setReconnectEscalated(false);
  };

  // Force a full PC rebuild (fresh DTLS) rather than a cheap ICE restart. Needed
  // when the peer's DTLS is definitively dead (peer refreshed) or when ICE
  // restart didn't take (escalation after attempt 2).
  const rebuildAndRenegotiate = () => {
    needsRestartRef.current = true;
    iceRestartAttemptedRef.current = true;
    offerSentRef.current = false;
    revertScreenShareOnReconnect();
    createPeerConnection();
    if (isInitiator) setTimeout(() => sendOffer(), 300);
    else channelRef.current?.send({ type: "broadcast", event: "join", payload: { from: participantRole, epoch: myEpochRef.current } });
  };

  // The ONE action taken per recovery tick. All health signals funnel here via
  // startReconnect(reason) — nothing else mutates the PC for recovery. Ladder:
  // "peer-restart" forces a rebuild immediately (dead DTLS). Otherwise the
  // initiator tries a cheap ICE restart on attempts 1-2, then rebuilds; the
  // answerer re-announces (mentor re-offers) and rebuilds only if its PC is dead
  // or a rebuild is forced. Reschedules with backoff only while NOT connected —
  // so a one-shot "frozen" ICE restart (PC stays "connected") fires exactly once.
  const runReconnectAttempt = () => {
    const pc = pcRef.current;
    if (!pc) { stopReconnect(); return; }
    const reason = recoveryReasonRef.current;
    reconnectAttemptRef.current++;
    const attempt = reconnectAttemptRef.current;
    const forceRebuild = reason === "peer-restart" || attempt > 2;
    logTelemetry("reconnect_attempt", { attempt, reason, role: participantRole, connectionState: pc.connectionState });

    if (isInitiator) {
      if (!forceRebuild && pc.signalingState !== "closed") {
        iceRestartAttemptedRef.current = true;
        try { pc.restartIce(); } catch { /* ignore */ }
        offerSentRef.current = false;
        sendOffer();
      } else {
        rebuildAndRenegotiate();
      }
    } else {
      if (forceRebuild || pc.signalingState === "closed") {
        rebuildAndRenegotiate();
      } else {
        channelRef.current?.send({ type: "broadcast", event: "join", payload: { from: participantRole, epoch: myEpochRef.current } });
      }
    }

    // Reschedule only while unconnected. peer-restart drops us to non-connected
    // (fresh PC) so the loop continues to connect; frozen/ICE-restart keeps the
    // PC "connected" so this stops after one shot (re-armed by the next signal).
    if (pcRef.current && pcRef.current.connectionState !== "connected") {
      const delay = RECONNECT_BACKOFF_MS[Math.min(attempt - 1, RECONNECT_BACKOFF_MS.length - 1)];
      reconnectTimerRef.current = setTimeout(runReconnectAttempt, delay);
    } else {
      reconnectTimerRef.current = null;
      reconnectAttemptRef.current = 0;
    }
  };

  // Single entry point for every recovery trigger (ICE/connection failure, stuck
  // connecting, sustained freeze, signaling silence, peer refresh). Serialized:
  // if a run is already in flight it's a no-op. "peer-restart" and "frozen" are
  // allowed to start even while connectionState reads "connected" (that state is
  // a lie in those cases); all others require a non-connected PC.
  const startReconnect = (reason: string = "recover") => {
    const connected = pcRef.current?.connectionState === "connected";
    const overrideConnected = reason === "peer-restart" || reason === "frozen";
    if (connected && !overrideConnected) return;
    if (reconnectTimerRef.current) return;                // already running — serialize
    recoveryReasonRef.current = reason;
    setPeerDisconnected(true);  // non-blocking "Reconnecting…" pill (not a modal)
    setIsReconnecting(true);
    reconnectAttemptRef.current = 0;
    if (reconnectEscalateTimerRef.current) clearTimeout(reconnectEscalateTimerRef.current);
    setReconnectEscalated(false);
    reconnectEscalateTimerRef.current = setTimeout(() => setReconnectEscalated(true), RECONNECT_ESCALATE_MS);
    logTelemetry("reconnect_started", { reason, role: participantRole });
    runReconnectAttempt();
  };

  startReconnectRef.current = startReconnect;
  stopReconnectRef.current = stopReconnect;

  // Health check interval — monitors stuck states
  const startHealthCheck = useCallback(() => {
    if (healthCheckRef.current) return;
    healthCheckRef.current = setInterval(() => {
      const pc = pcRef.current;

      // Clear the "peer is here" UI hint if their join pings have gone stale and
      // we're not connected (they left the waiting room before connecting). Uses
      // refs so it's safe from stale closures; idempotent.
      if (pc?.connectionState !== "connected" && Date.now() - lastPeerJoinAtRef.current > 6000) {
        setPeerPresent(false);
      }

      if (!pc) return;

      // Stuck in "connecting" too long (initial connect or a slow renegotiation
      // that never completes) → hand to the single recovery owner.
      if (connectingAtRef.current && pc.connectionState === "connecting") {
        const elapsed = Date.now() - connectingAtRef.current;
        if (elapsed > CONNECTING_THRESHOLD_MS) {
          connectingAtRef.current = null;
          startReconnectRef.current?.("stuck-connecting");
        }
      }

      // Sustained "disconnected". Chrome self-heals host-pair blips within 1-3s
      // on a LAN, so we only escalate once ICE has actually "failed" — the owner
      // then runs the ICE-restart → rebuild ladder. Clear the timer if it healed.
      if (disconnectedAtRef.current && (pc.connectionState === "disconnected" || pc.iceConnectionState === "disconnected")) {
        const elapsed = Date.now() - disconnectedAtRef.current;
        if (elapsed > DISCONNECT_THRESHOLD_MS && pc.iceConnectionState === "failed") {
          disconnectedAtRef.current = null;
          startReconnectRef.current?.("disconnected");
        } else if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
          disconnectedAtRef.current = null;
        }
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }, [participantRole, createPeerConnection, sendOffer, revertScreenShareOnReconnect]);

  // Network quality monitor — attributes weakness to a specific direction
  // (my uplink vs my downlink) instead of a single shared verdict.
  const startNetworkQualityMonitor = useCallback(() => {
    if (networkStatsRef.current) return;
    networkStatsRef.current = setInterval(async () => {
      const pc = pcRef.current;
      if (!pc || pc.connectionState !== "connected") return;

      try {
        const stats = await pc.getStats();
        let recvBytes = 0;
        let recvPackets = 0;
        let recvPacketsLost = 0;
        let recvJitter = 0;
        let recvFramesDecoded = 0;
        let rtt = 0;

        // For uplink: outbound video + matching remote-inbound-rtp
        let sentBytes = 0;
        let sentPackets = 0;
        let remoteLost = 0;
        let remoteRtt: number | null = null;
        let remoteFractionLost: number | null = null;

        stats.forEach((report: any) => {
          if (report.type === "candidate-pair" && report.state === "succeeded" && report.nominated !== false) {
            if (report.currentRoundTripTime != null) rtt = report.currentRoundTripTime;
          }
          if (report.type === "inbound-rtp" && report.kind === "video") {
            recvBytes += report.bytesReceived || 0;
            recvPackets += report.packetsReceived || 0;
            recvPacketsLost += report.packetsLost || 0;
            if (report.jitter != null) recvJitter = Math.max(recvJitter, report.jitter);
            if (report.framesDecoded != null) recvFramesDecoded += report.framesDecoded;
          }
          if (report.type === "outbound-rtp" && report.kind === "video") {
            sentBytes += report.bytesSent || 0;
            sentPackets += report.packetsSent || 0;
          }
          if (report.type === "remote-inbound-rtp" && report.kind === "video") {
            remoteLost += report.packetsLost || 0;
            if (report.roundTripTime != null) remoteRtt = report.roundTripTime;
            if (report.fractionLost != null) remoteFractionLost = report.fractionLost;
          }
        });

        const now = Date.now();
        const prev = prevStatsRef.current;

        if (prev) {
          const elapsed = (now - prev.ts) / 1000;
          if (elapsed > 0) {
            // === DOWNLINK (my inbound) === reflects peer's upload to me
            const dRecvBytes = Math.max(0, recvBytes - prev.recvBytes);
            const dRecvPkts = Math.max(0, recvPackets - prev.recvPackets);
            const dRecvLost = Math.max(0, recvPacketsLost - prev.recvPacketsLost);
            const recvBitrate = (dRecvBytes * 8) / elapsed;
            const hasActiveLocalVideo = !!localStreamRef.current?.getVideoTracks().some((t) => t.enabled && t.readyState === "live");
            const hasActiveRemoteVideo = dRecvPkts > 5;
            const downLoss = dRecvPkts + dRecvLost > 0 ? dRecvLost / (dRecvPkts + dRecvLost) : 0;
            // Only flag bitrate-low if we are actually receiving some packets (peer is sending video)
            const downBitrateLow = hasActiveRemoteVideo && recvBitrate > 0 && recvBitrate < 50000;
            const downBad = downLoss > 0.05 || downBitrateLow || (rtt > 0.3 && dRecvPkts > 0);

            // === Connection-strength (media-health led) ===
            // Judges MY inbound = what I actually see/hear. Frozen frames or a
            // collapsed inbound bitrate (while the peer IS sending video) are the
            // strongest "bad experience" signals (they tracked real complaints);
            // loss/RTT drive the milder yellow. When the peer isn't sending video
            // (cam off / audio-only) we fall back to loss/RTT so we don't false-red.
            const dFramesDecoded = prev.framesDecoded != null ? Math.max(0, recvFramesDecoded - prev.framesDecoded) : null;
            const peerSendingVideo = hasActiveRemoteVideo;
            const frozen = peerSendingVideo && dFramesDecoded === 0;
            // Fix 2: sustained-freeze recovery. Frames stalled while the PC still
            // reports "connected" is exactly the media stall that connectionState
            // can't see (a wedged media path on an otherwise-live peer). The
            // serialized reconnect controller can't help here — it bails while
            // "connected" — so we directly do an ICE restart (mirrors
            // runReconnectAttempt's cheap path). Require sustained evidence
            // (3 polls ≈ 15s). Deliberately NOT setParameters() — that 5s churn
            // caused freezes and stays removed.
            if (frozen && pc.connectionState === "connected") {
              frozenStreakRef.current++;
              if (frozenStreakRef.current >= 3) {
                frozenStreakRef.current = 0;
                log(participantRole, "🧊 sustained frozen frames — recover");
                logTelemetry("frozen_recovery_triggered", { role: participantRole });
                startReconnectRef.current?.("frozen");
              }
            } else {
              frozenStreakRef.current = 0;
            }
            const collapsed = peerSendingVideo && recvBitrate > 0 && recvBitrate < STRENGTH_BITRATE_RED_BPS;
            let rawStrength: "green" | "yellow" | "red" = "green";
            if (frozen || collapsed || downLoss > STRENGTH_LOSS_RED || (rtt > STRENGTH_RTT_RED_S && dRecvPkts > 0)) {
              rawStrength = "red";
            } else if (downLoss > STRENGTH_LOSS_YELLOW || rtt > STRENGTH_RTT_YELLOW_S) {
              rawStrength = "yellow";
            }
            // Anti-flicker: only commit a new local state after 2 consecutive
            // identical raw readings (a single 5s blip never moves the widget).
            if (rawStrength === strengthCandidateRef.current) {
              strengthStableCountRef.current++;
            } else {
              strengthCandidateRef.current = rawStrength;
              strengthStableCountRef.current = 1;
            }
            if (strengthStableCountRef.current >= 2 && localStrengthRef.current !== rawStrength) {
              localStrengthRef.current = rawStrength;
              // Calibration telemetry: log LOCAL transitions with the local metrics
              // that drove them (this is the dataset we tune thresholds against).
              if (loggedStrengthRef.current !== rawStrength) {
                loggedStrengthRef.current = rawStrength;
                logTelemetry("connection_strength", {
                  state: rawStrength,
                  recv_bitrate_bps: Math.round(recvBitrate),
                  frames_advancing: dFramesDecoded == null ? null : dFramesDecoded > 0,
                  loss_pct: +(downLoss * 100).toFixed(2),
                  rtt_ms: Math.round(rtt * 1000),
                });
              }
              setConnStrength(worseStrength(localStrengthRef.current, peerStrengthRef.current));
            }

            // === UPLINK (my outbound, judged by peer's remote-inbound report) ===
            const dSentBytes = Math.max(0, sentBytes - prev.sentBytes);
            const dSentPkts = Math.max(0, sentPackets - prev.sentPackets);
            const dRemoteLost = Math.max(0, remoteLost - prev.remoteLost);
            const sendBitrate = (dSentBytes * 8) / elapsed;
            // fractionLost from remote-inbound is a 0..1 ratio over the last interval
            const upLossFromFraction = remoteFractionLost ?? -1;
            const upLossFromDelta = dSentPkts + dRemoteLost > 0 ? dRemoteLost / (dSentPkts + dRemoteLost) : 0;
            const upLoss = upLossFromFraction >= 0 ? upLossFromFraction : upLossFromDelta;
            const upRtt = remoteRtt ?? rtt;
            const upBitrateLow = hasActiveLocalVideo && dSentPkts > 5 && sendBitrate > 0 && sendBitrate < 50000;
            const upBad = hasActiveLocalVideo && (dSentPkts > 0 || remoteRtt != null) && (upLoss > 0.05 || (upBitrateLow && upRtt > 0.3));

            const applyVerdict = (
              isBad: boolean,
              counterRef: React.MutableRefObject<number>,
              setter: (v: boolean) => void,
              loggedRef: React.MutableRefObject<boolean>,
              direction: "uplink" | "downlink",
              meta: Record<string, any>,
            ) => {
              if (isBad) {
                counterRef.current++;
                if (counterRef.current >= 3) {
                  setter(true);
                  if (!loggedRef.current) {
                    loggedRef.current = true;
                    logTelemetry("weak_network_shown", { direction, attributed_to: "self", ...meta });
                  }
                }
              } else {
                counterRef.current = Math.max(0, counterRef.current - 1);
                if (counterRef.current === 0) setter(false);
              }
            };

            applyVerdict(downBad, downlinkBadCountRef, setMyDownlinkBad, downlinkLoggedRef, "downlink", {
              recv_bitrate_bps: Math.round(recvBitrate),
              loss_pct: +(downLoss * 100).toFixed(2),
              rtt_ms: Math.round(rtt * 1000),
            });
            applyVerdict(upBad, uplinkBadCountRef, setMyUplinkBad, uplinkLoggedRef, "uplink", {
              loss_pct: +(upLoss * 100).toFixed(2),
              rtt_ms: Math.round(upRtt * 1000),
              send_bitrate_bps: Math.round(sendBitrate),
            });

            // === Adaptive video degradation: DISABLED ===
            // The previous 5s setParameters() churn was the most likely cause of
            // the regular 4-5s remote-video freeze on otherwise healthy LAN calls.
            // We keep stats collection (weak_network telemetry above) as observer
            // only. A conservative, sustained-evidence controller will be added
            // back in a follow-up once observer metrics confirm the right signal.


            // Broadcast my verdicts to peer over data channel
            const dc = netQualityChannelRef.current;
            if (dc && dc.readyState === "open") {
              try {
                dc.send(JSON.stringify({
                  kind: "netq",
                  myUplinkBad: uplinkBadCountRef.current >= 3,
                  myDownlinkBad: downlinkBadCountRef.current >= 3,
                  strength: localStrengthRef.current,
                }));
              } catch {}
            }
          }
        }

        prevStatsRef.current = {
          ts: now,
          recvBytes,
          recvPackets,
          recvPacketsLost,
          framesDecoded: recvFramesDecoded,
          sentBytes,
          sentPackets,
          remoteLost,
        };
      } catch (err) {
        // getStats can fail if PC is closing
      }
    }, 5000);
  }, []);

  useEffect(() => {
    if (!myUplinkBad && !peerUplinkBad) {
      setWeakNetworkDismissed(false);
    }
  }, [myUplinkBad, peerUplinkBad]);

  // Flush WebRTC diagnostics when the user closes the tab or navigates away,
  // so we capture data even if they don't click "End Call".
  useEffect(() => {
    const onPageHide = () => {
      // Use flushBeacon (fetch keepalive) so the browser guarantees delivery
      // even when the tab is being closed, unlike the fire-and-forget flush().
      try {
        const outcome = wasConnectedRef.current
          ? "success"
          : "disconnected";
        diagnosticsRef.current?.flushBeacon(outcome as any);
      } catch {
        // never throw in pagehide
      }
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  // Re-acquire OS-suspended camera/mic when returning to a backgrounded tab.
  // `pageshow` also covers bfcache restores that don't fire visibilitychange.
  useEffect(() => {
    const onResume = () => {
      if (document.visibilityState === "visible") recoverSuspendedTracks();
    };
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("pageshow", onResume);
    return () => {
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("pageshow", onResume);
    };
  }, [recoverSuspendedTracks]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      log(participantRole, "=== INIT START ===");
      // Mint the page-instance epoch once for this mount (survives local PC
      // rebuilds; changes only on a real page refresh).
      myEpochRef.current =
        (typeof crypto !== "undefined" && crypto.randomUUID)
          ? crypto.randomUUID()
          : `${participantRole}-${Math.floor(Math.random() * 1e9)}`;
      let stream: MediaStream;
      // Use browser-default video constraints. Forcing 720p@30 caused encoder to overshoot
      // throttled TURN relays, producing blur + ICE disconnects on real networks.
      try {
        log(participantRole, "Requesting media (default video + audio)...");
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, max: 30 },
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        logTelemetry("media_acquire", { outcome: "video_audio" });
      } catch (err) {
        log(participantRole, "⚠️ video+audio failed, trying audio only:", err);
        logTelemetry("media_acquire", {
          outcome: "video_audio_failed",
          error_name: (err as { name?: string; message?: string })?.name ?? null,
          error_message: (err as { name?: string; message?: string })?.message ?? null,
        });
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
          setAudioOnly(true);
          logTelemetry("media_acquire", { outcome: "audio_only_fallback" });
          toast({ title: "Camera unavailable", description: "Joining with audio only.", variant: "default" });
        } catch (audioErr) {
          log(participantRole, "❌ All media failed:", audioErr);
          logTelemetry("media_acquire", {
            outcome: "all_media_failed",
            error_name: (audioErr as { name?: string; message?: string })?.name ?? null,
            error_message: (audioErr as { name?: string; message?: string })?.message ?? null,
          });
          toast({ title: "Camera/mic error", description: "Please allow camera and microphone access.", variant: "destructive" });
          // Establish the call session id so the buffered media_acquire telemetry
          // (incl. this permission-denied event) actually flushes before we bail.
          try { await createCallSession(); } catch (e) { log(participantRole, "createCallSession on media-fail error:", e); }
          flushPendingTelemetry();
          return;
        }
      }

      if (!mounted) { stream.getTracks().forEach((t) => t.stop()); return; }

      // Default: audio and video enabled (camera/mic ON by default)
      stream.getAudioTracks().forEach(t => { t.enabled = true; });
      stream.getVideoTracks().forEach(t => { t.enabled = true; });

      localStreamRef.current = stream;
      myJoinedAtRef.current = new Date();
      setupVideoEl(localVideoRef.current, stream, true);

      // Watch the camera track so an OS suspend (mobile backgrounding) is
      // announced to the peer and recovered on return.
      const initialVideoTrack = stream.getVideoTracks()[0];
      if (initialVideoTrack) attachLocalVideoWatchers(initialVideoTrack);

      // Enumerate devices after getting permission
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setAudioDevices(devices.filter(d => d.kind === "audioinput"));
        setVideoDevices(devices.filter(d => d.kind === "videoinput"));
        setAudioOutputDevices(devices.filter(d => d.kind === "audiooutput"));
        const activeAudioTrack = stream.getAudioTracks()[0];
        if (activeAudioTrack) setSelectedMic(activeAudioTrack.getSettings().deviceId || "");
        const activeVideoTrack = stream.getVideoTracks()[0];
        if (activeVideoTrack) setSelectedSpeaker(""); // default
      } catch (e) { log(participantRole, "Device enumeration error:", e); }

      await createCallSession();
      flushPendingTelemetry();
      // Ensure the very first PC uses Cloudflare TURN credentials. Pre-fetched
      // on mount, but await here so we never fall back to community STUN/TURN
      // on the very first connection attempt.
      try { await getIceServers(supabase); } catch {}
      createPeerConnection();
      startHealthCheck();
      startNetworkQualityMonitor();


      await logTelemetry(`${participantRole}_joined`);

      const waitingStart = Date.now();
      waitingTimerRef.current = setInterval(() => {
        const now = Date.now();
        const elapsed = Math.floor((now - waitingStart) / 1000);
        setWaitingSeconds(elapsed);
        if (elapsed >= 300) {
          const snoozedAt = noShowSnoozedAtRef.current;
          if (!snoozedAt || (now - snoozedAt >= 300000)) {
            setShowNoShowPrompt(true);
          }
        }
      }, 500);

      // Builds and subscribes a fresh `call-${pairId}` signaling channel. Kept
      // as a closure so the recovery path can tear down a silently-dead channel
      // and re-subscribe a brand-new one (see armSignalingRecovery).
      const connectSignaling = () => {
      const channel = supabase.channel(`call-${pairId}`);
      channelRef.current = channel;

      channel
        .on("broadcast", { event: "sdp-offer" }, async ({ payload }) => {
          if (payload.from === participantRole) return;
          onPeerEpoch(payload.epoch);
          log(participantRole, "📥 Received SDP offer from", payload.from);
          logTelemetry("signaling_offer_received", { from: payload.from });

          const curPc = pcRef.current;
          const pcHealthy = curPc && curPc.connectionState === "connected" && curPc.signalingState !== "closed";
          if (!pcHealthy && (needsRestartRef.current || !curPc || curPc.signalingState === "closed")) {
            log(participantRole, "Recreating PC for incoming offer");
            revertScreenShareOnReconnect();
            createPeerConnection();
          }

          const pc = pcRef.current!;
          try {
            const offerCollision = payload.sdp.type === "offer" &&
              (makingOfferRef.current || pc.signalingState !== "stable");
            const isPolite = !isInitiator;

            if (offerCollision && !isPolite) return;

            if (offerCollision && isPolite) {
              await pc.setLocalDescription({ type: "rollback" });
              await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            } else {
              await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            }

            await flushIceCandidateBuffer();

            if (payload.sdp.type === "offer") {
              const answer = await pc.createAnswer();
              await pc.setLocalDescription({ type: answer.type, sdp: tuneOpusSdp(answer.sdp) });
              logTelemetry("signaling_answer_sent");
              channel.send({
                type: "broadcast",
                event: "sdp-answer",
                payload: { sdp: pc.localDescription, from: participantRole, epoch: myEpochRef.current },
              });
            }
          } catch (err) {
            log(participantRole, "❌ SDP offer handling error:", err);
          }
        })
        .on("broadcast", { event: "sdp-answer" }, async ({ payload }) => {
          if (payload.from === participantRole) return;
          onPeerEpoch(payload.epoch);
          try {
            logTelemetry("signaling_answer_received", { from: payload.from });
            const currentPc = pcRef.current;
            if (!currentPc || currentPc.signalingState === "stable" || currentPc.signalingState === "closed") return;
            await currentPc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            await flushIceCandidateBuffer();
          } catch (err) {
            log(participantRole, "❌ SDP answer error:", err);
          }
        })
        .on("broadcast", { event: "ice-candidate" }, async ({ payload }) => {
          if (payload.from === participantRole) return;
          // Drop candidates from a dead peer instance. We do NOT adopt the epoch
          // here (ICE is high-frequency; late stragglers must not flip remoteEpoch
          // and trigger a spurious rebuild). Adoption happens on join/offer/answer/
          // media-ready, which converge to the live instance within ~1s of join.
          if (payload.epoch && remoteEpochRef.current && payload.epoch !== remoteEpochRef.current) return;
          try {
            // Track remote candidate types for diagnostics (passive)
            try { diagnosticsRef.current?.noteRemoteCandidate(payload.candidate); } catch {}
            const pc = pcRef.current;
            if (pc && pc.remoteDescription && pc.signalingState !== "closed") {
              await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
            } else {
              iceCandidateBufferRef.current.push(payload.candidate);
            }
          } catch (err) {
            log(participantRole, "ICE candidate error:", err);
          }
        })
        .on("broadcast", { event: "call-ended" }, () => {
          handleEndCall(false);
        })
        .on("broadcast", { event: "session-created" }, ({ payload }) => {
          if (payload.sessionId && !sessionIdRef.current) {
            sessionIdRef.current = payload.sessionId;
            diagnosticsRef.current?.setCallId(payload.sessionId);
            flushPendingTelemetry();
          }
        })
        .on("broadcast", { event: "join" }, async ({ payload }) => {
          if (payload.from === participantRole) return;
          onPeerEpoch(payload.epoch);
          log(participantRole, "📥 JOIN from", payload.from);
          // Flag-independent "peer is here right now" signal: refreshed on every
          // join ping (peer pings ~1s while unconnected). Drives the connecting
          // UI and the recovery alone/peer-present branch.
          lastPeerJoinAtRef.current = Date.now();
          setPeerPresent(true);
          setConnectionStalled(false);
          if (!peerJoinSeenRef.current) {
            peerJoinSeenRef.current = true;
            logTelemetry("signaling_join_received", { from: payload.from });
            // The peer has genuinely arrived. Reset the retry/recovery budgets so
            // however much was spent shouting into the empty room (which permanently
            // exhausted recovery before this fix), the handshake now gets a full
            // fresh allotment measured from mutual presence. MUST stay inside this
            // once-per-arrival block — resetting on every 1s join ping would defeat
            // the cap and loop forever while a present peer keeps failing.
            retryCountRef.current = 0;
            recoveryAttemptsRef.current = 0;
            // The recovery timer was armed off OUR subscribe — before the peer
            // arrived. When the peer joins late (the other party opened the room
            // well before us), that fixed 45s window can elapse mid-handshake and
            // tear down a connection that's about to succeed (esp. cross-network,
            // where ICE gathering is slower). Re-arm from "both present" so the
            // handshake gets a full window measured from mutual presence.
            if (pcRef.current?.connectionState !== "connected") {
              armSignalingRecovery();
            }
          }

          if (pcRef.current?.connectionState === "connected") return;

          if (needsRestartRef.current) {
            revertScreenShareOnReconnect();
            createPeerConnection();
            setPeerDisconnected(false);
          }

          // Mentor is the offerer. Always (re)send an offer when a peer joins
          // and we're not connected yet — covers the late-arrival case where
          // the first offer was broadcast before the peer subscribed.
          if (isInitiator) {
            offerSentRef.current = false;
            setTimeout(() => sendOffer(), 50);
          }
        })

        .on("broadcast", { event: "camera-toggle" }, ({ payload }) => {
          if (payload.from === participantRole) return;
          setPeerCameraOff(payload.cameraOff);
        })
        .on("broadcast", { event: "audio-only-request" }, ({ payload }) => {
          if (payload?.from === participantRole) return;
          turnOffLocalCameraForAudioOnly("audio_only_switch_peer");
          setWeakNetworkDismissed(true);
          toast({
            title: "Switched to audio only",
            description: "Cameras turned off to improve the connection.",
          });
        })
        .on("broadcast", { event: "media-ready" }, ({ payload }) => {
          if (payload?.from === participantRole) return;
          onPeerEpoch(payload.epoch);
          if (peerMediaReadyRef.current) return;
          log(participantRole, "📥 Peer media-ready received");
          peerMediaReadyRef.current = true;
          if (mediaReadyTimerRef.current) {
            clearTimeout(mediaReadyTimerRef.current);
            mediaReadyTimerRef.current = null;
          }
          // Mentor: now that peer has media, send the offer (if not already).
          if (isInitiator && !offerSentRef.current) {
            setTimeout(() => sendOffer(), 0);
          }
        })
        .subscribe(async (status) => {
          log(participantRole, "Channel status:", status);
          // Surface the realtime subscription lifecycle to telemetry. A silently
          // dead call (both joined, neither connects) is usually a CHANNEL_ERROR /
          // TIMED_OUT / CLOSED here that we previously never recorded.
          logTelemetry("signaling_channel_status", { status });
          // Track channel liveness so the alone-keep-alive recovery branch can
          // tell a healthy channel from a dead one (CHANNEL_ERROR/TIMED_OUT/CLOSED).
          channelHealthyRef.current = status === "SUBSCRIBED";
          if (status === "SUBSCRIBED") {
            lastChannelSubAtRef.current = Date.now();
            // Both sides present from our POV — start the safety net. If no
            // peer_connected fires within SIGNALING_RECOVERY_MS, the channel is
            // re-subscribed from scratch.
            armSignalingRecovery();
            channel.send({
              type: "broadcast",
              event: "join",
              payload: { from: participantRole, epoch: myEpochRef.current },
            });

            // Announce that our local media is attached to the PC. The mentor
            // gates its first offer on receiving the peer's media-ready (or a
            // 10s fallback) so the offer/answer exchange doesn't race against
            // the other side attaching their tracks.
            channel.send({
              type: "broadcast",
              event: "media-ready",
              payload: { from: participantRole, epoch: myEpochRef.current },
            });

            // Mentor is the offerer. Gate the first offer on peer media-ready;
            // 10s fallback covers the case where the peer's media-ready was
            // dropped on the wire. JOIN handler still re-offers on late peer.
            if (isInitiator) {
              if (peerMediaReadyRef.current) {
                setTimeout(() => sendOffer(), 0);
              } else {
                if (mediaReadyTimerRef.current) clearTimeout(mediaReadyTimerRef.current);
                mediaReadyTimerRef.current = setTimeout(() => {
                  mediaReadyTimerRef.current = null;
                  if (!offerSentRef.current) {
                    log(participantRole, "⏱️ media-ready timeout — sending offer anyway");
                    sendOffer();
                  }
                }, 10_000);
              }
            }

            // 1s cadence (was 3s) so a peer that subscribes after us gets a
            // JOIN within ~1s instead of up to 3s. Stops as soon as connected.
            joinIntervalRef.current = setInterval(() => {
              if (pcRef.current?.connectionState === "connected") {
                if (joinIntervalRef.current) {
                  clearInterval(joinIntervalRef.current);
                  joinIntervalRef.current = null;
                }
                return;
              }
              channel.send({
                type: "broadcast",
                event: "join",
                payload: { from: participantRole, epoch: myEpochRef.current },
              });
            }, 1000);
          }
        });
      }; // end connectSignaling

      // Full destructive reset: tear down the (likely stale) realtime channel,
      // rebuild the offerer's PC from clean `stable`, and re-subscribe a fresh
      // channel. The original silent-dead-channel recovery; now also the manual
      // Reconnect CTA path. Captured in reconnectFnRef below.
      const teardownAndReconnect = async () => {
        if (joinIntervalRef.current) {
          clearInterval(joinIntervalRef.current);
          joinIntervalRef.current = null;
        }
        try { if (channelRef.current) supabase.removeChannel(channelRef.current); } catch { /* ignore */ }
        channelRef.current = null;
        channelHealthyRef.current = false;

        peerJoinSeenRef.current = false;
        offerSentRef.current = false;

        // Refresh TURN creds before rebuilding so a long wait (>50min cache TTL)
        // still offers with valid relay candidates. Awaited only here (peer present
        // / user action) — never while merely waiting alone.
        try { await getIceServers(supabase); } catch { /* ignore */ }

        // Mentor (offerer) rebuilds the PC so it re-offers from a clean `stable`
        // state. The answerer keeps its PC unless unusable; only the offerer
        // actively re-offers, so the two can't fight.
        if (isInitiator) {
          needsRestartRef.current = true;
          revertScreenShareOnReconnect();
          createPeerConnection();
        } else {
          const cur = pcRef.current;
          if (!cur || cur.signalingState === "closed") {
            needsRestartRef.current = true;
            revertScreenShareOnReconnect();
            createPeerConnection();
          }
        }

        // Re-subscribe a brand-new channel (re-arms the recovery timer on its
        // SUBSCRIBED, so a subsequent attempt can still fire).
        connectSignaling();
      };

      const armSignalingRecovery = () => {
        if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
        recoveryTimerRef.current = setTimeout(() => {
          recoveryTimerRef.current = null;
          const pc = pcRef.current;
          if (wasConnectedRef.current || pc?.connectionState === "connected") return;

          // Is the peer genuinely here right now? (join ping within ~6s.)
          const peerHere = Date.now() - lastPeerJoinAtRef.current < 6000;

          if (!peerHere) {
            // ALONE: unlimited, paced, NON-destructive keep-alive. Never consume
            // the budget, never rebuild the PC (that's what wedged the offerer).
            // Only re-subscribe if the channel actually died, so the room stays
            // reachable for the full 30-min wait. Always re-arm.
            // Clear any leftover "Reconnecting…" from a prior peer-present attempt.
            setIsReconnecting(false);
            // Re-subscribe if the channel died, OR periodically (~3 min) as a
            // belt-and-suspenders against a socket that died silently without a
            // status callback over a long wait. Safe: nothing is live while alone.
            const channelDead = !channelHealthyRef.current || !channelRef.current;
            const channelStale = Date.now() - lastChannelSubAtRef.current > 180_000;
            if (channelDead || channelStale) {
              logTelemetry("signaling_keepalive_resubscribe", { reason: channelDead ? "channel_dead" : "periodic" });
              try { if (channelRef.current) supabase.removeChannel(channelRef.current); } catch { /* ignore */ }
              channelRef.current = null;
              lastChannelSubAtRef.current = Date.now(); // avoid re-trigger before the new SUBSCRIBED lands
              connectSignaling();
            }
            armSignalingRecovery();
            return;
          }

          // PEER PRESENT but not connected: budgeted, destructive recovery.
          if (recoveryAttemptsRef.current >= MAX_SIGNALING_RECOVERY) {
            logTelemetry("signaling_recovery_exhausted", {
              attempts: recoveryAttemptsRef.current,
              connectionState: pc?.connectionState,
              signalingState: pc?.signalingState,
            });
            // Surface an honest "having trouble" state + the manual Reconnect CTA.
            setConnectionStalled(true);
            setIsReconnecting(false);
            return;
          }
          recoveryAttemptsRef.current++;
          setIsReconnecting(true);
          logTelemetry("signaling_recovery_fired", {
            attempt: recoveryAttemptsRef.current,
            connectionState: pc?.connectionState,
            signalingState: pc?.signalingState,
          });
          void teardownAndReconnect();
        }, SIGNALING_RECOVERY_MS);
      };

      // Expose the destructive reset to the manual Reconnect CTA (component scope).
      reconnectFnRef.current = () => { void teardownAndReconnect(); };

      connectSignaling();
    };

    init();

    return () => {
      mounted = false;
      cleanup();
      // Safety net: if the component unmounts (parent navigated, tab close, error)
      // before handleEndCall fired, still surface the post-call popup.
      fireCallEndOnce(sessionIdRef.current, wasConnectedRef.current, "unmount");
    };
  }, []);

  const cleanup = () => {
    log(participantRole, "=== CLEANUP ===");
    if (waitingTimerRef.current) clearInterval(waitingTimerRef.current);
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    if (joinIntervalRef.current) clearInterval(joinIntervalRef.current);
    if (videoAttachRetryRef.current) clearInterval(videoAttachRetryRef.current);
    if (remotePlayRetryRef.current) { clearInterval(remotePlayRetryRef.current); remotePlayRetryRef.current = null; }
    if (healthCheckRef.current) clearInterval(healthCheckRef.current);
    if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
    if (recoveryTimerRef.current) { clearTimeout(recoveryTimerRef.current); recoveryTimerRef.current = null; }
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    if (reconnectEscalateTimerRef.current) { clearTimeout(reconnectEscalateTimerRef.current); reconnectEscalateTimerRef.current = null; }
    if (networkStatsRef.current) clearInterval(networkStatsRef.current);
    if (wbDrainPollRef.current) clearInterval(wbDrainPollRef.current);
    if (peerDisconnectedTimerRef.current) { clearTimeout(peerDisconnectedTimerRef.current); peerDisconnectedTimerRef.current = null; }
    if (mediaReadyTimerRef.current) { clearTimeout(mediaReadyTimerRef.current); mediaReadyTimerRef.current = null; }
    if (videoRampTimerRef.current) { clearTimeout(videoRampTimerRef.current); videoRampTimerRef.current = null; }
    if (wbChunkCleanupRef.current) clearInterval(wbChunkCleanupRef.current);
    wbChunkCleanupRef.current = null;
    wbChunkAssembliesRef.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    pcRef.current?.close();
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    // Diagnostics destroy is no-op for listeners (pc.close removes them); just clears timers
    try { diagnosticsRef.current?.destroy(); } catch {}
    bridgeHost.teardown();
  };

  const handleEndCall = async (broadcast = true) => {
    await logTelemetry(`${participantRole}_left`);

    // Flush diagnostics: success if we ever connected, otherwise failed/disconnected.
    // Await so the DB insert completes before the page may unload (e.g. student auto-ended by mentor hangup).
    try {
      const outcome = wasConnectedRef.current
        ? "success"
        : (pcRef.current?.iceConnectionState === "failed" ? "failed" : "disconnected");
      await diagnosticsRef.current?.flushAsync(outcome as any);
    } catch {}


    if (sessionIdRef.current) {
      if (broadcast) {
        await endCallSession();
      } else {
        await recordPeerLeft();
        await endCallSession();
      }
    }
    if (broadcast && channelRef.current) {
      channelRef.current.send({ type: "broadcast", event: "call-ended", payload: { from: participantRole } });
    }
    const sid = sessionIdRef.current;
    const connected = wasConnectedRef.current;
    cleanup();
    fireCallEndOnce(sid, connected, broadcast ? "hangup" : "peer-ended");
  };

  const toggleMute = () => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  };

  const toggleCamera = () => {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      const newCameraOff = !videoTrack.enabled;
      setIsCameraOff(newCameraOff);
      channelRef.current?.send({
        type: "broadcast",
        event: "camera-toggle",
        payload: { from: participantRole, cameraOff: newCameraOff },
      });
      logTelemetry("camera_toggle", { camera_off: newCameraOff, source: "manual" });
    }
  };

  // Turn off the local camera (if on) and ask the peer to turn off theirs too,
  // to free uplink bandwidth for audio. Reversible — either side can re-enable
  // their camera afterward via the normal toolbar button.
  const turnOffLocalCameraForAudioOnly = (source: string) => {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (videoTrack && videoTrack.enabled) {
      videoTrack.enabled = false;
      setIsCameraOff(true);
      channelRef.current?.send({
        type: "broadcast",
        event: "camera-toggle",
        payload: { from: participantRole, cameraOff: true },
      });
      logTelemetry("camera_toggle", { camera_off: true, source });
    }
  };

  const switchToAudioOnly = () => {
    turnOffLocalCameraForAudioOnly("audio_only_switch");
    channelRef.current?.send({
      type: "broadcast",
      event: "audio-only-request",
      payload: { from: participantRole },
    });
    logTelemetry("audio_only_switch", { initiated_by: participantRole });
    setWeakNetworkDismissed(true);
    toast({
      title: "Switched to audio only",
      description: "Cameras turned off to improve the connection.",
    });
  };

  const stopScreenShare = async () => {
    const pc = pcRef.current;
    if (!pc || !screenStreamRef.current) return;

    screenStreamRef.current.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;

    const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
    if (cameraTrack) {
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) {
        await sender.replaceTrack(cameraTrack);
      }
    }
    setIsScreenSharing(false);
    setupVideoEl(localVideoRef.current, localStreamRef.current, true);

    // Force renegotiation so peer picks up track change
    if (isInitiator) {
      offerSentRef.current = false;
      setTimeout(() => sendOffer(), 300);
    }

    logTelemetry("screen_share_stopped");
    toast({ title: "Screen sharing stopped" });
  };

  const startScreenShare = async () => {
    const pc = pcRef.current;
    if (!pc) return;
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = screenStream;

      const screenTrack = screenStream.getVideoTracks()[0];
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) {
        await sender.replaceTrack(screenTrack);
      }

      setIsScreenSharing(true);
      setupVideoEl(localVideoRef.current, screenStream, true);

      // Force renegotiation
      if (isInitiator) {
        offerSentRef.current = false;
        setTimeout(() => sendOffer(), 300);
      }

      // Native browser "Stop sharing" — call stopScreenShare directly so we
      // don't depend on a stale `isScreenSharing` value captured by closure.
      screenTrack.onended = () => {
        stopScreenShare();
      };

      logTelemetry("screen_share_started");
    } catch (err) {
      console.log("Screen share cancelled or error:", err);
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      await stopScreenShare();
    } else {
      // Mutual exclusion: close whiteboard first if it's open
      if (whiteboardOpen) {
        setWhiteboardOpen(false);
        sendWb({ kind: "toggle", open: false });
        logTelemetry("whiteboard_closed", { initiator: participantRole, reason: "screen_share_started" });
        toast({ title: "Stopped whiteboard to start screen sharing" });
      }
      await startScreenShare();
    }
  };

  const switchMicrophone = async (deviceId: string) => {
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } }, video: false });
      const newAudioTrack = newStream.getAudioTracks()[0];
      const oldStream = localStreamRef.current;
      if (oldStream) {
        const oldAudioTrack = oldStream.getAudioTracks()[0];
        if (oldAudioTrack) {
          const wasMuted = !oldAudioTrack.enabled;
          oldStream.removeTrack(oldAudioTrack);
          oldAudioTrack.stop();
          oldStream.addTrack(newAudioTrack);
          newAudioTrack.enabled = !wasMuted;
          // Replace on PC
          const sender = pcRef.current?.getSenders().find(s => s.track?.kind === "audio");
          if (sender) await sender.replaceTrack(newAudioTrack);
        }
      }
      setSelectedMic(deviceId);
      toast({ title: "Microphone changed", description: newAudioTrack.label || "New microphone" });
    } catch (err) {
      log(participantRole, "Mic switch error:", err);
      toast({ title: "Could not switch microphone", variant: "destructive" });
    }
  };

  const switchSpeaker = async (deviceId: string) => {
    const videoEl = remoteVideoRef.current as any;
    if (videoEl && typeof videoEl.setSinkId === "function") {
      try {
        await videoEl.setSinkId(deviceId);
        setSelectedSpeaker(deviceId);
        toast({ title: "Speaker changed" });
      } catch (err) {
        log(participantRole, "Speaker switch error:", err);
        toast({ title: "Could not switch speaker", variant: "destructive" });
      }
    } else {
      toast({ title: "Speaker selection not supported in this browser", variant: "destructive" });
    }
  };

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      containerRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setIsFullscreen(!isFullscreen);
  };

  const sendWb = async (
    payload: any,
    options?: { compress?: boolean; coalesceScene?: boolean },
  ) => {
    const dc = wbDataChannelRef.current;
    if (!dc || dc.readyState !== "open") return;
    try {
      const ensureWbDrainPolling = () => {
        if (wbDrainPollRef.current) return;
        wbDrainPollRef.current = setInterval(() => {
          const currentDc = wbDataChannelRef.current;
          if (!currentDc || currentDc.readyState !== "open") {
            if (wbDrainPollRef.current) {
              clearInterval(wbDrainPollRef.current);
              wbDrainPollRef.current = null;
            }
            return;
          }
          if (currentDc.bufferedAmount <= 24_000 && wbFlushScheduledRef.current) {
            if (wbDrainPollRef.current) {
              clearInterval(wbDrainPollRef.current);
              wbDrainPollRef.current = null;
            }
            wbFlushScheduledRef.current = false;
            const pending = wbPendingSceneRef.current;
            if (!pending) return;
            wbPendingSceneRef.current = null;
            void sendWb({ kind: "scene", seq: pending.seq, elements: pending.elements }, { coalesceScene: true });
          }
        }, 150);
      };

      if (options?.coalesceScene && payload?.kind === "scene" && dc.bufferedAmount > 48_000) {
        wbPendingSceneRef.current = { seq: payload.seq, elements: payload.elements };
        wbFlushScheduledRef.current = true;
        ensureWbDrainPolling();
        return;
      }
      const encoded = await encodeRtcPayload(payload, { compress: options?.compress, thresholdBytes: 4000 });
      const size = encoded.length;
      if (size > 200_000) console.warn("[Whiteboard] large message", size);
      if (size > 8_000) {
        if (dc.bufferedAmount > 24_000 && options?.coalesceScene && payload?.kind === "scene") {
          wbPendingSceneRef.current = { seq: payload.seq, elements: payload.elements };
          wbFlushScheduledRef.current = true;
          ensureWbDrainPolling();
          return;
        }
        const messageId = `${participantRole}-${Date.now()}-${++wbMessageIdRef.current}`;
        const chunks = chunkEncodedRtcPayload(messageId, encoded, 8_000);
        for (const chunk of chunks) {
          if (!wbDataChannelRef.current || wbDataChannelRef.current.readyState !== "open") break;
          if (dc.bufferedAmount > 48_000 && options?.coalesceScene && payload?.kind === "scene") {
            wbPendingSceneRef.current = { seq: payload.seq, elements: payload.elements };
            wbFlushScheduledRef.current = true;
            ensureWbDrainPolling();
            return;
          }
          dc.send(JSON.stringify({ kind: "chunk", ...chunk }));
        }
        return;
      }
      dc.send(encoded);
    } catch (err) {
      console.warn("[Whiteboard] send failed", err);
    }
  };

  // Handle data arriving from iPad bridge: apply locally + forward to call peer
  bridgeDataHandlerRef.current = (msg: any) => {
    if (msg.kind === "scene" || msg.kind === "scene-delta") {
      wbHandleRef.current?.applyRemoteScene(msg.elements || [], undefined);
      void sendWb(msg);
    }
    // Pointer from iPad: don't show cursor (same person), don't forward
  };

  const toggleWhiteboard = async () => {
    const next = !whiteboardOpen;
    // Mutual exclusion: stop screen sharing first if opening whiteboard while sharing
    if (next && isScreenSharing) {
      await stopScreenShare();
      toast({ title: "Stopped screen sharing to open whiteboard" });
    }
    setWhiteboardOpen(next);
    sendWb({ kind: "toggle", open: next });

    // Bitrate transition only on open/close edge — never on a recurring interval.
    // Open: clamp video to 500 kbps so the whiteboard data channel has headroom.
    // Close: restore 2.5 Mbps if the 10s ramp completed, otherwise 1.0 Mbps.
    if (next) {
      applyVideoMaxBitrate(500_000);
    } else {
      applyVideoMaxBitrate(videoRampCompleteRef.current ? 2_500_000 : 1_000_000);
    }

    logTelemetry(next ? "whiteboard_opened" : "whiteboard_closed", { initiator: participantRole });
  };

  const handleWbLocalChange = useCallback((elements: any[]) => {
    const fullSnapshot = wbHandleRef.current?.getElementsSnapshot?.() || elements;
    // Compute delta vs last sent versions. Excalidraw bumps `version` on any
    // mutation (incl. setting isDeleted=true tombstones), so version-equality
    // is sufficient to detect "unchanged".
    const versions = wbLastSentVersionsRef.current;
    const delta: any[] = [];
    for (const e of fullSnapshot) {
      if (!e || !e.id) continue;
      const v = e.version ?? 0;
      if (versions.get(e.id) !== v) delta.push(e);
    }
    if (delta.length === 0) return;
    // Update baseline for every element in the snapshot, not just delta —
    // keeps the map accurate even if Excalidraw ever omits unchanged ids.
    for (const e of fullSnapshot) {
      if (e?.id) versions.set(e.id, e.version ?? 0);
    }
    wbSceneSeqRef.current += 1;
    wbLastAppliedLocalSeqRef.current = wbSceneSeqRef.current;
    void sendWb({ kind: "scene-delta", seq: wbSceneSeqRef.current, elements: delta });
    bridgeSendRef.current({ kind: "scene-delta", elements: delta });
  }, []);

  const handleWbPointer = useCallback((p: { x: number; y: number; button: "down" | "up" }) => {
    const now = Date.now();
    if (now - wbPointerLastSendRef.current < 50) return;
    wbPointerLastSendRef.current = now;
    void sendWb({ kind: "pointer", ...p });
  }, []);

  const peerLabel = peerRole;

  return (
    <div ref={containerRef} data-in-call="true" className="fixed inset-0 z-50 bg-foreground/95 overflow-hidden flex flex-col">
      <div className="flex-1 min-h-0 flex">
      <div className={`relative bg-black ${studentDetailsOpen ? "flex-1 min-w-0" : "flex-1"}`}>
        {/* Remote video — fills the area normally; a draggable, dismissible PiP
            tile when the whiteboard is open so it never blocks the drawing. */}
        {whiteboardOpen ? (
          <DraggablePiP sizeClassName="w-28 sm:w-44 aspect-video">
            <video ref={setRemoteVideoEl} autoPlay playsInline className="w-full h-full object-contain pointer-events-none" />
          </DraggablePiP>
        ) : (
          <div className="absolute inset-0">
            <video ref={setRemoteVideoEl} autoPlay playsInline className="w-full h-full object-contain" />
          </div>
        )}

        {/* Whiteboard fills main area when open */}
        {whiteboardOpen && (
          <WhiteboardPanel
            ref={wbHandleRef}
            onLocalChange={handleWbLocalChange}
            onPointerUpdate={handleWbPointer}
            remoteRole={peerLabel}
          />
        )}
        {/* Peer camera off overlay */}
        {isConnected && peerCameraOff && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center text-white/70">
              <VideoOffIcon className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                {peerLabel.charAt(0).toUpperCase() + peerLabel.slice(1)} has their camera off
              </p>
            </div>
          </div>
        )}
        {!isConnected && !peerDisconnected && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-white/80">
              <div className="animate-pulse text-lg mb-2">
                {connectionStalled
                  ? `Having trouble connecting to ${peerLabel}. Tap Reconnect to try again.`
                  : isReconnecting
                    ? `Reconnecting to ${peerLabel}…`
                    : peerPresent
                      ? `Connecting to ${peerLabel}…`
                      : `Waiting for ${peerLabel} to join...`}
              </div>
              <p className="text-sm text-white/50">{formatTime(waitingSeconds)}</p>
              {/* Backstop only: the manual Reconnect appears solely when our own
                  auto-recovery has signalled likely failure with the peer present
                  (connectionStalled). It is never shown on a timer and never while
                  waiting alone — initial connect is fully automatic. */}
              {connectionStalled && (
                <button
                  type="button"
                  disabled={isReconnecting}
                  onClick={manualReconnect}
                  className="mt-3 rounded-md border border-white/30 bg-white/10 px-4 py-1.5 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-60"
                >
                  {isReconnecting ? "Reconnecting…" : "Reconnect"}
                </button>
              )}
              {peerOnPage && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-green-500/20 px-3 py-1 text-sm text-green-300">
                  <span className="h-2 w-2 rounded-full bg-green-400 animate-ping" />
                  Your {peerLabel} is on their page — they haven't joined yet
                </div>
              )}
            </div>
          </div>
        )}
        {/* Local self-view — draggable + dismissible so it never blocks content.
            Hidden while the whiteboard is open (remote PiP takes its place). */}
        {!whiteboardOpen && (
          <DraggablePiP sizeClassName="w-24 sm:w-36 aspect-video">
            <video
              ref={setLocalVideoEl}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover pointer-events-none"
              style={{ transform: isScreenSharing ? "none" : "scaleX(-1)" }}
            />
          </DraggablePiP>
        )}
        {isConnected && (
          <div className="absolute top-3 left-3 bg-black/60 text-white text-xs px-3 py-1 rounded-full">
            {formatTime(elapsedSeconds)}
          </div>
        )}
        {isScreenSharing && (
          <div className="absolute top-3 right-3 bg-blue-600 text-white text-xs px-3 py-1 rounded-full">
            Sharing Screen
          </div>
        )}
        {audioOnly && !isConnected && (
          <div className="absolute bottom-12 left-3 bg-yellow-600 text-white text-xs px-3 py-1 rounded-full">
            Audio Only
          </div>
        )}
        {/* Weak network banner — attributed to specific party */}
        {(() => {
          if (!isConnected || weakNetworkDismissed) return null;
          const selfWeak = myUplinkBad;
          const partnerWeak = peerUplinkBad;
          if (!selfWeak && !partnerWeak) return null;
          const partnerLabel = `your ${peerRole}`;
          let message: string;
          if (selfWeak && partnerWeak) {
            message = `Both connections look weak. Turning off cameras on both sides will improve audio quality.`;
          } else if (selfWeak) {
            message = `Your internet looks weak. Consider turning off your camera so ${partnerLabel} can still hear you clearly.`;
          } else {
            message = `Your ${peerRole}'s internet looks weak. Ask them to turn off their camera, or turn off yours, for clearer audio.`;
          }
          return (
            <div className="absolute bottom-12 left-3 right-3 flex items-center gap-2 bg-yellow-600/90 text-white text-xs px-3 py-2 rounded-lg">
              <Wifi className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="flex-1">{message}</span>
              <button
                onClick={switchToAudioOnly}
                className="ml-1 flex-shrink-0 rounded-md bg-white/20 hover:bg-white/30 px-2 py-1 font-medium whitespace-nowrap"
              >
                Switch to audio only
              </button>
              <button onClick={() => setWeakNetworkDismissed(true)} className="ml-1 hover:opacity-80">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })()}

        {/* Chat panel — full width on mobile, fixed side panel on larger screens.
            Same chat + transport as the dashboard (48h persisted, via Supabase). */}
        {chatOpen && (
          <div className="absolute top-0 right-0 bottom-0 w-full sm:w-72 bg-card/95 backdrop-blur border-l flex flex-col z-40 px-3 pb-2">
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-sm font-semibold text-card-foreground">Chat</span>
              <button onClick={() => { setChatOpen(false); pairChat.setActive(false); }} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <PairChatThread
              messages={pairChat.messages}
              selfRole={participantRole}
              loading={pairChat.loading}
              onSend={pairChat.send}
              compact
            />
          </div>
        )}
      </div>

      {/* Peer-info side panel — app-provided business UI via the peerInfo slot
          (e.g. course health). Hidden on mobile to keep the call full-bleed. */}
      {studentDetailsOpen && slots?.peerInfo && !isMobile && (
        <div className="w-[380px] shrink-0 bg-white overflow-y-auto flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">Details</h3>
            <button
              type="button"
              onClick={() => setStudentDetailsOpen(false)}
              className="inline-flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 h-7 w-7 transition-colors"
              aria-label="Close details"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {slots.peerInfo}
          </div>
        </div>
      )}
      </div>

      {/* Desktop + tablet toolbar (>=768px) — unchanged. Mobile (<768px) gets a
          condensed bar below with overflow in a triple-dot menu. */}
      {!isMobile && (
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 p-2 sm:p-3 bg-black/80">
        <Button variant="ghost" size="icon" className={`rounded-full ${isMuted ? "bg-destructive text-white" : "text-white hover:bg-white/20"}`} onClick={toggleMute}>
          {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </Button>
        {!audioOnly && (
          <Button variant="ghost" size="icon" className={`rounded-full ${isCameraOff ? "bg-destructive text-white" : "text-white hover:bg-white/20"}`} onClick={toggleCamera}>
            {isCameraOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className={`rounded-full ${isScreenSharing ? "bg-blue-600 text-white" : "text-white hover:bg-white/20"}`}
          onClick={toggleScreenShare}
          title={isScreenSharing ? "Stop sharing" : "Share screen"}
        >
          {isScreenSharing ? <MonitorOff className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={`rounded-full ${whiteboardOpen ? "bg-primary text-primary-foreground" : "text-white hover:bg-white/20"}`}
          onClick={toggleWhiteboard}
          title={whiteboardOpen ? "Close Whiteboard" : "Whiteboard"}
        >
          <SquarePen className="h-5 w-5" />
        </Button>
        <Button variant="destructive" size="icon" className="rounded-full" onClick={() => handleEndCall()}>
          <PhoneOff className="h-5 w-5" />
        </Button>
        {/* Chat button with unread dot */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className={`rounded-full ${chatOpen ? "bg-primary text-primary-foreground" : "text-white hover:bg-white/20"}`}
            onClick={() => { const next = !chatOpen; setChatOpen(next); pairChat.setActive(next); }}
            title="Chat"
          >
            <MessageSquare className="h-5 w-5" />
          </Button>
          {pairChat.unread && !chatOpen && (
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-destructive ring-2 ring-background" />
          )}
        </div>
        <Popover open={showDevicePicker} onOpenChange={setShowDevicePicker}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full text-white hover:bg-white/20" title="Audio & Video Settings">
              <Settings className="h-5 w-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-4" side="top" align="center">
            <div className="space-y-4">
              <h4 className="text-sm font-semibold">Audio & Video Settings</h4>
              {audioDevices.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Microphone</Label>
                  <Select value={selectedMic} onValueChange={switchMicrophone}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select microphone" />
                    </SelectTrigger>
                    <SelectContent>
                      {audioDevices.map((d) => (
                        <SelectItem key={d.deviceId} value={d.deviceId} className="text-xs">
                          {d.label || `Microphone ${audioDevices.indexOf(d) + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {audioOutputDevices.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Speaker</Label>
                  <Select value={selectedSpeaker} onValueChange={switchSpeaker}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select speaker" />
                    </SelectTrigger>
                    <SelectContent>
                      {audioOutputDevices.map((d) => (
                        <SelectItem key={d.deviceId} value={d.deviceId} className="text-xs">
                          {d.label || `Speaker ${audioOutputDevices.indexOf(d) + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {audioDevices.length === 0 && audioOutputDevices.length === 0 && (
                <p className="text-xs text-muted-foreground">No audio devices found.</p>
              )}
              {slots?.peerInfo && !isMobile && (
                <div className="pt-2 border-t border-border">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-xs h-8"
                    onClick={() => {
                      setStudentDetailsOpen(!studentDetailsOpen);
                      setShowDevicePicker(false);
                    }}
                  >
                    <Settings className="h-3.5 w-3.5 mr-2" />
                    {studentDetailsOpen ? "Hide details" : "Details"}
                  </Button>
                </div>
              )}
              {whiteboardOpen && (
                <div className={`pt-2 ${slots?.peerInfo ? "" : "border-t border-border"}`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-xs h-8"
                    onClick={() => {
                      if (!bridgeKey) {
                        const key = generateBridgeKey();
                        setBridgeKey(key);
                        setBridgeSessionId(sessionIdRef.current);
                      }
                      setShareModalOpen(true);
                      setShowDevicePicker(false);
                    }}
                  >
                    <Tablet className="h-3.5 w-3.5 mr-2" />
                    Connect another screen
                  </Button>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
        <Button variant="ghost" size="icon" className="rounded-full text-white hover:bg-white/20" onClick={toggleFullscreen}>
          {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
        </Button>
      </div>
      )}

      {/* Mobile toolbar (<768px) — only Mic, Camera, Chat, End Call visible;
          everything else lives in the triple-dot overflow menu. */}
      {isMobile && (
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 p-2 sm:p-3 bg-black/80">
        <Button variant="ghost" size="icon" className={`rounded-full ${isMuted ? "bg-destructive text-white" : "text-white hover:bg-white/20"}`} onClick={toggleMute}>
          {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </Button>
        {!audioOnly && (
          <Button variant="ghost" size="icon" className={`rounded-full ${isCameraOff ? "bg-destructive text-white" : "text-white hover:bg-white/20"}`} onClick={toggleCamera}>
            {isCameraOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
          </Button>
        )}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className={`rounded-full ${chatOpen ? "bg-primary text-primary-foreground" : "text-white hover:bg-white/20"}`}
            onClick={() => { const next = !chatOpen; setChatOpen(next); pairChat.setActive(next); }}
            title="Chat"
          >
            <MessageSquare className="h-5 w-5" />
          </Button>
          {pairChat.unread && !chatOpen && (
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-destructive ring-2 ring-background" />
          )}
        </div>
        <Button variant="destructive" size="icon" className="rounded-full" onClick={() => handleEndCall()}>
          <PhoneOff className="h-5 w-5" />
        </Button>
        {/* Overflow: screen share, whiteboard, A/V settings, connect screen, fullscreen */}
        <Popover open={showDevicePicker} onOpenChange={setShowDevicePicker}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full text-white hover:bg-white/20" title="More options">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" side="top" align="center">
            <div className="space-y-1">
              <Button
                variant="ghost"
                size="sm"
                className={`w-full justify-start text-xs h-9 ${isScreenSharing ? "text-blue-600" : ""}`}
                onClick={() => { toggleScreenShare(); setShowDevicePicker(false); }}
              >
                {isScreenSharing ? <MonitorOff className="h-4 w-4 mr-2" /> : <Monitor className="h-4 w-4 mr-2" />}
                {isScreenSharing ? "Stop sharing" : "Share screen"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={`w-full justify-start text-xs h-9 ${whiteboardOpen ? "text-primary" : ""}`}
                onClick={() => { toggleWhiteboard(); setShowDevicePicker(false); }}
              >
                <SquarePen className="h-4 w-4 mr-2" />
                {whiteboardOpen ? "Close Whiteboard" : "Whiteboard"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs h-9"
                onClick={() => { toggleFullscreen(); setShowDevicePicker(false); }}
              >
                {isFullscreen ? <Minimize2 className="h-4 w-4 mr-2" /> : <Maximize2 className="h-4 w-4 mr-2" />}
                {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              </Button>
              {whiteboardOpen && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-xs h-9"
                  onClick={() => {
                    if (!bridgeKey) {
                      const key = generateBridgeKey();
                      setBridgeKey(key);
                      setBridgeSessionId(sessionIdRef.current);
                    }
                    setShareModalOpen(true);
                    setShowDevicePicker(false);
                  }}
                >
                  <Tablet className="h-4 w-4 mr-2" />
                  Connect another screen
                </Button>
              )}
              <div className="pt-2 mt-1 border-t border-border space-y-2">
                <h4 className="text-xs font-semibold px-1">Audio &amp; Video</h4>
                {audioDevices.length > 0 && (
                  <div className="space-y-1.5 px-1">
                    <Label className="text-xs text-muted-foreground">Microphone</Label>
                    <Select value={selectedMic} onValueChange={switchMicrophone}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select microphone" />
                      </SelectTrigger>
                      <SelectContent>
                        {audioDevices.map((d) => (
                          <SelectItem key={d.deviceId} value={d.deviceId} className="text-xs">
                            {d.label || `Microphone ${audioDevices.indexOf(d) + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {audioOutputDevices.length > 0 && (
                  <div className="space-y-1.5 px-1">
                    <Label className="text-xs text-muted-foreground">Speaker</Label>
                    <Select value={selectedSpeaker} onValueChange={switchSpeaker}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select speaker" />
                      </SelectTrigger>
                      <SelectContent>
                        {audioOutputDevices.map((d) => (
                          <SelectItem key={d.deviceId} value={d.deviceId} className="text-xs">
                            {d.label || `Speaker ${audioOutputDevices.indexOf(d) + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {audioDevices.length === 0 && audioOutputDevices.length === 0 && (
                  <p className="text-xs text-muted-foreground px-1">No audio devices found.</p>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      )}

      {/* Mid-call reconnect — non-blocking pill (NOT a modal). Recovery is fully
          automatic via the serialized controller; the user makes no choice. The
          call UI + toolbar (incl. End Call) stay usable underneath. Auto-clears
          the instant the connection is restored. */}
      {peerDisconnected && !isConnected && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-black/80 text-white text-sm px-4 py-2 rounded-full shadow-lg max-w-[92%]">
          <span className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse flex-shrink-0" />
          <span>
            {reconnectEscalated
              ? `Still trying to reconnect to ${peerLabel} — this may be your or their internet.`
              : `Reconnecting to ${peerLabel}…`}
          </span>
          {/* Terminal off-ramp: after a long stall, give an explicit way out so no
              one is stuck watching the spinner. Auto-reconnect keeps running until
              then; the toolbar End Call is always available too. Ending lets them
              rejoin fresh from the dashboard. */}
          {reconnectEscalated && (
            <button
              type="button"
              onClick={() => handleEndCall()}
              className="flex-shrink-0 rounded-md border border-white/30 bg-white/15 px-3 py-1 text-xs font-medium text-white hover:bg-white/25"
            >
              End &amp; rejoin
            </button>
          )}
        </div>
      )}

      {/* Connection-strength widget — 3 bars, lower-left. Shows the WORSE of the
          two directions so both peers see the same color. */}
      {isConnected && (() => {
        const color =
          connStrength === "red" ? "#ef4444" :
          connStrength === "yellow" ? "#f59e0b" : "#10b981";
        const label =
          connStrength === "red" ? "Poor connection" :
          connStrength === "yellow" ? "Fair connection" : "Good connection";
        return (
          <div
            className="absolute bottom-3 left-3 z-20 flex items-end gap-[2px]"
            role="img"
            aria-label={label}
            title={label}
          >
            {[6, 9, 12].map((h) => (
              <span
                key={h}
                className="w-[3px] rounded-full"
                style={{ height: h, backgroundColor: color, filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,0.55))" }}
              />
            ))}
          </div>
        );
      })()}

      {/* No-show prompt */}
      {showNoShowPrompt && !isConnected && !peerDisconnected && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-10">
          <div className="bg-card rounded-xl p-6 shadow-2xl border max-w-sm text-center">
            <h3 className="text-lg font-semibold text-card-foreground mb-1">
              Still waiting...
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Your {peerLabel} hasn't joined yet. Would you like to keep waiting?
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => { setShowNoShowPrompt(false); noShowSnoozedAtRef.current = Date.now(); }}>
                Keep Waiting
              </Button>
              <Button variant="destructive" onClick={() => handleEndCall()}>
                End Call
              </Button>
            </div>
          </div>
        </div>
      )}
      <ShareToDeviceModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        url={bridgeKey && bridgeSessionId && buildBridgeUrl
          ? buildBridgeUrl({ sessionId: bridgeSessionId, role: participantRole, bridgeKey })
          : ""}
      />
      {/* Self-contained toaster so in-call toasts work without consumer wiring. */}
      <Toaster />
    </div>
  );
};
