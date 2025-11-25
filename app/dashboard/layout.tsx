import "../globals.css";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabaseServer";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen bg-[#1b0d08] text-[#f5e7d6]">

      {/* SIDEBAR */}
      <aside className="w-72 bg-[#341A09]/90 border-r border-[#5c3a21] backdrop-blur-xl p-6 flex flex-col shadow-xl">
        {/* Logo */}
        <div className="text-5xl font-bold tracking-wider text-[#f3d8b6] mb-10">
          S
        </div>

        {/* MENU */}
        <nav className="flex flex-col space-y-4 text-lg font-medium">
          <SidebarLink href="/dashboard" title="Dashboard" icon="🏠" />
          <SidebarLink href="/dashboard/magazzino" title="Magazzino" icon="📦" />
          <SidebarLink href="/dashboard/movimenti" title="Movimenti" icon="🔁" />
          <SidebarLink href="/dashboard/trasferimenti" title="Trasferimenti" icon="🚚" />
          <SidebarLink href="/dashboard/prodotti" title="Prodotti" icon="🧴" />
          <SidebarLink href="/dashboard/report" title="Report" icon="📊" />
          <SidebarLink href="/dashboard/staff" title="Staff & Permessi" icon="👥" />
        </nav>
      </aside>

      {/* CONTENT */}
      <main className="flex-1 flex flex-col">

        {/* HEADER TOP */}
        <header className="w-full h-20 bg-[#341A09]/60 backdrop-blur-xl border-b border-[#5c3a21] px-8 flex items-center justify-between shadow-md">
          <h1 className="text-2xl font-semibold tracking-wide">
            Scaramuzzo Manager
          </h1>

          <div className="flex items-center space-x-4">
            <span className="text-[#d8c3ab]">{user?.email}</span>
            <form action="/api/auth/logout" method="post">
              <button className="px-4 py-2 rounded-lg bg-[#5c3a21] hover:bg-[#764b2a] transition">
                Logout
              </button>
            </form>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <div className="p-10">{children}</div>
      </main>
    </div>
  );
}

/* COMPONENTE LINK SIDEBAR */
function SidebarLink({
  href,
  title,
  icon,
}: {
  href: string;
  title: string;
  icon: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center space-x-3 px-3 py-3 rounded-lg hover:bg-[#5c3a21]/40 transition group"
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-[#f3d8b6] group-hover:text-white transition">
        {title}
      </span>
    </Link>
  );
}
