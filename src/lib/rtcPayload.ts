const decoder = new TextDecoder();

export interface RtcPayloadChunk {
  messageId: string;
  index: number;
  total: number;
  payloadType: "text";
  data: string;
}

export async function encodeRtcPayload(
  payload: unknown,
  _options?: { compress?: boolean; thresholdBytes?: number },
): Promise<string> {
  return JSON.stringify(payload);
}

export async function decodeRtcPayload(data: string | ArrayBuffer | Blob): Promise<any> {
  if (typeof data === "string") return JSON.parse(data);

  const text = data instanceof Blob ? await data.text() : decoder.decode(data);
  return JSON.parse(text);
}

export function chunkEncodedRtcPayload(
  messageId: string,
  encoded: string,
  chunkSize = 8_000,
): RtcPayloadChunk[] {
  const total = Math.max(1, Math.ceil(encoded.length / chunkSize));
  return Array.from({ length: total }, (_, index) => ({
    messageId,
    index,
    total,
    payloadType: "text" as const,
    data: encoded.slice(index * chunkSize, (index + 1) * chunkSize),
  }));
}

export async function decodeChunkedRtcPayload(chunks: RtcPayloadChunk[]): Promise<any> {
  if (!chunks.length) throw new Error("Missing RTC payload chunks");
  const ordered = [...chunks].sort((a, b) => a.index - b.index);
  return decodeRtcPayload(ordered.map((chunk) => chunk.data).join(""));
}
