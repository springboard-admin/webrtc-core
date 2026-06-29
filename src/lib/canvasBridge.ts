// "Canvas" here = the whiteboard drawing surface bridge (iPad/tablet secondary
// peer), NOT Canvas LMS. Pure helpers, no external deps.

export function generateBridgeKey(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function bridgeChannelName(sessionId: string, role: string, key: string): string {
  return `bridge-${sessionId}-${role}-${key}`;
}
