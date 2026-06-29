// Public API for webrtc-core.
// The call engine (RtcCall) is lifted in Task #2; until then this exports the
// stable public contract (types) so consumers and the demo can be wired.

export type {
  RtcCallProps,
  CallParticipant,
  CallLifecycleEvent,
  TelemetrySink,
  CallFeatures,
  CallRenderSlots,
} from "./types";

export { RtcCall } from "./call/RtcCall";

// In-call chat primitives (also usable standalone by consumers).
export { usePairChat, makeSystemMessage, type ChatMessage } from "./chat/usePairChat";
export { PairChatThread } from "./chat/PairChatThread";

// Whiteboard bridge (iPad/tablet secondary peer) for consumers building the
// secondary-device page.
export { useBridgeCanvas } from "./whiteboard/useBridgeCanvas";
export { WhiteboardPanel, type WhiteboardHandle } from "./whiteboard/WhiteboardPanel";
export { generateBridgeKey, bridgeChannelName } from "./lib/canvasBridge";
