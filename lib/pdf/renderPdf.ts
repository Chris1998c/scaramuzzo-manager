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

function isWebReadableStream(x: unknown): x is ReadableStream<Uint8Array> {
  return (
    typeof x === "object" &&
    x !== null &&
    "getReader" in x &&
    typeof (x as any).getReader === "function"
  );
}

function isArrayBuffer(x: unknown): x is ArrayBuffer {
  return typeof ArrayBuffer !== "undefined" && x instanceof ArrayBuffer;
}

function isBlob(x: unknown): x is Blob {
  return (
    typeof Blob !== "undefined" &&
    typeof x === "object" &&
    x !== null &&
    "arrayBuffer" in x &&
    typeof (x as any).arrayBuffer === "function"
  );
}

function isNodeReadable(x: unknown): x is NodeJS.ReadableStream {
  return (
    typeof x === "object" &&
    x !== null &&
    "pipe" in x &&
    typeof (x as any).pipe === "function"
  );
}

async function nodeReadableToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on("data", (c: Buffer | Uint8Array) =>
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))
    );
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

export async function renderPdfToBuffer(document: ReactElement): Promise<Buffer> {
  const instance = pdf(document as any);

  const result = (await instance.toBuffer()) as unknown;

  if (Buffer.isBuffer(result)) return result;

  if (result instanceof Uint8Array) return Buffer.from(result);

  if (isArrayBuffer(result)) return Buffer.from(result);

  if (isBlob(result)) {
    const ab = await result.arrayBuffer();
    return Buffer.from(ab);
  }

  if (isWebReadableStream(result)) return readableStreamToBuffer(result);

  if (isNodeReadable(result)) return nodeReadableToBuffer(result);

  // fallback: alcune versioni ritornano { data: Uint8Array } o simili
  if (
    typeof result === "object" &&
    result !== null &&
    "data" in result &&
    (result as any).data instanceof Uint8Array
  ) {
    return Buffer.from((result as any).data);
  }

  throw new Error(
    "renderPdfToBuffer: output non supportato da @react-pdf/renderer"
  );
}