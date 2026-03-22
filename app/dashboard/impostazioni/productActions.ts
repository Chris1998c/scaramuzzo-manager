"use server";

import { revalidatePath } from "next/cache";
import { getUserAccess } from "@/lib/getUserAccess";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type ProductSaveResult = { ok: true } | { ok: false; error: string };

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

async function assertCoordinatorOnly() {
  const access = await getUserAccess();
  if (access.role !== "coordinator") {
    return {
      ok: false as const,
      error: "Solo il ruolo coordinator può modificare l’anagrafica prodotti.",
    };
  }
  return { ok: true as const };
}

export type ProductPayload = {
  name: string;
  barcode: string | null;
  price: number;
  /** Null = non valorizzato in anagrafica (colonna `cost` NULL). */
  cost: number | null;
  active: boolean;
  category: string | null;
};

function normalizeProductPayload(input: ProductPayload) {
  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("Il nome è obbligatorio.");

  const price = roundMoney(Number(input.price));
  if (!Number.isFinite(price) || price < 0) {
    throw new Error("Prezzo non valido (≥ 0).");
  }

  let cost: number | null = null;
  if (input.cost != null) {
    const c = roundMoney(Number(input.cost));
    if (!Number.isFinite(c) || c < 0) throw new Error("Costo non valido (≥ 0).");
    cost = c;
  }

  let barcode: string | null = null;
  if (input.barcode != null && String(input.barcode).trim() !== "") {
    const b = String(input.barcode).trim();
    if (b.length > 128) throw new Error("Barcode troppo lungo (max 128).");
    if (/[\r\n\t]/.test(b)) throw new Error("Barcode non valido.");
    barcode = b;
  }

  let category: string | null = null;
  if (input.category != null && String(input.category).trim() !== "") {
    const c = String(input.category).trim();
    if (c.length > 200) throw new Error("Categoria troppo lunga.");
    category = c;
  }

  return {
    name,
    barcode,
    price,
    cost,
    active: !!input.active,
    category,
  };
}

export async function createProductAction(input: ProductPayload): Promise<ProductSaveResult> {
  const gate = await assertCoordinatorOnly();
  if (!gate.ok) return gate;

  let row: ReturnType<typeof normalizeProductPayload>;
  try {
    row = normalizeProductPayload(input);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Dati non validi.";
    return { ok: false, error: msg };
  }

  const { error } = await supabaseAdmin.from("products").insert({
    name: row.name,
    barcode: row.barcode,
    price: row.price,
    cost: row.cost,
    active: row.active,
    category: row.category,
    vat_rate: 22,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard/impostazioni");
  return { ok: true };
}

export async function updateProductAction(
  productId: number,
  input: ProductPayload,
): Promise<ProductSaveResult> {
  const gate = await assertCoordinatorOnly();
  if (!gate.ok) return gate;

  if (!Number.isFinite(productId) || productId <= 0) {
    return { ok: false, error: "Prodotto non valido." };
  }

  let row: ReturnType<typeof normalizeProductPayload>;
  try {
    row = normalizeProductPayload(input);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Dati non validi.";
    return { ok: false, error: msg };
  }

  const { error } = await supabaseAdmin
    .from("products")
    .update({
      name: row.name,
      barcode: row.barcode,
      price: row.price,
      cost: row.cost,
      active: row.active,
      category: row.category,
    })
    .eq("id", productId);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard/impostazioni");
  return { ok: true };
}
