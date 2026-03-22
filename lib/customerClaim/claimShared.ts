// lib/customerClaim/claimShared.ts
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type LinkBlock = "customer_already_linked" | "user_already_linked";

export async function findCustomerByCode(customerCode: string) {
  return supabaseAdmin
    .from("customers")
    .select("id, phone")
    .eq("customer_code", customerCode)
    .maybeSingle();
}

export async function getLinkBlock(
  customerId: string,
  userId: string
): Promise<
  | { ok: true; block: LinkBlock | null }
  | { ok: false }
> {
  const { data: linkByCustomer, error: e1 } = await supabaseAdmin
    .from("customer_auth_links")
    .select("id")
    .eq("customer_id", customerId)
    .maybeSingle();

  if (e1) return { ok: false };

  if (linkByCustomer) return { ok: true, block: "customer_already_linked" };

  const { data: linkByUser, error: e2 } = await supabaseAdmin
    .from("customer_auth_links")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (e2) return { ok: false };

  if (linkByUser) return { ok: true, block: "user_already_linked" };
  return { ok: true, block: null };
}

export function phoneUsableForOtp(phone: string | null | undefined): boolean {
  if (phone == null) return false;
  const t = String(phone).replace(/\s+/g, "").trim();
  return t.length >= 8;
}

const OTP_TTL_MS = 10 * 60_000;
const MAX_VERIFY_ATTEMPTS = 5;

export function claimOtpExpiresAtIso(): string {
  return new Date(Date.now() + OTP_TTL_MS).toISOString();
}

export { OTP_TTL_MS, MAX_VERIFY_ATTEMPTS };
