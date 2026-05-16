create sequence "public"."staff_attendance_logs_id_seq";

create sequence "public"."staff_salons_id_seq";

create sequence "public"."staff_schedule_id_seq";

drop policy "customer_auth_links_select_own" on "public"."customer_auth_links";

drop policy "salon_whatsapp_settings_insert" on "public"."salon_whatsapp_settings";

drop policy "salon_whatsapp_settings_select" on "public"."salon_whatsapp_settings";

drop policy "salon_whatsapp_settings_update" on "public"."salon_whatsapp_settings";

drop policy "customer_profile_select_staff_or_self" on "public"."customer_profile";

drop policy "customer_service_cards_select_staff_or_self" on "public"."customer_service_cards";

drop policy "customers_select_staff_or_self" on "public"."customers";

drop policy "cliente_notifications" on "public"."notifications";

drop policy "cliente_read_technical_sheets" on "public"."technical_sheets";

drop policy "cliente_technical_sheets" on "public"."technical_sheets";

drop policy "users_insert_own" on "public"."users";

drop policy "users_update_own" on "public"."users";

revoke delete on table "public"."appointment_whatsapp_reminders" from "anon";

revoke insert on table "public"."appointment_whatsapp_reminders" from "anon";

revoke references on table "public"."appointment_whatsapp_reminders" from "anon";

revoke select on table "public"."appointment_whatsapp_reminders" from "anon";

revoke trigger on table "public"."appointment_whatsapp_reminders" from "anon";

revoke truncate on table "public"."appointment_whatsapp_reminders" from "anon";

revoke update on table "public"."appointment_whatsapp_reminders" from "anon";

revoke delete on table "public"."appointment_whatsapp_reminders" from "authenticated";

revoke insert on table "public"."appointment_whatsapp_reminders" from "authenticated";

revoke references on table "public"."appointment_whatsapp_reminders" from "authenticated";

revoke select on table "public"."appointment_whatsapp_reminders" from "authenticated";

revoke trigger on table "public"."appointment_whatsapp_reminders" from "authenticated";

revoke truncate on table "public"."appointment_whatsapp_reminders" from "authenticated";

revoke update on table "public"."appointment_whatsapp_reminders" from "authenticated";

revoke delete on table "public"."appointment_whatsapp_reminders" from "service_role";

revoke insert on table "public"."appointment_whatsapp_reminders" from "service_role";

revoke references on table "public"."appointment_whatsapp_reminders" from "service_role";

revoke select on table "public"."appointment_whatsapp_reminders" from "service_role";

revoke trigger on table "public"."appointment_whatsapp_reminders" from "service_role";

revoke truncate on table "public"."appointment_whatsapp_reminders" from "service_role";

revoke update on table "public"."appointment_whatsapp_reminders" from "service_role";

revoke delete on table "public"."cash_sessions" from "anon";

revoke insert on table "public"."cash_sessions" from "anon";

revoke update on table "public"."cash_sessions" from "anon";

revoke delete on table "public"."customer_auth_links" from "anon";

revoke insert on table "public"."customer_auth_links" from "anon";

revoke references on table "public"."customer_auth_links" from "anon";

revoke select on table "public"."customer_auth_links" from "anon";

revoke trigger on table "public"."customer_auth_links" from "anon";

revoke truncate on table "public"."customer_auth_links" from "anon";

revoke update on table "public"."customer_auth_links" from "anon";

revoke delete on table "public"."customer_auth_links" from "authenticated";

revoke insert on table "public"."customer_auth_links" from "authenticated";

revoke references on table "public"."customer_auth_links" from "authenticated";

revoke select on table "public"."customer_auth_links" from "authenticated";

revoke trigger on table "public"."customer_auth_links" from "authenticated";

revoke truncate on table "public"."customer_auth_links" from "authenticated";

revoke update on table "public"."customer_auth_links" from "authenticated";

revoke delete on table "public"."customer_auth_links" from "service_role";

revoke insert on table "public"."customer_auth_links" from "service_role";

revoke references on table "public"."customer_auth_links" from "service_role";

revoke select on table "public"."customer_auth_links" from "service_role";

revoke trigger on table "public"."customer_auth_links" from "service_role";

revoke truncate on table "public"."customer_auth_links" from "service_role";

revoke update on table "public"."customer_auth_links" from "service_role";

revoke delete on table "public"."customer_claim_otp_challenges" from "anon";

revoke insert on table "public"."customer_claim_otp_challenges" from "anon";

revoke references on table "public"."customer_claim_otp_challenges" from "anon";

revoke select on table "public"."customer_claim_otp_challenges" from "anon";

revoke trigger on table "public"."customer_claim_otp_challenges" from "anon";

revoke truncate on table "public"."customer_claim_otp_challenges" from "anon";

revoke update on table "public"."customer_claim_otp_challenges" from "anon";

revoke delete on table "public"."customer_claim_otp_challenges" from "authenticated";

revoke insert on table "public"."customer_claim_otp_challenges" from "authenticated";

revoke references on table "public"."customer_claim_otp_challenges" from "authenticated";

revoke select on table "public"."customer_claim_otp_challenges" from "authenticated";

revoke trigger on table "public"."customer_claim_otp_challenges" from "authenticated";

revoke truncate on table "public"."customer_claim_otp_challenges" from "authenticated";

revoke update on table "public"."customer_claim_otp_challenges" from "authenticated";

revoke delete on table "public"."customer_claim_otp_challenges" from "service_role";

revoke insert on table "public"."customer_claim_otp_challenges" from "service_role";

revoke references on table "public"."customer_claim_otp_challenges" from "service_role";

revoke select on table "public"."customer_claim_otp_challenges" from "service_role";

revoke trigger on table "public"."customer_claim_otp_challenges" from "service_role";

revoke truncate on table "public"."customer_claim_otp_challenges" from "service_role";

revoke update on table "public"."customer_claim_otp_challenges" from "service_role";

revoke delete on table "public"."marketing_whatsapp_messages" from "anon";

revoke insert on table "public"."marketing_whatsapp_messages" from "anon";

revoke references on table "public"."marketing_whatsapp_messages" from "anon";

revoke select on table "public"."marketing_whatsapp_messages" from "anon";

revoke trigger on table "public"."marketing_whatsapp_messages" from "anon";

revoke truncate on table "public"."marketing_whatsapp_messages" from "anon";

revoke update on table "public"."marketing_whatsapp_messages" from "anon";

revoke delete on table "public"."marketing_whatsapp_messages" from "authenticated";

revoke insert on table "public"."marketing_whatsapp_messages" from "authenticated";

revoke references on table "public"."marketing_whatsapp_messages" from "authenticated";

revoke select on table "public"."marketing_whatsapp_messages" from "authenticated";

revoke trigger on table "public"."marketing_whatsapp_messages" from "authenticated";

revoke truncate on table "public"."marketing_whatsapp_messages" from "authenticated";

revoke update on table "public"."marketing_whatsapp_messages" from "authenticated";

revoke delete on table "public"."marketing_whatsapp_messages" from "service_role";

revoke insert on table "public"."marketing_whatsapp_messages" from "service_role";

revoke references on table "public"."marketing_whatsapp_messages" from "service_role";

revoke select on table "public"."marketing_whatsapp_messages" from "service_role";

revoke trigger on table "public"."marketing_whatsapp_messages" from "service_role";

revoke truncate on table "public"."marketing_whatsapp_messages" from "service_role";

revoke update on table "public"."marketing_whatsapp_messages" from "service_role";

revoke delete on table "public"."product_stock" from "anon";

revoke insert on table "public"."product_stock" from "anon";

revoke update on table "public"."product_stock" from "anon";

revoke delete on table "public"."product_stock" from "authenticated";

revoke insert on table "public"."product_stock" from "authenticated";

revoke update on table "public"."product_stock" from "authenticated";

revoke delete on table "public"."sale_items" from "anon";

revoke insert on table "public"."sale_items" from "anon";

revoke update on table "public"."sale_items" from "anon";

revoke delete on table "public"."sale_items" from "authenticated";

revoke update on table "public"."sale_items" from "authenticated";

revoke delete on table "public"."sales" from "anon";

revoke insert on table "public"."sales" from "anon";

revoke update on table "public"."sales" from "anon";

revoke delete on table "public"."sales" from "authenticated";

revoke update on table "public"."sales" from "authenticated";

revoke delete on table "public"."salon_whatsapp_settings" from "anon";

revoke insert on table "public"."salon_whatsapp_settings" from "anon";

revoke references on table "public"."salon_whatsapp_settings" from "anon";

revoke select on table "public"."salon_whatsapp_settings" from "anon";

revoke trigger on table "public"."salon_whatsapp_settings" from "anon";

revoke truncate on table "public"."salon_whatsapp_settings" from "anon";

revoke update on table "public"."salon_whatsapp_settings" from "anon";

revoke delete on table "public"."salon_whatsapp_settings" from "authenticated";

revoke insert on table "public"."salon_whatsapp_settings" from "authenticated";

revoke references on table "public"."salon_whatsapp_settings" from "authenticated";

revoke select on table "public"."salon_whatsapp_settings" from "authenticated";

revoke trigger on table "public"."salon_whatsapp_settings" from "authenticated";

revoke truncate on table "public"."salon_whatsapp_settings" from "authenticated";

revoke update on table "public"."salon_whatsapp_settings" from "authenticated";

revoke delete on table "public"."salon_whatsapp_settings" from "service_role";

revoke insert on table "public"."salon_whatsapp_settings" from "service_role";

revoke references on table "public"."salon_whatsapp_settings" from "service_role";

revoke select on table "public"."salon_whatsapp_settings" from "service_role";

revoke trigger on table "public"."salon_whatsapp_settings" from "service_role";

revoke truncate on table "public"."salon_whatsapp_settings" from "service_role";

revoke update on table "public"."salon_whatsapp_settings" from "service_role";

revoke delete on table "public"."stock_movements" from "anon";

revoke insert on table "public"."stock_movements" from "anon";

revoke update on table "public"."stock_movements" from "anon";

revoke delete on table "public"."stock_movements" from "authenticated";

revoke insert on table "public"."stock_movements" from "authenticated";

revoke update on table "public"."stock_movements" from "authenticated";

revoke select on table "public"."transfer_items" from "authenticated";

alter table "public"."appointment_whatsapp_reminders" drop constraint "appointment_whatsapp_reminders_appointment_id_fkey";

alter table "public"."appointment_whatsapp_reminders" drop constraint "appointment_whatsapp_reminders_appointment_id_key";

alter table "public"."appointment_whatsapp_reminders" drop constraint "appointment_whatsapp_reminders_customer_id_fkey";

alter table "public"."appointment_whatsapp_reminders" drop constraint "appointment_whatsapp_reminders_salon_id_fkey";

alter table "public"."customer_auth_links" drop constraint "customer_auth_links_customer_id_fkey";

alter table "public"."customer_auth_links" drop constraint "customer_auth_links_customer_id_key";

alter table "public"."customer_auth_links" drop constraint "customer_auth_links_user_id_fkey";

alter table "public"."customer_auth_links" drop constraint "customer_auth_links_user_id_key";

alter table "public"."customer_claim_otp_challenges" drop constraint "customer_claim_otp_challenges_customer_id_fkey";

alter table "public"."customer_claim_otp_challenges" drop constraint "customer_claim_otp_challenges_user_id_fkey";

alter table "public"."customers" drop constraint "customers_customer_code_key";

alter table "public"."fiscal_print_jobs" drop constraint "fiscal_print_jobs_cash_session_id_fkey";

alter table "public"."marketing_whatsapp_messages" drop constraint "marketing_whatsapp_messages_customer_id_fkey";

alter table "public"."marketing_whatsapp_messages" drop constraint "marketing_whatsapp_messages_salon_id_fkey";

alter table "public"."salon_whatsapp_settings" drop constraint "salon_whatsapp_settings_salon_id_fkey";

alter table "public"."fiscal_print_jobs" drop constraint "fiscal_print_jobs_sale_id_fkey";

drop function if exists "public"."appointments_for_whatsapp_reminder_v1"();

drop function if exists "public"."close_sale_atomic"(p_salon_id integer, p_customer_id uuid, p_total_amount numeric, p_payment_method text, p_discount numeric, p_items jsonb, p_appointment_id integer);

drop function if exists "public"."is_customer_app_user"(p_customer_id uuid);

drop view if exists "public"."cash_closure_summary";

drop view if exists "public"."daily_sales_totals";

drop view if exists "public"."report_salon_turnover_daily";

drop view if exists "public"."report_salon_turnover_range";

drop view if exists "public"."sale_items_report";

alter table "public"."appointment_whatsapp_reminders" drop constraint "appointment_whatsapp_reminders_pkey";

alter table "public"."customer_auth_links" drop constraint "customer_auth_links_pkey";

alter table "public"."customer_claim_otp_challenges" drop constraint "customer_claim_otp_challenges_pkey";

alter table "public"."marketing_whatsapp_messages" drop constraint "marketing_whatsapp_messages_pkey";

alter table "public"."salon_whatsapp_settings" drop constraint "salon_whatsapp_settings_pkey";

drop index if exists "public"."appointment_whatsapp_reminders_appointment_id_key";

drop index if exists "public"."appointment_whatsapp_reminders_pkey";

drop index if exists "public"."customer_auth_links_customer_id_key";

drop index if exists "public"."customer_auth_links_pkey";

drop index if exists "public"."customer_auth_links_user_id_key";

drop index if exists "public"."customer_claim_otp_challenges_expires_idx";

drop index if exists "public"."customer_claim_otp_challenges_pkey";

drop index if exists "public"."customer_claim_otp_challenges_user_created_idx";

drop index if exists "public"."customers_customer_code_key";

drop index if exists "public"."fiscal_print_jobs_sale_receipt_sale_id_unique";

drop index if exists "public"."fiscal_print_jobs_z_report_cash_session_unique";

drop index if exists "public"."marketing_whatsapp_messages_pkey";

drop index if exists "public"."marketing_whatsapp_messages_salon_created_idx";

drop index if exists "public"."salon_whatsapp_settings_pkey";

drop table "public"."appointment_whatsapp_reminders";

drop table "public"."customer_auth_links";

drop table "public"."customer_claim_otp_challenges";

drop table "public"."marketing_whatsapp_messages";

drop table "public"."salon_whatsapp_settings";


  create table "public"."staff_attendance_logs" (
    "id" bigint not null default nextval('public.staff_attendance_logs_id_seq'::regclass),
    "staff_id" bigint not null,
    "salon_id" bigint not null,
    "event_type" text not null,
    "created_at" timestamp with time zone not null default now(),
    "lat" double precision,
    "lng" double precision
      );



  create table "public"."staff_salons" (
    "id" bigint not null default nextval('public.staff_salons_id_seq'::regclass),
    "staff_id" bigint not null,
    "salon_id" bigint not null,
    "created_at" timestamp with time zone not null default now()
      );



  create table "public"."staff_schedule" (
    "id" bigint not null default nextval('public.staff_schedule_id_seq'::regclass),
    "staff_id" bigint not null,
    "salon_id" bigint not null,
    "day_of_week" smallint not null,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."customers" drop column "customer_code";

alter table "public"."customers" drop column "marketing_consent_at";

alter table "public"."customers" drop column "marketing_whatsapp_opt_in";

alter table "public"."fiscal_print_jobs" drop column "cash_session_id";

alter table "public"."fiscal_print_jobs" drop column "completed_at";

alter table "public"."salons" add column "lat" double precision;

alter table "public"."salons" add column "lng" double precision;

alter table "public"."salons" add column "radius_m" integer default 100;

alter table "public"."staff" add column "mobile_enabled" boolean not null default false;

alter table "public"."staff" add column "mobile_last_login_at" timestamp with time zone;

alter table "public"."staff" add column "mobile_pin_hash" text;

alter sequence "public"."staff_attendance_logs_id_seq" owned by "public"."staff_attendance_logs"."id";

alter sequence "public"."staff_salons_id_seq" owned by "public"."staff_salons"."id";

alter sequence "public"."staff_schedule_id_seq" owned by "public"."staff_schedule"."id";

drop sequence if exists "public"."appointment_whatsapp_reminders_id_seq";

drop sequence if exists "public"."marketing_whatsapp_messages_id_seq";

CREATE UNIQUE INDEX fiscal_print_jobs_sale_id_unique ON public.fiscal_print_jobs USING btree (sale_id) WHERE (sale_id IS NOT NULL);

CREATE UNIQUE INDEX staff_attendance_logs_pkey ON public.staff_attendance_logs USING btree (id);

CREATE UNIQUE INDEX staff_salons_pkey ON public.staff_salons USING btree (id);

CREATE UNIQUE INDEX staff_salons_staff_id_salon_id_key ON public.staff_salons USING btree (staff_id, salon_id);

CREATE UNIQUE INDEX staff_schedule_pkey ON public.staff_schedule USING btree (id);

CREATE UNIQUE INDEX staff_schedule_staff_id_salon_id_day_of_week_key ON public.staff_schedule USING btree (staff_id, salon_id, day_of_week);

alter table "public"."staff_attendance_logs" add constraint "staff_attendance_logs_pkey" PRIMARY KEY using index "staff_attendance_logs_pkey";

alter table "public"."staff_salons" add constraint "staff_salons_pkey" PRIMARY KEY using index "staff_salons_pkey";

alter table "public"."staff_schedule" add constraint "staff_schedule_pkey" PRIMARY KEY using index "staff_schedule_pkey";

alter table "public"."staff_salons" add constraint "staff_salons_salon_id_fkey" FOREIGN KEY (salon_id) REFERENCES public.salons(id) ON DELETE CASCADE not valid;

alter table "public"."staff_salons" validate constraint "staff_salons_salon_id_fkey";

alter table "public"."staff_salons" add constraint "staff_salons_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE not valid;

alter table "public"."staff_salons" validate constraint "staff_salons_staff_id_fkey";

alter table "public"."staff_salons" add constraint "staff_salons_staff_id_salon_id_key" UNIQUE using index "staff_salons_staff_id_salon_id_key";

alter table "public"."staff_schedule" add constraint "staff_schedule_day_of_week_check" CHECK (((day_of_week >= 1) AND (day_of_week <= 7))) not valid;

alter table "public"."staff_schedule" validate constraint "staff_schedule_day_of_week_check";

alter table "public"."staff_schedule" add constraint "staff_schedule_salon_id_fkey" FOREIGN KEY (salon_id) REFERENCES public.salons(id) ON DELETE CASCADE not valid;

alter table "public"."staff_schedule" validate constraint "staff_schedule_salon_id_fkey";

alter table "public"."staff_schedule" add constraint "staff_schedule_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE not valid;

alter table "public"."staff_schedule" validate constraint "staff_schedule_staff_id_fkey";

alter table "public"."staff_schedule" add constraint "staff_schedule_staff_id_salon_id_day_of_week_key" UNIQUE using index "staff_schedule_staff_id_salon_id_day_of_week_key";

alter table "public"."fiscal_print_jobs" add constraint "fiscal_print_jobs_sale_id_fkey" FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE SET NULL not valid;

alter table "public"."fiscal_print_jobs" validate constraint "fiscal_print_jobs_sale_id_fkey";

set check_function_bodies = off;

create or replace view "public"."cash_closure_summary" as  SELECT id AS cash_session_id,
    salon_id,
    session_date,
    opening_cash,
    closing_cash,
    COALESCE(( SELECT sum(s.total_amount) AS sum
           FROM public.sales s
          WHERE ((s.salon_id = cs.salon_id) AND (date(s.created_at) = cs.session_date) AND (s.payment_method = 'cash'::text))), (0)::numeric) AS expected_cash_sales,
        CASE
            WHEN (closing_cash IS NULL) THEN NULL::numeric
            ELSE round((closing_cash - (opening_cash + COALESCE(( SELECT sum(s.total_amount) AS sum
               FROM public.sales s
              WHERE ((s.salon_id = cs.salon_id) AND (date(s.created_at) = cs.session_date) AND (s.payment_method = 'cash'::text))), (0)::numeric))), 2)
        END AS cash_difference
   FROM public.cash_sessions cs;


CREATE OR REPLACE FUNCTION public.claim_fiscal_print_jobs(p_bridge_id text, p_limit integer DEFAULT 1)
 RETURNS SETOF public.fiscal_print_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer;
BEGIN
  IF p_bridge_id IS NULL OR length(trim(p_bridge_id)) = 0 THEN
    RAISE EXCEPTION 'claim_fiscal_print_jobs: p_bridge_id richiesto';
  END IF;

  v_limit := coalesce(p_limit, 1);

  IF v_limit < 1 OR v_limit > 50 THEN
    RAISE EXCEPTION 'claim_fiscal_print_jobs: p_limit deve essere tra 1 e 50';
  END IF;

  RETURN QUERY
  WITH picked AS (
    SELECT j.id
    FROM public.fiscal_print_jobs AS j
    WHERE j.status = 'pending'
    ORDER BY j.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT v_limit
  )
  UPDATE public.fiscal_print_jobs AS u
  SET
    status = 'processing',
    locked_by = trim(p_bridge_id),
    locked_at = now(),
    attempts = coalesce(u.attempts, 0) + 1
  FROM picked
  WHERE u.id = picked.id
  RETURNING u.*;
END;
$function$
;

create or replace view "public"."daily_sales_totals" as  SELECT salon_id,
    date(created_at) AS day,
    payment_method,
    sum(total_amount) AS total
   FROM public.sales
  GROUP BY salon_id, (date(created_at)), payment_method;


CREATE OR REPLACE FUNCTION public.execute_transfer(p_transfer_id bigint)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_from_int  integer;
  v_to_int    integer;
  v_done_at   timestamp;
begin
  if not (public.is_coordinator() or public.is_magazzino()) then
    raise exception 'Not allowed';
  end if;

  select from_salon, to_salon, executed_at
    into v_from_int, v_to_int, v_done_at
  from public.transfers
  where id = p_transfer_id
  for update;

  if not found then
    raise exception 'Transfer % not found', p_transfer_id;
  end if;

  if v_done_at is not null then
    raise exception 'Transfer % already executed at %', p_transfer_id, v_done_at;
  end if;

  if v_from_int is null or v_to_int is null then
    raise exception 'Transfer % has null from_salon/to_salon', p_transfer_id;
  end if;

  if v_from_int = v_to_int then
    raise exception 'Transfer % invalid: from_salon = to_salon (%).', p_transfer_id, v_from_int;
  end if;

  if not exists (select 1 from public.transfer_items where transfer_id = p_transfer_id) then
    raise exception 'Transfer % has no items', p_transfer_id;
  end if;

  -- usa SOLO la stock_move definitiva (lock + no negative + log)
  perform public.stock_move(
    ti.product_id,
    ti.qty::numeric,
    v_from_int,
    v_to_int,
    'trasferimento',
    'transfer_id=' || p_transfer_id::text
  )
  from public.transfer_items ti
  where ti.transfer_id = p_transfer_id;

  update public.transfers
  set executed_at = now(),
      executed_by = auth.uid()
  where id = p_transfer_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.report_rows(p_salon_id integer, p_from date, p_to date, p_staff_id integer DEFAULT NULL::integer, p_payment_method text DEFAULT NULL::text, p_item_type text DEFAULT NULL::text)
 RETURNS TABLE(sale_item_id integer, sale_id integer, salon_id integer, sale_day date, payment_method text, staff_id integer, staff_name text, product_id integer, product_name text, service_id integer, service_name text, item_type text, quantity numeric, price numeric, item_discount numeric, vat_rate numeric, line_total_gross numeric, line_net numeric, line_vat numeric)
 LANGUAGE sql
 STABLE
AS $function$
  with src as (
    select
      si.id as sale_item_id,
      s.id as sale_id,
      s.salon_id,
      (s.date::date) as sale_day,
      lower(coalesce(s.payment_method, '')) as payment_method,

      si.staff_id,
      st.name as staff_name,

      si.product_id,
      p.name as product_name,

      si.service_id,
      sv.name as service_name,

      case
        when si.service_id is not null then 'service'
        when si.product_id is not null then 'product'
        else 'unknown'
      end as item_type,

      coalesce(si.quantity, 1)::numeric as quantity,
      coalesce(si.price, 0)::numeric as price,
      coalesce(si.discount, 0)::numeric as item_discount,

      -- vat_rate è percentuale (es. 22). Se nullo -> 0
      coalesce(
        case
          when si.service_id is not null then sv.vat_rate
          when si.product_id is not null then p.vat_rate
          else 0
        end,
        0
      )::numeric as vat_rate

    from public.sale_items si
    join public.sales s on s.id = si.sale_id
    left join public.staff st on st.id = si.staff_id
    left join public.products p on p.id = si.product_id
    left join public.services sv on sv.id = si.service_id
    where
      s.salon_id = p_salon_id
      and s.date::date >= p_from
      and s.date::date <= p_to
      and (p_staff_id is null or si.staff_id = p_staff_id)
      and (p_payment_method is null or lower(s.payment_method) = lower(p_payment_method))
      and (
        p_item_type is null
        or (
          p_item_type = 'service' and si.service_id is not null
        )
        or (
          p_item_type = 'product' and si.product_id is not null
        )
      )
  )
  select
    sale_item_id,
    sale_id,
    salon_id,
    sale_day,
    payment_method,
    staff_id,
    staff_name,
    product_id,
    product_name,
    service_id,
    service_name,
    item_type,
    quantity,
    price,
    item_discount,
    vat_rate,

    -- lordo riga (prezzo*qty - sconto in €)
    round((price * quantity - item_discount)::numeric, 2) as line_total_gross,

    -- netto/iva derivati dal lordo (assumendo prezzi IVA inclusa)
    case
      when vat_rate > 0
        then round(((price * quantity - item_discount) / (1 + (vat_rate / 100)))::numeric, 2)
      else
        round((price * quantity - item_discount)::numeric, 2)
    end as line_net,

    case
      when vat_rate > 0
        then round(((price * quantity - item_discount) - ((price * quantity - item_discount) / (1 + (vat_rate / 100))))::numeric, 2)
      else
        0::numeric
    end as line_vat

  from src
  order by sale_day asc, sale_id asc, sale_item_id asc;
$function$
;

create or replace view "public"."sale_items_report" as  SELECT si.id AS sale_item_id,
    s.id AS sale_id,
    s.salon_id,
    date(s.created_at) AS sale_day,
    s.payment_method,
    si.staff_id,
    st.name AS staff_name,
    si.product_id,
    p.name AS product_name,
    si.service_id,
    sv.name AS service_name,
        CASE
            WHEN (si.product_id IS NOT NULL) THEN 'product'::text
            WHEN (si.service_id IS NOT NULL) THEN 'service'::text
            ELSE 'unknown'::text
        END AS item_type,
    si.quantity,
    si.price,
    COALESCE(si.discount, (0)::numeric) AS item_discount,
        CASE
            WHEN (si.product_id IS NOT NULL) THEN p.vat_rate
            WHEN (si.service_id IS NOT NULL) THEN sv.vat_rate
            ELSE (22)::numeric
        END AS vat_rate,
    round(((si.price * (si.quantity)::numeric) - COALESCE(si.discount, (0)::numeric)), 2) AS line_total_gross,
    round((((si.price * (si.quantity)::numeric) - COALESCE(si.discount, (0)::numeric)) / ((1)::numeric + (
        CASE
            WHEN (si.product_id IS NOT NULL) THEN p.vat_rate
            WHEN (si.service_id IS NOT NULL) THEN sv.vat_rate
            ELSE (22)::numeric
        END / 100.0))), 2) AS line_net,
    round((((si.price * (si.quantity)::numeric) - COALESCE(si.discount, (0)::numeric)) - (((si.price * (si.quantity)::numeric) - COALESCE(si.discount, (0)::numeric)) / ((1)::numeric + (
        CASE
            WHEN (si.product_id IS NOT NULL) THEN p.vat_rate
            WHEN (si.service_id IS NOT NULL) THEN sv.vat_rate
            ELSE (22)::numeric
        END / 100.0)))), 2) AS line_vat
   FROM ((((public.sale_items si
     JOIN public.sales s ON ((s.id = si.sale_id)))
     LEFT JOIN public.products p ON ((p.id = si.product_id)))
     LEFT JOIN public.services sv ON ((sv.id = si.service_id)))
     LEFT JOIN public.staff st ON ((st.id = si.staff_id)));


CREATE OR REPLACE FUNCTION public.stock_decrease(p_salon integer, p_product integer, p_qty numeric, p_reason text DEFAULT 'manual_decrease'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantità non valida';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_stock
    WHERE salon_id = p_salon
      AND product_id = p_product
      AND quantity >= p_qty
  ) THEN
    RAISE EXCEPTION 'Giacenza insufficiente';
  END IF;

  UPDATE public.product_stock
  SET quantity = quantity - p_qty
  WHERE salon_id = p_salon
    AND product_id = p_product;

  INSERT INTO public.stock_movements (
    product_id,
    from_salon,
    to_salon,
    quantity,
    movement_type,
    reason
  )
  VALUES (
    p_product,
    p_salon,
    NULL,
    -p_qty,
    'unload',
    p_reason
  );
END;
$function$
;

create or replace view "public"."report_salon_turnover_daily" as  SELECT salon_id,
    sale_day,
    count(DISTINCT sale_id) AS receipts_count,
    sum(COALESCE(line_total_gross, (0)::numeric)) AS gross_total,
    sum(COALESCE(line_net, (0)::numeric)) AS net_total,
    sum(COALESCE(line_vat, (0)::numeric)) AS vat_total,
    sum(COALESCE(item_discount, (0)::numeric)) AS discount_total,
    sum(COALESCE(line_total_gross, (0)::numeric)) FILTER (WHERE (payment_method = 'cash'::text)) AS gross_cash,
    sum(COALESCE(line_total_gross, (0)::numeric)) FILTER (WHERE (payment_method = 'card'::text)) AS gross_card,
    sum(COALESCE(line_total_gross, (0)::numeric)) FILTER (WHERE (item_type = 'service'::text)) AS gross_services,
    sum(COALESCE(line_total_gross, (0)::numeric)) FILTER (WHERE (item_type = 'product'::text)) AS gross_products
   FROM public.sale_items_report r
  GROUP BY salon_id, sale_day;


create or replace view "public"."report_salon_turnover_range" as  SELECT salon_id,
    min(sale_day) AS date_from,
    max(sale_day) AS date_to,
    count(DISTINCT sale_id) AS receipts_count,
    sum(COALESCE(line_total_gross, (0)::numeric)) AS gross_total,
    sum(COALESCE(line_net, (0)::numeric)) AS net_total,
    sum(COALESCE(line_vat, (0)::numeric)) AS vat_total,
    sum(COALESCE(item_discount, (0)::numeric)) AS discount_total,
    sum(COALESCE(line_total_gross, (0)::numeric)) FILTER (WHERE (payment_method = 'cash'::text)) AS gross_cash,
    sum(COALESCE(line_total_gross, (0)::numeric)) FILTER (WHERE (payment_method = 'card'::text)) AS gross_card,
    sum(COALESCE(line_total_gross, (0)::numeric)) FILTER (WHERE (item_type = 'service'::text)) AS gross_services,
    sum(COALESCE(line_total_gross, (0)::numeric)) FILTER (WHERE (item_type = 'product'::text)) AS gross_products
   FROM public.sale_items_report r
  GROUP BY salon_id;


grant delete on table "public"."staff_attendance_logs" to "anon";

grant insert on table "public"."staff_attendance_logs" to "anon";

grant references on table "public"."staff_attendance_logs" to "anon";

grant select on table "public"."staff_attendance_logs" to "anon";

grant trigger on table "public"."staff_attendance_logs" to "anon";

grant truncate on table "public"."staff_attendance_logs" to "anon";

grant update on table "public"."staff_attendance_logs" to "anon";

grant delete on table "public"."staff_attendance_logs" to "authenticated";

grant insert on table "public"."staff_attendance_logs" to "authenticated";

grant references on table "public"."staff_attendance_logs" to "authenticated";

grant select on table "public"."staff_attendance_logs" to "authenticated";

grant trigger on table "public"."staff_attendance_logs" to "authenticated";

grant truncate on table "public"."staff_attendance_logs" to "authenticated";

grant update on table "public"."staff_attendance_logs" to "authenticated";

grant delete on table "public"."staff_attendance_logs" to "service_role";

grant insert on table "public"."staff_attendance_logs" to "service_role";

grant references on table "public"."staff_attendance_logs" to "service_role";

grant select on table "public"."staff_attendance_logs" to "service_role";

grant trigger on table "public"."staff_attendance_logs" to "service_role";

grant truncate on table "public"."staff_attendance_logs" to "service_role";

grant update on table "public"."staff_attendance_logs" to "service_role";

grant delete on table "public"."staff_salons" to "anon";

grant insert on table "public"."staff_salons" to "anon";

grant references on table "public"."staff_salons" to "anon";

grant select on table "public"."staff_salons" to "anon";

grant trigger on table "public"."staff_salons" to "anon";

grant truncate on table "public"."staff_salons" to "anon";

grant update on table "public"."staff_salons" to "anon";

grant delete on table "public"."staff_salons" to "authenticated";

grant insert on table "public"."staff_salons" to "authenticated";

grant references on table "public"."staff_salons" to "authenticated";

grant select on table "public"."staff_salons" to "authenticated";

grant trigger on table "public"."staff_salons" to "authenticated";

grant truncate on table "public"."staff_salons" to "authenticated";

grant update on table "public"."staff_salons" to "authenticated";

grant delete on table "public"."staff_salons" to "service_role";

grant insert on table "public"."staff_salons" to "service_role";

grant references on table "public"."staff_salons" to "service_role";

grant select on table "public"."staff_salons" to "service_role";

grant trigger on table "public"."staff_salons" to "service_role";

grant truncate on table "public"."staff_salons" to "service_role";

grant update on table "public"."staff_salons" to "service_role";

grant delete on table "public"."staff_schedule" to "anon";

grant insert on table "public"."staff_schedule" to "anon";

grant references on table "public"."staff_schedule" to "anon";

grant select on table "public"."staff_schedule" to "anon";

grant trigger on table "public"."staff_schedule" to "anon";

grant truncate on table "public"."staff_schedule" to "anon";

grant update on table "public"."staff_schedule" to "anon";

grant delete on table "public"."staff_schedule" to "authenticated";

grant insert on table "public"."staff_schedule" to "authenticated";

grant references on table "public"."staff_schedule" to "authenticated";

grant select on table "public"."staff_schedule" to "authenticated";

grant trigger on table "public"."staff_schedule" to "authenticated";

grant truncate on table "public"."staff_schedule" to "authenticated";

grant update on table "public"."staff_schedule" to "authenticated";

grant delete on table "public"."staff_schedule" to "service_role";

grant insert on table "public"."staff_schedule" to "service_role";

grant references on table "public"."staff_schedule" to "service_role";

grant select on table "public"."staff_schedule" to "service_role";

grant trigger on table "public"."staff_schedule" to "service_role";

grant truncate on table "public"."staff_schedule" to "service_role";

grant update on table "public"."staff_schedule" to "service_role";


  create policy "appointment_services_select_by_salon"
  on "public"."appointment_services"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.appointments a
  WHERE ((a.id = appointment_services.appointment_id) AND public.can_access_salon(a.salon_id)))));



  create policy "update appointment services"
  on "public"."appointment_services"
  as permissive
  for update
  to public
using (true)
with check (true);



  create policy "customer_profile_select_staff_or_self"
  on "public"."customer_profile"
  as permissive
  for select
  to authenticated
using ((public.is_staff() OR ((public.current_role_name() = 'cliente'::text) AND (customer_id = auth.uid())) OR (customer_id = auth.uid())));



  create policy "customer_service_cards_select_staff_or_self"
  on "public"."customer_service_cards"
  as permissive
  for select
  to authenticated
using ((public.is_staff() OR ((public.current_role_name() = 'cliente'::text) AND (customer_id = auth.uid())) OR (customer_id = auth.uid())));



  create policy "customers_select_staff_or_self"
  on "public"."customers"
  as permissive
  for select
  to authenticated
using ((public.is_staff() OR ((public.current_role_name() = 'cliente'::text) AND (id = auth.uid())) OR (id = auth.uid())));



  create policy "cliente_notifications"
  on "public"."notifications"
  as permissive
  for select
  to public
using ((customer_id = auth.uid()));



  create policy "cliente_read_technical_sheets"
  on "public"."technical_sheets"
  as permissive
  for select
  to public
using ((customer_id = auth.uid()));



  create policy "cliente_technical_sheets"
  on "public"."technical_sheets"
  as permissive
  for select
  to public
using ((customer_id = auth.uid()));



  create policy "users_insert_own"
  on "public"."users"
  as permissive
  for insert
  to public
with check ((id = auth.uid()));



  create policy "users_update_own"
  on "public"."users"
  as permissive
  for update
  to public
using ((id = auth.uid()))
with check ((id = auth.uid()));



