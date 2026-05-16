// lib/customerClaim/otpCrypto.ts
import { createHash, randomInt, timingSafeEqual } from "crypto";

import { resolveCustomerClaimOtpPepper } from "@/lib/customerClaimConfig";

function requireOtpPepper(): string {
  const resolved = resolveCustomerClaimOtpPepper();
  if (!resolved.ok) {
    throw new Error(resolved.code);
  }
  return resolved.pepper;
}

/** OTP numerico a 6 cifre. */
export function generateOtpDigits(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function hashOtp(otpDigits: string, pepper: string): string {
  return createHash("sha256")
    .update(`${pepper}:${otpDigits.trim()}`)
    .digest("hex");
}

export function hashClaimOtp(otpDigits: string): string {
  return hashOtp(otpDigits, requireOtpPepper());
}

export function verifyClaimOtp(otpDigits: string, storedHash: string): boolean {
  const pepper = requireOtpPepper();
  const a = Buffer.from(hashOtp(otpDigits, pepper), "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
