// C:\dev\scaramuzzo-manager\lib\appointmentTime.ts

// yyyy-mm-dd dal timestamp (es: "2026-01-07T09:30:00")
export function dayFromTs(ts: string) {
  return String(ts).split("T")[0];
}

// HH:MM dal timestamp (es: "2026-01-07T09:30:00" -> "09:30")
export function timeFromTs(ts: string) {
  const t = String(ts).split("T")[1] || "";
  return t.slice(0, 5);
}