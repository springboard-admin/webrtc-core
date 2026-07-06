/**
 * WebRTC Diagnostics — observer-only telemetry for triaging connection failures.
 *
 * Safety guarantees:
 * - Never throws. All errors are silently swallowed.
 * - Never mutates the RTCPeerConnection — only attaches passive event listeners.
 * - All DB writes are fire-and-forget (no awaits that block call lifecycle).
 * - Buffer is capped to prevent runaway memory.
 *
 * Extracted to webrtc-core: the Supabase client + REST config are INJECTED
 * (the core never imports the app's client / Vite env), and the "did the other
 * party join" check is role-agnostic via the generic `call_participants` table.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_EVENTS = 200;
const NO_MEDIA_TIMEOUT_MS = 30000;

type DiagEvent = {
  t: number; // ms since diagnostics start
  type: string;
  data?: Record<string, any>;
};

type Outcome = "success" | "failed" | "disconnected" | "no_media" | "timeout";

/** Injected so the library never imports the app's client or build-time env. */
export interface DiagnosticsConfig {
  supabase: SupabaseClient;
  /** REST base URL + anon key, used only for the keepalive beacon on pagehide. */
  restUrl: string;
  restKey: string;
  /** Consuming app's bundle version — stamped into the diagnostics environment. */
  appVersion?: string;
}

const isValidUUID = (s: string | null | undefined): boolean =>
  !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

const safeCall = (fn: () => void) => {
  try {
    fn();
  } catch {
    // silently swallow — diagnostics must never break the call
  }
};

export class WebRTCDiagnostics {
  private events: DiagEvent[] = [];
  private startTime = Date.now();
  private callId: string | null = null;
  private participantId: string;
  private participantRole: string;
  private pc: RTCPeerConnection;
  private cfg: DiagnosticsConfig;
  private firstConnectedAt: number | null = null;
  private gotRemoteTrack = false;
  private noMediaTimer: ReturnType<typeof setTimeout> | null = null;
  private flushed = false;
  private candidateTypesSeen = new Set<string>();
  private remoteCandidateTypesSeen = new Set<string>();
  private selectedCandidatePair: { local?: string; remote?: string; protocol?: string } = {};

  constructor(pc: RTCPeerConnection, participantId: string, participantRole: string, cfg: DiagnosticsConfig) {
    this.pc = pc;
    this.participantId = participantId;
    this.participantRole = participantRole;
    this.cfg = cfg;
    this.attachListeners();
    this.startNoMediaTimer();
  }

  setCallId(callId: string | null) {
    if (isValidUUID(callId)) {
      this.callId = callId;
    }
  }

  private push(type: string, data?: Record<string, any>) {
    safeCall(() => {
      if (this.events.length >= MAX_EVENTS) return;
      this.events.push({
        t: Date.now() - this.startTime,
        type,
        data,
      });
    });
  }

  private attachListeners() {
    safeCall(() => {
      const pc = this.pc;

      pc.addEventListener("iceconnectionstatechange", () => {
        const state = pc.iceConnectionState;
        this.push("ice_connection_state", { state });
        if ((state === "connected" || state === "completed") && !this.firstConnectedAt) {
          this.firstConnectedAt = Date.now() - this.startTime;
        }
      });

      pc.addEventListener("icegatheringstatechange", () => {
        this.push("ice_gathering_state", { state: pc.iceGatheringState });
      });

      pc.addEventListener("signalingstatechange", () => {
        this.push("signaling_state", { state: pc.signalingState });
      });

      pc.addEventListener("connectionstatechange", () => {
        this.push("connection_state", { state: pc.connectionState });
      });

      pc.addEventListener("icecandidate", (e: any) => {
        if (e.candidate) {
          const c = e.candidate;
          if (c.type) this.candidateTypesSeen.add(c.type);
          this.push("local_ice_candidate", {
            type: c.type,
            protocol: c.protocol,
            address: c.address,
            port: c.port,
            relatedAddress: c.relatedAddress,
            relatedPort: c.relatedPort,
            relayProtocol: c.relayProtocol,
          });
        } else {
          this.push("local_ice_candidate_end");
        }
      });

      pc.addEventListener("icecandidateerror", (e: any) => {
        this.push("ice_candidate_error", {
          errorCode: e.errorCode,
          errorText: e.errorText,
          url: e.url,
          hostCandidate: e.hostCandidate ? "[present]" : undefined,
        });
      });

      pc.addEventListener("track", (e: any) => {
        this.gotRemoteTrack = true;
        this.push("remote_track", {
          kind: e.track?.kind,
          readyState: e.track?.readyState,
          muted: e.track?.muted,
        });
        this.clearNoMediaTimer();
      });

      pc.addEventListener("negotiationneeded", () => {
        this.push("negotiation_needed");
      });
    });
  }

  /** Note remote ICE candidate types (called when receiving via signaling). */
  noteRemoteCandidate(candidateInit: RTCIceCandidateInit) {
    safeCall(() => {
      // Parse candidate string: "candidate:... typ host|srflx|prflx|relay ..."
      const match = candidateInit.candidate?.match(/typ (\w+)/);
      if (match) {
        this.remoteCandidateTypesSeen.add(match[1]);
      }
    });
  }

  private startNoMediaTimer() {
    safeCall(() => {
      this.noMediaTimer = setTimeout(() => {
        if (!this.gotRemoteTrack && !this.flushed) {
          this.push("no_media_timeout", { afterMs: NO_MEDIA_TIMEOUT_MS });
          this.flush("no_media");
        }
      }, NO_MEDIA_TIMEOUT_MS);
    });
  }

  private clearNoMediaTimer() {
    if (this.noMediaTimer) {
      clearTimeout(this.noMediaTimer);
      this.noMediaTimer = null;
    }
  }

  private async collectStatsSnapshot(): Promise<Record<string, any>> {
    const snapshot: Record<string, any> = {};
    try {
      const stats = await this.pc.getStats();
      stats.forEach((report: any) => {
        if (report.type === "candidate-pair" && report.state === "succeeded" && report.nominated) {
          // Find local + remote candidates for the selected pair
          const local = stats.get(report.localCandidateId);
          const remote = stats.get(report.remoteCandidateId);
          this.selectedCandidatePair = {
            local: local?.candidateType,
            remote: remote?.candidateType,
            protocol: local?.protocol,
          };
          snapshot.selected_local_type = local?.candidateType;
          snapshot.selected_remote_type = remote?.candidateType;
          snapshot.selected_protocol = local?.protocol;
          snapshot.selected_relay_protocol = local?.relayProtocol;
          snapshot.current_rtt_ms = report.currentRoundTripTime
            ? Math.round(report.currentRoundTripTime * 1000)
            : null;
          snapshot.bytes_sent = report.bytesSent;
          snapshot.bytes_received = report.bytesReceived;
        }
      });
    } catch {
      // ignore
    }
    return snapshot;
  }

  private getBrowserFingerprint(): string | undefined {
    try {
      const KEY = "webrtc_browser_fingerprint";
      let fp = localStorage.getItem(KEY);
      if (!fp) {
        fp = (crypto as any).randomUUID
          ? (crypto as any).randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        localStorage.setItem(KEY, fp);
      }
      return fp;
    } catch {
      return undefined;
    }
  }

  private getEnvironment(): Record<string, any> {
    const env: Record<string, any> = {};
    safeCall(() => {
      env.userAgent = navigator.userAgent;
      env.platform = (navigator as any).platform;
      env.language = navigator.language;
      const conn = (navigator as any).connection;
      if (conn) {
        env.effectiveType = conn.effectiveType;
        env.downlink = conn.downlink;
        env.rtt = conn.rtt;
      }
      env.onLine = navigator.onLine;
      env.host = window.location.hostname;
      env.browser_fingerprint = this.getBrowserFingerprint();
      // Pin every diagnostic to the exact consumer bundle that produced it.
      if (this.cfg.appVersion) env.app_version = this.cfg.appVersion;
    });
    return env;
  }

  /**
   * Check whether the *other* participant has joined the call.
   * Role-agnostic: any participant in `call_participants` for this call whose
   * id differs from ours and who has a joined_at. Fail-safe to false.
   */
  private async didOtherPartyJoin(): Promise<boolean> {
    try {
      if (!isValidUUID(this.callId)) return false;
      const { data, error } = await this.cfg.supabase
        .from("call_participants")
        .select("participant_id, joined_at")
        .eq("call_id", this.callId!);
      if (error || !data) return false;
      return (data as any[]).some((p) => p.participant_id !== this.participantId && !!p.joined_at);
    } catch {
      return false;
    }
  }

  /**
   * Flush diagnostics to DB. Fire-and-forget — never blocks.
   * Safe to call multiple times; only first call writes.
   */
  flush(outcome: Outcome) {
    // fire-and-forget wrapper around flushAsync
    void this.flushAsync(outcome);
  }

  /**
   * Flush via fetch keepalive so the browser guarantees delivery even when
   * the page is being unloaded (e.g. user closes the tab). Use this in
   * pagehide/beforeunload handlers instead of flush().
   */
  flushBeacon(outcome: Outcome) {
    try {
      if (this.flushed) return;
      if (!isValidUUID(this.callId)) return;
      this.flushed = true;
      this.clearNoMediaTimer();

      const usedRelay =
        this.selectedCandidatePair.local === "relay" ||
        this.selectedCandidatePair.remote === "relay";

      const summary = {
        outcome,
        got_remote_track: this.gotRemoteTrack,
        time_to_connect_ms: this.firstConnectedAt,
        total_duration_ms: Date.now() - this.startTime,
        final_ice_state: this.safeGet(() => this.pc.iceConnectionState),
        final_connection_state: this.safeGet(() => this.pc.connectionState),
        final_signaling_state: this.safeGet(() => this.pc.signalingState),
        local_candidate_types: Array.from(this.candidateTypesSeen),
        remote_candidate_types: Array.from(this.remoteCandidateTypesSeen),
        selected_pair: this.selectedCandidatePair,
        turn_relay_used: usedRelay,
        environment: this.getEnvironment(),
      };

      fetch(`${this.cfg.restUrl}/rest/v1/webrtc_diagnostics`, {
        method: "POST",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
          "apikey": this.cfg.restKey,
          "Authorization": `Bearer ${this.cfg.restKey}`,
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          call_id: this.callId,
          participant_id: this.participantId,
          participant_role: this.participantRole,
          outcome,
          events: this.events,
          summary,
        }),
      }).catch(() => {/* swallow */});
    } catch {
      // never throw from pagehide handler
    }
  }

  /**
   * Awaitable flush. Resolves once the DB insert completes (or is silently dropped).
   * Safe to call multiple times; only first call writes. Never throws.
   */
  async flushAsync(outcome: Outcome): Promise<void> {
    if (this.flushed) return;
    this.flushed = true;
    this.clearNoMediaTimer();

    try {
      if (!isValidUUID(this.callId)) {
        // No call_id yet — can't satisfy NOT NULL constraint. Drop silently.
        return;
      }

      // Suppress false-positive "no_media" when the other party never joined.
      if (outcome === "no_media") {
        const otherJoined = await this.didOtherPartyJoin();
        if (!otherJoined) return;
      }

      const statsSnapshot = await this.collectStatsSnapshot();

      const usedRelay =
        this.selectedCandidatePair.local === "relay" ||
        this.selectedCandidatePair.remote === "relay";

      const summary = {
        outcome,
        got_remote_track: this.gotRemoteTrack,
        time_to_connect_ms: this.firstConnectedAt,
        total_duration_ms: Date.now() - this.startTime,
        final_ice_state: this.safeGet(() => this.pc.iceConnectionState),
        final_connection_state: this.safeGet(() => this.pc.connectionState),
        final_signaling_state: this.safeGet(() => this.pc.signalingState),
        local_candidate_types: Array.from(this.candidateTypesSeen),
        remote_candidate_types: Array.from(this.remoteCandidateTypesSeen),
        selected_pair: this.selectedCandidatePair,
        turn_relay_used: usedRelay,
        environment: this.getEnvironment(),
        ...statsSnapshot,
      };

      await this.cfg.supabase.from("webrtc_diagnostics" as any).insert({
        call_id: this.callId,
        participant_id: this.participantId,
        participant_role: this.participantRole,
        outcome,
        events: this.events as any,
        summary: summary as any,
      });
    } catch {
      // never throw
    }
  }


  private safeGet<T>(fn: () => T): T | null {
    try {
      return fn();
    } catch {
      return null;
    }
  }

  /** Detach (no-op for passive listeners; pc.close() removes them). */
  destroy() {
    this.clearNoMediaTimer();
  }
}
