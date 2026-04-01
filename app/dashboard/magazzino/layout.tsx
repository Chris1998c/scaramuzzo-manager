import { redirect } from "next/navigation";
import { getUserAccess } from "@/lib/getUserAccess";
import { canAccessMagazzinoWeb } from "@/lib/magazzinoWebAccess";

export default async function MagazzinoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getUserAccess();
  if (!canAccessMagazzinoWeb(access.role)) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
