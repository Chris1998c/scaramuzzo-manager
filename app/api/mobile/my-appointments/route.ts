import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Body = {
  staff_id?: number;
};

type AppointmentRowRaw = {
  id: number;
  start_time: string;
  end_time: string | null;
  status: string | null;
  customers: { first_name: string | null; last_name: string | null } | null;
  service_id: number | null;
  services: { name: string | null } | null;
  appointment_services:
    | Array<{
        id?: number | string;
        services: { name: string | null } | null;
      }>
    | null;
};

function customerFullName(c: AppointmentRowRaw["customers"]): string {
  if (!c) return "Cliente";
  const full = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
  return full || "Cliente";
}

function serviceNamesFromAppointment(row: AppointmentRowRaw): string[] {
  const names: string[] = [];
  const lines = Array.isArray(row.appointment_services)
    ? [...row.appointment_services].sort((a, b) => {
        const idA = Number(a?.id ?? 0);
        const idB = Number(b?.id ?? 0);
        return idA - idB;
      })
    : [];
  for (const line of lines) {
    const n = line?.services?.name;
    if (n != null && String(n).trim() !== "") names.push(String(n).trim());
  }
  if (names.length === 0) {
    const legacy = row?.services?.name;
    if (legacy != null && String(legacy).trim() !== "") names.push(String(legacy).trim());
  }
  return names;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const staffId = Number(body.staff_id);

    if (!Number.isInteger(staffId) || staffId <= 0) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const [{ data: headRows, error: headErr }, { data: lineRows, error: lineErr }] =
      await Promise.all([
        supabaseAdmin.from("appointments").select("id").eq("staff_id", staffId),
        supabaseAdmin
          .from("appointment_services")
          .select("appointment_id")
          .eq("staff_id", staffId),
      ]);

    if (headErr) {
      console.error("my-appointments appointments id lookup:", headErr.message);
    }
    if (lineErr) {
      console.error("my-appointments appointment_services id lookup:", lineErr.message);
    }

    const idSet = new Set<number>();
    if (!headErr) {
      for (const r of headRows ?? []) {
        const id = Number((r as { id?: unknown }).id);
        if (Number.isInteger(id) && id > 0) idSet.add(id);
      }
    }
    if (!lineErr) {
      for (const r of lineRows ?? []) {
        const id = Number((r as { appointment_id?: unknown }).appointment_id);
        if (Number.isInteger(id) && id > 0) idSet.add(id);
      }
    }

    if (idSet.size === 0) {
      return NextResponse.json({ success: true, rows: [] });
    }

    const { data: appts, error: apptsErr } = await supabaseAdmin
      .from("appointments")
      .select(
        `
          id,
          start_time,
          end_time,
          status,
          customers:customer_id (
            first_name,
            last_name
          ),
          service_id,
          services:service_id (
            name
          ),
          appointment_services:appointment_services (
            id,
            services:service_id (
              name
            )
          )
        `,
      )
      .in("id", Array.from(idSet))
      .order("start_time", { ascending: true })
      .order("id", { foreignTable: "appointment_services", ascending: true });

    if (apptsErr) {
      console.error("my-appointments fetch:", apptsErr.message);
      return NextResponse.json({ error: "Failed to load appointments" }, { status: 500 });
    }

    const rows = ((appts ?? []) as unknown as AppointmentRowRaw[]).map((a) => ({
      id: Number(a.id),
      start_time: a.start_time,
      end_time: a.end_time,
      status: a.status ?? null,
      customer_name: customerFullName(a.customers),
      services: serviceNamesFromAppointment(a),
    }));

    return NextResponse.json({ success: true, rows });
  } catch (error) {
    console.error("mobile my-appointments error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
