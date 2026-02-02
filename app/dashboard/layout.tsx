import { DashboardShell } from "@/components/DashboardShell";

import { ActiveSalonProvider } from "@/app/providers/ActiveSalonProvider";
import { getUserAccess } from "@/lib/getUserAccess";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getUserAccess();

  return (
    <ActiveSalonProvider
     role={access.role}
      allowedSalonIds={access.allowedSalonIds}
      allowedSalons={access.allowedSalons}
      defaultSalonId={access.defaultSalonId}
    >
      <DashboardShell>{children}</DashboardShell>
    </ActiveSalonProvider>
  );
}
