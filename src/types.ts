import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReactNode } from "react";

/**
 * A call participant. `role` is an opaque string — the core never interprets it
 * (mentor | student | coach | advisor | …). Used for telemetry, the generic
 * `call_participants` table, and deterministic signaling.
 */
export interface CallParticipant {
  id: string;
  role: string;
}

/** Lifecycle events the core emits so the consuming app can persist its own
 * business records (e.g. this app's legacy `call_sessions` role columns). */
export type CallLifecycleEvent =
  | { type: "joined"; at: number }
  | { type: "peerConnected"; at: number }
  | { type: "connected"; at: number }
  | { type: "reconnecting"; at: number }
  | { type: "ended"; at: number; wasConnected: boolean; reason: string }
  | { type: "failed"; at: number; reason: string };

/** Optional extra telemetry sink. The core ALSO writes `call_telemetry` itself
 * (core owns Supabase); this is for apps that want to mirror events elsewhere. */
export type TelemetrySink = (eventType: string, metadata?: Record<string, unknown>) => void;

/** Toggle which call features are active. All on by default. */
export interface CallFeatures {
  whiteboard?: boolean;
  screenShare?: boolean;
  chat?: boolean;
  /** iPad/tablet secondary-peer whiteboard bridge. */
  bridge?: boolean;
}

/** Optional app-provided UI rendered inside the call shell. Keeps business UI
 * (e.g. a peer-info / course-health panel) out of the core. */
export interface CallRenderSlots {
  /** App business UI shown in the right-hand details panel (e.g. course health). */
  peerInfo?: ReactNode;
  /** Title for the peerInfo panel header + its settings-popover toggle. Defaults to "Details". */
  peerInfoTitle?: string;
  /** Icon for the peerInfo toggle in the settings popover. Defaults to a gear. */
  peerInfoIcon?: ReactNode;
  /** Rendered in the overflow menu (e.g. "share to device"). */
  overflowMenu?: ReactNode;
  /**
   * App-owned side panel rendered in the same right-hand container as the
   * built-in chat panel (e.g. an app chat that also lives outside the call).
   * The render prop receives `close` so the panel can dismiss itself. Opening
   * it closes the built-in chat panel and vice versa.
   */
  sidePanel?: (ctx: { close: () => void }) => ReactNode;
  /**
   * Toolbar toggle for `sidePanel`; the button is hidden unless both are set.
   * `showBadge` renders the same unread dot the built-in chat button uses.
   */
  sidePanelButton?: { icon: ReactNode; title?: string; showBadge?: boolean };
}

/** The public props for the core call component. */
export interface RtcCallProps {
  /** App-provided Supabase client (single shared instance). */
  supabase: SupabaseClient;
  /** Stable room id. Drives the realtime channel and is the telemetry `call_id`. */
  roomId: string;
  /** This client's identity + opaque role. */
  self: CallParticipant;
  /** The role we expect on the other side (for labels/telemetry). */
  peerRole: string;
  /** Deterministic offerer/answerer so both sides agree who sends the first offer. */
  signalingRole: "initiator" | "responder";
  /** Display name for this user, used in the "X is trying to join" chat ping. */
  selfName?: string;
  /** Optional display name for the peer (e.g. student first name). Used in the
   * waiting/connecting copy; falls back to a capitalized `peerRole` if omitted. */
  peerName?: string;
  /** Build version of the consuming app's bundle. Stamped into webrtc_diagnostics
   * so every row is pinned to the exact bundle per participant ("stale client"
   * becomes a query, not forensics). */
  appVersion?: string;
  features?: CallFeatures;
  slots?: CallRenderSlots;
  /**
   * Builds the URL a secondary device (iPad) opens to join the whiteboard
   * bridge — app-specific (it points at the consumer's bridge/canvas route).
   * If omitted, the "share to device" control is hidden.
   */
  buildBridgeUrl?: (info: { sessionId: string; role: string; bridgeKey: string }) => string;
  onLifecycle?: (event: CallLifecycleEvent) => void;
  onTelemetry?: TelemetrySink;
  /** Called when the user ends the call (so the app can show post-call UI). */
  onCallEnd?: (opts: { wasConnected: boolean }) => void;
}
