// lib/customerClaim/otpCrypto.ts
import { createHash, randomInt, timingSafeEqual } from "crypto";

const PEPPER = () =>
  process.env.CUSTOMER_CLAIM_OTP_PEPPER || "dev-only-change-in-production";

/** OTP numerico a 6 cifre. */
export function generateOtpDigits(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function hashOtp(otpDigits: string): string {
  return createHash("sha256")
    .update(`${PEPPER()}:${otpDigits.trim()}`)
    .digest("hex");
}

export function hashClaimOtp(otpDigits: string): string {
  return hashOtp(otpDigits);
}

export function verifyClaimOtp(otpDigits: string, storedHash: string): boolean {
  const a = Buffer.from(hashOtp(otpDigits), "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
