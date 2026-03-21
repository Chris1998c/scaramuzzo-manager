"use server";

import { revalidatePath } from "next/cache";
import { getUserAccess } from "@/lib/getUserAccess";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type ServiceSettingsSaveResult =
  | { ok: true }
  | { ok: false; error: string };

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

async function assertCoordinatorAndSalon(salonId: number) {
  const access = await getUserAccess();
  if (access.role !== "coordinator") {
    return {
      ok: false as const,
      error: "Solo il ruolo coordinator può modificare il catalogo servizi.",
    };
  }
  if (!Number.isFinite(salonId) || salonId <= 0) {
    return { ok: false as const, error: "Salone non valido." };
  }
  if (!access.allowedSalonIds.includes(salonId)) {
    return { ok: false as const, error: "Non hai accesso a questo salone." };
  }
  return { ok: true as const, access };
}

type ServiceCoreFields = {
  name: string;
  category_id: number | null;
  duration: number;
  duration_active: number;
  duration_processing: number;
  need_processing: boolean;
  visible_in_agenda: boolean;
  visible_in_cash: boolean;
  color_code: string | null;
  active: boolean;
};

function normalizeCore(input: ServiceCoreFields) {
  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("Il nome è obbligatorio.");
  const duration = Math.max(0, Math.floor(Number(input.duration)));
  const duration_active = Math.max(0, Math.floor(Number(input.duration_active)));
  const duration_processing = Math.max(0, Math.floor(Number(input.duration_processing)));
  if (
    !Number.isFinite(duration) ||
    !Number.isFinite(duration_active) ||
    !Number.isFinite(duration_processing)
  ) {
    throw new Error("Durate non valide.");
  }
  let color = input.color_code?.trim() || null;
  if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
    color = null;
  }
  const cid = Number(input.category_id);
  const category_id =
    input.category_id != null && Number.isFinite(cid) && cid > 0 ? Math.floor(cid) : null;
  return {
    name,
    category_id,
    duration,
    duration_active,
    duration_processing,
    need_processing: !!input.need_processing,
    visible_in_agenda: !!input.visible_in_agenda,
    visible_in_cash: !!input.visible_in_cash,
    color_code: color,
    active: !!input.active,
  };
}

export async function createServiceWithSalonPriceAction(
  salonId: number,
  core: ServiceCoreFields,
  price: number,
): Promise<ServiceSettingsSaveResult> {
  const gate = await assertCoordinatorAndSalon(salonId);
  if (!gate.ok) return gate;

  const p = roundMoney(Number(price));
  if (!Number.isFinite(p) || p < 0) {
    return { ok: false, error: "Prezzo non valido." };
  }

  let coreRow: ReturnType<typeof normalizeCore>;
  try {
    coreRow = normalizeCore(core);
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Dati non validi." };
  }

  const insertRow = {
    ...coreRow,
    category_id: coreRow.category_id,
    price: p,
    vat_rate: 22,
  };

  const { data: created, error: insErr } = await supabaseAdmin
    .from("services")
    .insert(insertRow)
    .select("id")
    .single();

  if (insErr || !created?.id) {
    return { ok: false, error: insErr?.message ?? "Errore creazione servizio." };
  }

  const serviceId = Number(created.id);

  const { error: priceErr } = await supabaseAdmin.from("service_prices").insert({
    salon_id: salonId,
    service_id: serviceId,
    price: p,
  });

  if (priceErr) {
    await supabaseAdmin.from("services").delete().eq("id", serviceId);
    return { ok: false, error: priceErr.message };
  }

  revalidatePath("/dashboard/impostazioni");
  return { ok: true };
}

export async function updateServiceWithSalonPriceAction(
  serviceId: number,
  salonId: number,
  core: ServiceCoreFields,
  price: number,
): Promise<ServiceSettingsSaveResult> {
  const gate = await assertCoordinatorAndSalon(salonId);
  if (!gate.ok) return gate;

  if (!Number.isFinite(serviceId) || serviceId <= 0) {
    return { ok: false, error: "Servizio non valido." };
  }

  const p = roundMoney(Number(price));
  if (!Number.isFinite(p) || p < 0) {
    return { ok: false, error: "Prezzo non valido." };
  }

  let coreRow: ReturnType<typeof normalizeCore>;
  try {
    coreRow = normalizeCore(core);
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Dati non validi." };
  }

  const { error: upErr } = await supabaseAdmin
    .from("services")
    .update({
      name: coreRow.name,
      category_id: coreRow.category_id,
      duration: coreRow.duration,
      duration_active: coreRow.duration_active,
      duration_processing: coreRow.duration_processing,
      need_processing: coreRow.need_processing,
      visible_in_agenda: coreRow.visible_in_agenda,
      visible_in_cash: coreRow.visible_in_cash,
      color_code: coreRow.color_code,
      active: coreRow.active,
    })
    .eq("id", serviceId);

  if (upErr) {
    return { ok: false, error: upErr.message };
  }

  const { error: spErr } = await supabaseAdmin.from("service_prices").upsert(
    {
      salon_id: salonId,
      service_id: serviceId,
      price: p,
    },
    { onConflict: "salon_id,service_id" },
  );

  if (spErr) {
    return { ok: false, error: spErr.message };
  }

  revalidatePath("/dashboard/impostazioni");
  return { ok: true };
}
