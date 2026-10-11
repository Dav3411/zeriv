/**
 * encoding.workerClient.ts — HTTP client for the encoding Python worker (port 8800).
 */

import type {
  EncodingWorkerRequest,
  EncodingWorkerResponse,
} from "@/lib/encoding/encoding.types";

const ENCODING_WORKER_URL =
  (process.env.ENCODING_WORKER_URL ?? "http://localhost:8800").replace(/\/$/, "");
const TIMEOUT_MS = 15 * 60 * 1000; // 15 min

async function post<T>(endpoint: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ENCODING_WORKER_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      throw new Error(`Encoding worker ${endpoint} → ${res.status}: ${detail}`);
    }
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

export async function runEncoding(
  req: EncodingWorkerRequest
): Promise<EncodingWorkerResponse> {
  return post<EncodingWorkerResponse>("/encode", req);
}

export async function retryEncoding(
  req: EncodingWorkerRequest
): Promise<EncodingWorkerResponse> {
  return post<EncodingWorkerResponse>("/retry", req);
}
