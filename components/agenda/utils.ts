// components/agenda/utils.ts

/* ----------------------------------------- */
/*           GENERA ORE GIORNALIERE          */
/* ----------------------------------------- */

export function generateHours(start: string, end: string, step: number): string[] {
  const res: string[] = [];
  let [h, m] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);

  while (h < endH || (h === endH && m <= endM)) {
    res.push(`${pad(h)}:${pad(m)}`);
    m += step;
    if (m >= 60) {
      m -= 60;
      h++;
    }
  }
  return res;
}

/* ----------------------------------------- */
/*           ORA → MINUTI                    */
/* ----------------------------------------- */

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/* ----------------------------------------- */
/*           MINUTI → ORA                    */
/* ----------------------------------------- */

export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${pad(h)}:${pad(m)}`;
}

/* ----------------------------------------- */
/*      POSIZIONE BOX IN PIXEL                */
/* ----------------------------------------- */

export function getBoxTop(time: string, hours: string[], slotPx = 40) {
  const index = hours.indexOf(time);
  return index * slotPx;
}

/* ----------------------------------------- */
/*      ALTEZZA BOX IN PIXEL                  */
/* ----------------------------------------- */

export function getBoxHeight(duration: number, step = 30, slotPx = 40) {
  return (duration / step) * slotPx;
}

/* ----------------------------------------- */
/*      SOMMA DURATE DI PIÙ SERVIZI           */
/* ----------------------------------------- */

export function sumDurations(services: any[]) {
  return services
    .map((s) => s?.duration || 0)
    .reduce((a, b) => a + b, 0);
}

/* ----------------------------------------- */
/*      GENERA I 7 GIORNI DELLA SETTIMANA     */
/* ----------------------------------------- */

export function generateWeekDays(): { label: string; date: string }[] {
  const today = new Date();
  const res: any[] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - today.getDay() + i + 1);

    res.push({
      label: d.toLocaleDateString("it-IT", {
        weekday: "short",
        day: "numeric",
      }),
      date: d.toISOString().split("T")[0],
    });
  }

  return res;
}

/* ----------------------------------------- */
/*      PROSSIMA ORA LIBERA PER STAFF         */
/* ----------------------------------------- */

export function findNextAvailable(
  appointments: any[],
  hours: string[],
  stepMin = 30
): string | null {
  const bookedTimes = appointments.map((a) => a.time);
  for (let h of hours) {
    if (!bookedTimes.includes(h)) return h;
  }
  return null;
}

/* ----------------------------------------- */
/*      UTILITY PAD                           */
/* ----------------------------------------- */

function pad(n: number) {
  return String(n).padStart(2, "0");
}
