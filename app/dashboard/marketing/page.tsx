import { redirect } from "next/navigation";
import { getUserAccess } from "@/lib/getUserAccess";
import { canAccessMarketingWeb } from "@/lib/marketingWebAccessShared";
import MarketingWhatsAppClient from "@/components/marketing/MarketingWhatsAppClient";
import { isAiFeaturesEnabled } from "@/lib/ai/aiFeaturesGate";

export default async function MarketingPage() {
  const access = await getUserAccess();
  if (!canAccessMarketingWeb(access.role)) redirect("/dashboard");

  // Assistenza bozze disattivata al lancio finché SCARAMUZZO_AI_FEATURES_ENABLED=true.
  const aiCopyAssistAvailable =
    isAiFeaturesEnabled() && Boolean(process.env.OPENAI_API_KEY?.trim());

  return (
    <MarketingWhatsAppClient aiCopyAssistAvailable={aiCopyAssistAvailable} />
  );
}
