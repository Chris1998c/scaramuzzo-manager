export type StaffSettingsRow = {
  id: number;
  salon_id: number;
  staff_code: string;
  name: string;
  role: string;
  phone: string | null;
  email: string | null;
  active: boolean;
  user_id: string | null;
  internal_id: number | null;
  mobile_enabled: boolean;
  has_mobile_pin: boolean;
  /** Saloni in staff_salons (include sempre salon_id primario dopo enrich). */
  associated_salon_ids: number[];
  /** Giorni ISO 1–7 attivi in staff_schedule sul salone primario; vuoto = tutti i giorni. */
  schedule_active_days: number[];
};

export const STAFF_ROLE_OPTIONS = [
  "stylist",
  "reception",
  "estetista",
  "assistant",
  "manager",
] as const;

export const STAFF_ROLE_LABELS: Record<(typeof STAFF_ROLE_OPTIONS)[number], string> = {
  stylist: "Stylist",
  reception: "Reception",
  estetista: "Estetista",
  assistant: "Assistant",
  manager: "Manager",
};

export const STAFF_WEEKDAYS: { iso: number; short: string; label: string }[] = [
  { iso: 1, short: "Lun", label: "Lunedì" },
  { iso: 2, short: "Mar", label: "Martedì" },
  { iso: 3, short: "Mer", label: "Mercoledì" },
  { iso: 4, short: "Gio", label: "Giovedì" },
  { iso: 5, short: "Ven", label: "Venerdì" },
  { iso: 6, short: "Sab", label: "Sabato" },
  { iso: 7, short: "Dom", label: "Domenica" },
];
