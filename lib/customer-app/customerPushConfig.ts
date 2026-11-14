import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type PushConfig = { public_key: string | null; private_key: string | null; cron_secret: string | null };

export async function loadCustomerPushConfig(): Promise<PushConfig> {
  const { data, error } = await supabaseAdmin.rpc("customer_push_config_v1");
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as PushConfig | null;
  return row ?? { public_key: null, private_key: null, cron_secret: null };
}
