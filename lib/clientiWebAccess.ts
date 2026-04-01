import "server-only";

import type { RoleName } from "@/lib/getUserAccess";
import { canAccessMarketingWeb } from "@/lib/marketingWebAccessShared";

/** Lista + dettaglio clienti nel Manager: stesso perimetro di Marketing manuale (`canAccessMarketingWeb`). */
export function canAccessClientiWeb(role: RoleName): boolean {
  return canAccessMarketingWeb(role);
}
