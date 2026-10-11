import crypto from "crypto";

/**
 * Timing-safe string comparison using crypto.timingSafeEqual.
 * Returns false if either value is empty.
 * Pads both buffers to the same length before comparison to prevent
 * length oracle attacks — timingSafeEqual always runs regardless of length.
 */
export function secureCompare(a: string, b: string): boolean {
  if (!a || !b) return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  const len = Math.max(aBuf.length, bBuf.length);
  const padA = Buffer.concat([aBuf, Buffer.alloc(len - aBuf.length)]);
  const padB = Buffer.concat([bBuf, Buffer.alloc(len - bBuf.length)]);
  return aBuf.length === bBuf.length && crypto.timingSafeEqual(padA, padB);
}
