// lib/pdf/renderPdf.ts
import { pdf } from "@react-pdf/renderer";
import type { ReactElement } from "react";

async function readableStreamToBuffer(
  stream: ReadableStream<Uint8Array>
): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }

  return Buffer.concat(chunks);
}

function isReadableStream(x: unknown): x is ReadableStream<Uint8Array> {
  return (
    typeof x === "object" &&
    x !== null &&
    "getReader" in x &&
    typeof (x as any).getReader === "function"
  );
}

export async function renderPdfToBuffer(document: ReactElement): Promise<Buffer> {
  const instance = pdf(document as any);

  const result = (await instance.toBuffer()) as unknown;

  if (Buffer.isBuffer(result)) return result;

  if (result instanceof Uint8Array) return Buffer.from(result);

  if (isReadableStream(result)) return readableStreamToBuffer(result);

  throw new Error("renderPdfToBuffer: output non supportato da @react-pdf/renderer");
}
