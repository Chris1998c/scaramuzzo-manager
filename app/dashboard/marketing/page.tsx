import { redirect } from "next/navigation";
import { getUserAccess } from "@/lib/getUserAccess";
import { canAccessMarketingWeb } from "@/lib/marketingWebAccessShared";
import MarketingWhatsAppClient from "@/components/marketing/MarketingWhatsAppClient";

export default async function MarketingPage() {
  const access = await getUserAccess();
  if (!canAccessMarketingWeb(access.role)) redirect("/dashboard");

  const aiCopyAssistAvailable = Boolean(process.env.OPENAI_API_KEY?.trim());

  return (
    <MarketingWhatsAppClient aiCopyAssistAvailable={aiCopyAssistAvailable} />
  );
}
