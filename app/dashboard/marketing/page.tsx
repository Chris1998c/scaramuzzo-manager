import { redirect } from "next/navigation";
import { getUserAccess } from "@/lib/getUserAccess";
import MarketingWhatsAppClient from "@/components/marketing/MarketingWhatsAppClient";

export default async function MarketingPage() {
  const access = await getUserAccess();
  if (access.role === "cliente") redirect("/dashboard");

  return <MarketingWhatsAppClient />;
}
