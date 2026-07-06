import { SupabaseClient } from '@supabase/supabase-js';
import * as react from 'react';
import { ReactNode } from 'react';

/**
 * A call participant. `role` is an opaque string — the core never interprets it
 * (mentor | student | coach | advisor | …). Used for telemetry, the generic
 * `call_participants` table, and deterministic signaling.
 */
interface CallParticipant {
    id: string;
    role: string;
}
/** Lifecycle events the core emits so the consuming app can persist its own
 * business records (e.g. this app's legacy `call_sessions` role columns). */
type CallLifecycleEvent = {
    type: "joined";
    at: number;
} | {
    type: "peerConnected";
    at: number;
} | {
    type: "connected";
    at: number;
} | {
    type: "reconnecting";
    at: number;
} | {
    type: "ended";
    at: number;
    wasConnected: boolean;
    reason: string;
} | {
    type: "failed";
    at: number;
    reason: string;
};
/** Optional extra telemetry sink. The core ALSO writes `call_telemetry` itself
 * (core owns Supabase); this is for apps that want to mirror events elsewhere. */
type TelemetrySink = (eventType: string, metadata?: Record<string, unknown>) => void;
/** Toggle which call features are active. All on by default. */
interface CallFeatures {
    whiteboard?: boolean;
    screenShare?: boolean;
    chat?: boolean;
    /** iPad/tablet secondary-peer whiteboard bridge. */
    bridge?: boolean;
}
/** Optional app-provided UI rendered inside the call shell. Keeps business UI
 * (e.g. a peer-info / course-health panel) out of the core. */
interface CallRenderSlots {
    /** Rendered in the in-call header/toolbar area (e.g. peer info button). */
    peerInfo?: ReactNode;
    /** Rendered in the overflow menu (e.g. "share to device"). */
    overflowMenu?: ReactNode;
}
/** The public props for the core call component. */
interface RtcCallProps {
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
    buildBridgeUrl?: (info: {
        sessionId: string;
        role: string;
        bridgeKey: string;
    }) => string;
    onLifecycle?: (event: CallLifecycleEvent) => void;
    onTelemetry?: TelemetrySink;
    /** Called when the user ends the call (so the app can show post-call UI). */
    onCallEnd?: (opts: {
        wasConnected: boolean;
    }) => void;
}

declare const RtcCall: ({ supabase, roomId, self, peerRole, signalingRole, selfName, peerName, appVersion, features, slots, buildBridgeUrl, onLifecycle, onTelemetry, onCallEnd, }: RtcCallProps) => react.JSX.Element;

declare const makeSystemMessage: (text: string) => string;
interface ChatMessage {
    id: string;
    pair_id: string;
    sender_role: string;
    sender_id: string;
    body: string;
    created_at: string;
}
interface PairChat {
    messages: ChatMessage[];
    unread: boolean;
    loading: boolean;
    /** Mark the chat view as visible/hidden. Loading + mark-read happen on show. */
    setActive: (active: boolean) => void;
    markRead: () => void;
    /** Returns true on success. */
    send: (text: string) => Promise<boolean>;
}
declare function usePairChat(supabase: SupabaseClient, roomId: string, selfRole: string, selfId: string): PairChat;

interface PairChatThreadProps {
    messages: ChatMessage[];
    /** Opaque role string — "mine" bubbles are messages whose sender_role === this. */
    selfRole: string;
    loading: boolean;
    onSend: (text: string) => Promise<boolean>;
    /** Compact styling for the in-call side panel. */
    compact?: boolean;
}
/**
 * Presentational chat thread: scrollable message list + input. Fills its
 * parent's height. Used inside the in-call panel.
 */
declare function PairChatThread({ messages, selfRole, loading, onSend, compact }: PairChatThreadProps): react.JSX.Element;

interface WhiteboardHandle {
    applyRemoteScene: (elements: any[], seq?: number) => void;
    applyRemotePointer: (p: {
        x: number;
        y: number;
        pointerId: string;
        button: "down" | "up";
    }) => void;
    getElementsSnapshot: () => any[];
    getVisibleElementsSnapshot: () => any[];
}
interface Props {
    onLocalChange: (elements: any[]) => void;
    onPointerUpdate?: (p: {
        x: number;
        y: number;
        button: "down" | "up";
    }) => void;
    /** Opaque role string for the remote collaborator's pointer label. */
    remoteRole: string;
    hideExport?: boolean;
}
declare const WhiteboardPanel: react.MemoExoticComponent<react.ForwardRefExoticComponent<Props & react.RefAttributes<WhiteboardHandle>>>;

type BridgeCanvasStatus = "connecting" | "connected" | "whiteboard-closed" | "session-ended";
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
    sendPointer: (p: {
        x: number;
        y: number;
        button: "down" | "up";
    }) => void;
}
declare function useBridgeCanvas({ supabase, sessionId, role, bridgeKey, wbHandle }: UseBridgeCanvasArgs): UseBridgeCanvasResult;

declare function generateBridgeKey(): string;
declare function bridgeChannelName(sessionId: string, role: string, key: string): string;

export { type CallFeatures, type CallLifecycleEvent, type CallParticipant, type CallRenderSlots, type ChatMessage, PairChatThread, RtcCall, type RtcCallProps, type TelemetrySink, type WhiteboardHandle, WhiteboardPanel, bridgeChannelName, generateBridgeKey, makeSystemMessage, useBridgeCanvas, usePairChat };
