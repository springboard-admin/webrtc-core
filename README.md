# webrtc-core

Reusable WebRTC **call core** for Canvas-LMS call apps — the hard-won call engine
extracted from production: media + device handling, offer/answer/ICE signaling over
Supabase Realtime, reconnect & late-join resilience, mobile OS-suspend recovery,
health/diagnostics telemetry, whiteboard, screen-share, and in-call chat.

The core is **role-agnostic** (a participant is just `{ id, role: string }`) and
carries **no business logic** (no mentor/student/Canvas/scheduling concepts).

## Install (git dependency, pinned tag)

No registry. Consumers pin a tag:

```jsonc
// package.json
"dependencies": {
  "webrtc-core": "github:springboard-admin/webrtc-core#v0.1.0"
}
```

## Peer dependencies

The consuming app provides these (so there's a single React tree + Supabase client):

- `react` / `react-dom` ^18
- `@supabase/supabase-js` ^2

## Usage

```tsx
import { RtcCall } from "webrtc-core";
import "@excalidraw/excalidraw/index.css"; // whiteboard styles

<RtcCall
  supabase={supabase}
  roomId={callRoomId}
  self={{ id: myId, role: "student" }}   // role is any string
  peerRole="coach"
  signalingRole="initiator"
  onLifecycle={(e) => {/* persist your own session record */}}
/>
```

Styling uses Tailwind utility classes (shadcn convention). Consumers must:
- have **Tailwind** configured to scan the lib: add `./node_modules/webrtc-core/dist/**/*.js` to `content`;
- define the shadcn **CSS design tokens** (`--primary`, `--background`, …) in their global CSS;
- import **Excalidraw CSS** for the whiteboard: `import "@excalidraw/excalidraw/index.css"`.

(See `sample-rtcweb-consumer-app` for a complete working setup.)

## What the core owns

Given your Supabase client + `roomId`, the core does its own realtime signaling and
writes the **generic** tables: `call_telemetry`, `webrtc_diagnostics`, and
`call_participants` (`call_id, participant_id, role, joined_at, left_at, connected_at`).
It never writes app/business tables — those stay in the consumer, driven by
`onLifecycle`.

## Status

Phase 0 — scaffolding. Engine lift in progress (see the consuming app's plan).

---

**Note:** this library is extracted *from* the `mentor-spark-link` app by **copying**;
that app is never modified during extraction.
