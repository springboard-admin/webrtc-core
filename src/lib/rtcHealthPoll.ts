import type { SupabaseClient } from "@supabase/supabase-js";

const POLL_INTERVAL_MS = 5_000;

interface PollOptions {
  /** Injected Supabase client (core never imports the app's client). */
  supabase: SupabaseClient;
  callId: string;
  participantId: string;
  participantRole: string;
  label: string; // "main" | "bridge-host" | "bridge-ipad"
  pc: RTCPeerConnection;
  dcRef?: { current: RTCDataChannel | null };
}

function getCandidatePairStats(report: RTCStatsReport) {
  for (const [, stat] of report) {
    if (stat.type === "candidate-pair" && (stat as any).nominated) {
      return stat as any;
    }
  }
  for (const [, stat] of report) {
    if (stat.type === "candidate-pair" && stat.state === "succeeded") {
      return stat as any;
    }
  }
  return null;
}

function getCandidateType(report: RTCStatsReport, candidateId: string | undefined): string {
  if (!candidateId) return "unknown";
  const c = report.get(candidateId) as any;
  return c?.candidateType ?? "unknown";
}

function getTransportStats(report: RTCStatsReport) {
  for (const [, stat] of report) {
    if (stat.type === "transport") return stat as any;
  }
  return null;
}

// Inbound video: did the remote video track actually arrive and decode?
function getInboundVideo(report: RTCStatsReport) {
  for (const [, stat] of report) {
    if (stat.type === "inbound-rtp" && (stat as any).kind === "video") return stat as any;
  }
  return null;
}

// Outbound video: are we actually sending video frames?
function getOutboundVideo(report: RTCStatsReport) {
  for (const [, stat] of report) {
    if (stat.type === "outbound-rtp" && (stat as any).kind === "video") return stat as any;
  }
  return null;
}

export function startRtcHealthPoll(opts: PollOptions): () => void {
  const { supabase, callId, participantId, participantRole, label, pc, dcRef } = opts;
  let prevBytesSent = 0;
  let prevBytesRecv = 0;
  let prevTimestamp = Date.now();
  let stopped = false;
  let seq = 0;

  const poll = async () => {
    if (stopped) return;
    try {
      const report = await pc.getStats();
      const pair = getCandidatePairStats(report);
      const transport = getTransportStats(report);
      const inVideo = getInboundVideo(report);
      const outVideo = getOutboundVideo(report);
      const now = Date.now();
      const elapsed = (now - prevTimestamp) / 1000;

      const localType = pair ? getCandidateType(report, pair.localCandidateId) : "none";
      const remoteType = pair ? getCandidateType(report, pair.remoteCandidateId) : "none";

      const bytesSent = pair?.bytesSent ?? 0;
      const bytesRecv = pair?.bytesReceived ?? 0;
      const sendRate = elapsed > 0 ? Math.round((bytesSent - prevBytesSent) / elapsed) : 0;
      const recvRate = elapsed > 0 ? Math.round((bytesRecv - prevBytesRecv) / elapsed) : 0;
      prevBytesSent = bytesSent;
      prevBytesRecv = bytesRecv;
      prevTimestamp = now;

      seq++;

      const row: Record<string, unknown> = {
        seq,
        label,
        iceState: pc.iceConnectionState,
        connState: pc.connectionState,
        sigState: pc.signalingState,
        localCandidateType: localType,
        remoteCandidateType: remoteType,
        rttMs: pair?.currentRoundTripTime != null ? Math.round(pair.currentRoundTripTime * 1000) : null,
        packetsLost: pair?.packetsLost ?? null,
        packetsSent: pair?.packetsSent ?? null,
        sendBps: sendRate,
        recvBps: recvRate,
        dtlsState: transport?.dtlsState ?? null,
        // Inbound video: framesDecoded climbing => remote video is decoding.
        // Stuck at 0 with packetsReceived>0 => arriving but not decodable.
        inVidFramesDecoded: inVideo?.framesDecoded ?? null,
        inVidFramesReceived: inVideo?.framesReceived ?? null,
        inVidPacketsReceived: inVideo?.packetsReceived ?? null,
        inVidW: inVideo?.frameWidth ?? null,
        inVidH: inVideo?.frameHeight ?? null,
        // Outbound video: framesSent climbing => we are actually sending video.
        outVidFramesSent: outVideo?.framesSent ?? null,
        outVidFramesEncoded: outVideo?.framesEncoded ?? null,
      };

      if (dcRef) {
        const dc = dcRef.current;
        row.dcState = dc ? dc.readyState : "null";
        row.dcBuffered = dc?.bufferedAmount ?? null;
      }

      supabase
        .from("call_telemetry")
        .insert({
          call_id: callId,
          participant_id: participantId,
          participant_role: participantRole,
          event_type: `rtc_health_${label}`,
          metadata: row as any,
        })
        .then(({ error }: { error: { message: string } | null }) => {
          if (error) console.warn(`[rtcHealth:${label}] insert failed`, error.message);
        });
    } catch {
      // getStats can throw if PC is closed
    }
  };

  const id = setInterval(poll, POLL_INTERVAL_MS);
  poll();

  return () => {
    stopped = true;
    clearInterval(id);
  };
}
