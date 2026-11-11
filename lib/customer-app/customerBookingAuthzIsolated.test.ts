import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * Due clienti / due sedi in Postgres isolato:
 * - overlap stesso staff/slot → un solo booking
 * - retry stesso insert fallisce sul trigger
 * - customer A non “vede” riga di B via filtro customer_id
 */
function dockerPsql(container: string, sql: string): string {
  const raw = execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A"],
    { input: sql, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(
      (l) =>
        l &&
        !/^(INSERT|UPDATE|DELETE|SELECT|CREATE|DROP|ALTER|BEGIN|COMMIT|ROLLBACK|NOTICE)\b/i.test(l),
    )
    .join("\n")
    .trim();
}

describe("customer booking authz + slot race (isolated Postgres)", () => {
  it(
    "due clienti due sedi: ownership + race stesso slot",
    () => {
      const name = `cust-book-${Date.now()}`;
      try {
        execFileSync(
          "docker",
          [
            "run",
            "-d",
            "--name",
            name,
            "-e",
            "POSTGRES_PASSWORD=postgres",
            "postgres:16-alpine",
          ],
          { stdio: ["ignore", "pipe", "pipe"] },
        );
        let ready = false;
        for (let i = 0; i < 30; i++) {
          try {
            execFileSync("docker", ["exec", name, "pg_isready", "-U", "postgres"], {
              stdio: ["ignore", "pipe", "pipe"],
            });
            ready = true;
            break;
          } catch {
            execFileSync("sleep", ["1"]);
          }
        }
        expect(ready).toBe(true);

        const q = (sql: string) => dockerPsql(name, sql);

        q(`
          CREATE TABLE salons (id int PRIMARY KEY, name text);
          CREATE TABLE customers (id uuid PRIMARY KEY, first_name text);
          CREATE TABLE staff (id int PRIMARY KEY, salon_id int REFERENCES salons(id), active boolean DEFAULT true);
          CREATE TABLE appointments (
            id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            salon_id int NOT NULL,
            customer_id uuid NOT NULL,
            staff_id int,
            start_time timestamp without time zone NOT NULL,
            end_time timestamp without time zone,
            status text NOT NULL DEFAULT 'scheduled',
            source text
          );
          CREATE TABLE appointment_services (
            id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            appointment_id bigint NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
            service_id int NOT NULL,
            staff_id int NOT NULL,
            start_time timestamp without time zone NOT NULL,
            duration_minutes int NOT NULL
          );

          -- Mini overlap guard (stesso staff, stesso salone, status scheduled)
          CREATE OR REPLACE FUNCTION enforce_slot() RETURNS trigger AS $$
          DECLARE v_salon int; v_status text; v_end timestamp;
          BEGIN
            SELECT salon_id, status INTO v_salon, v_status FROM appointments WHERE id = NEW.appointment_id;
            IF v_status IS DISTINCT FROM 'scheduled' THEN RETURN NEW; END IF;
            v_end := NEW.start_time + make_interval(mins => NEW.duration_minutes);
            IF EXISTS (
              SELECT 1
              FROM appointment_services s
              JOIN appointments a ON a.id = s.appointment_id
              WHERE a.salon_id = v_salon
                AND a.status = 'scheduled'
                AND s.staff_id = NEW.staff_id
                AND s.id IS DISTINCT FROM NEW.id
                AND s.start_time < v_end
                AND (s.start_time + make_interval(mins => s.duration_minutes)) > NEW.start_time
            ) THEN
              RAISE EXCEPTION 'Collaboratore già impegnato in questa fascia oraria';
            END IF;
            RETURN NEW;
          END $$ LANGUAGE plpgsql;

          CREATE TRIGGER trg_slot BEFORE INSERT OR UPDATE ON appointment_services
            FOR EACH ROW EXECUTE FUNCTION enforce_slot();

          INSERT INTO salons VALUES (1,'Nord'),(2,'Sud');
          INSERT INTO customers VALUES
            ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Alice'),
            ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Bob');
          INSERT INTO staff VALUES (10,1,true),(20,2,true);
        `);

        // Booking A sede 1
        q(`
          INSERT INTO appointments (salon_id, customer_id, staff_id, start_time, end_time, status, source)
          VALUES (1,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',10,'2026-07-01T10:00:00','2026-07-01T10:40:00','scheduled','customer_app');
          INSERT INTO appointment_services (appointment_id, service_id, staff_id, start_time, duration_minutes)
          VALUES (1, 100, 10, '2026-07-01T10:00:00', 20),
                 (1, 101, 10, '2026-07-01T10:20:00', 20);
        `);

        // Stesso slot/staff: header B ok, riga servizio deve fallire sul trigger overlap
        const apptB = q(`
          INSERT INTO appointments (salon_id, customer_id, staff_id, start_time, end_time, status, source)
          VALUES (1,'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',10,'2026-07-01T10:00:00','2026-07-01T10:40:00','scheduled','customer_app')
          RETURNING id::text;
        `);
        expect(Number(apptB)).toBeGreaterThan(1);

        let overlapErr = "";
        try {
          q(`
            INSERT INTO appointment_services (appointment_id, service_id, staff_id, start_time, duration_minutes)
            VALUES (${apptB}, 100, 10, '2026-07-01T10:00:00', 40);
          `);
        } catch (e) {
          overlapErr = String((e as { stderr?: string; message?: string }).stderr ?? e);
        }
        expect(overlapErr).toMatch(/impegnato/i);

        // Cleanup header orfano B (come farebbe createCustomerAppBooking)
        q(`DELETE FROM appointments WHERE id = ${apptB};`);

        const scheduledA = q(`
          SELECT count(*)::text FROM appointments
          WHERE customer_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND status = 'scheduled';
        `);
        expect(Number(scheduledA)).toBe(1);

        // Ownership filter: B non vede booking A
        const bSeesA = q(`
          SELECT count(*)::text FROM appointments
          WHERE id = 1 AND customer_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
        `);
        expect(bSeesA).toBe("0");

        // Sede 2: B può prenotare stesso orario con altro staff (no cross-salon collision qui)
        q(`
          INSERT INTO appointments (salon_id, customer_id, staff_id, start_time, end_time, status, source)
          VALUES (2,'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',20,'2026-07-01T10:00:00','2026-07-01T10:40:00','scheduled','customer_app');
          INSERT INTO appointment_services (appointment_id, service_id, staff_id, start_time, duration_minutes)
          SELECT id, 200, 20, '2026-07-01T10:00:00', 40 FROM appointments
          WHERE customer_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' AND salon_id = 2;
        `);

        const bCount = q(`
          SELECT count(*)::text FROM appointments
          WHERE customer_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' AND status = 'scheduled';
        `);
        expect(Number(bCount)).toBeGreaterThanOrEqual(1);

        // Non-15 durations stored raw
        const starts = q(`
          SELECT string_agg(to_char(start_time,'HH24:MI'), ',' ORDER BY start_time)
          FROM appointment_services WHERE appointment_id = 1;
        `);
        expect(starts).toBe("10:00,10:20");
      } finally {
        try {
          execFileSync("docker", ["rm", "-f", name], { stdio: "ignore" });
        } catch {
          /* ignore */
        }
      }
    },
    60_000,
  );
});
