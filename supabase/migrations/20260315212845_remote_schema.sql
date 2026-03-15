drop extension if exists "pg_net";

create sequence "public"."appointments_id_seq";

create sequence "public"."customer_tech_notes_id_seq";

create sequence "public"."fiscal_profiles_id_seq";

create sequence "public"."legal_entities_id_seq";

create sequence "public"."notification_templates_id_seq";

create sequence "public"."notifications_id_seq";

create sequence "public"."product_stock_id_seq";

create sequence "public"."products_id_seq";

create sequence "public"."roles_id_seq";

create sequence "public"."sale_items_id_seq";

create sequence "public"."sales_id_seq";

create sequence "public"."salon_fiscal_profiles_id_seq";

create sequence "public"."salons_id_seq";

create sequence "public"."service_categories_id_seq";

create sequence "public"."service_prices_id_seq";

create sequence "public"."services_id_seq";

create sequence "public"."staff_id_seq";

create sequence "public"."stock_movements_id_seq";

create sequence "public"."system_log_id_seq";

create sequence "public"."technical_sheets_id_seq";

create sequence "public"."user_salons_id_seq";


  create table "public"."_bak_products" (
    "id" integer,
    "name" text,
    "sku" text,
    "category" text,
    "unit" text,
    "cost" numeric(10,2),
    "price" numeric(10,2),
    "low_stock" integer,
    "active" boolean,
    "created_at" timestamp without time zone,
    "barcode" text,
    "type" text,
    "description" text,
    "vat_rate" numeric
      );



  create table "public"."_bak_staff" (
    "id" integer,
    "salon_id" integer,
    "name" text,
    "role" text,
    "phone" text,
    "active" boolean,
    "created_at" timestamp without time zone
      );



  create table "public"."_bak_stock_movements" (
    "id" integer,
    "product_id" integer,
    "from_salon" integer,
    "to_salon" integer,
    "quantity" numeric(10,2),
    "movement_type" text,
    "reason" text,
    "created_at" timestamp without time zone
      );



  create table "public"."_bak_transfer_items" (
    "id" bigint,
    "transfer_id" bigint,
    "product_id" integer,
    "qty" integer
      );



  create table "public"."appointment_services" (
    "id" bigint generated always as identity not null,
    "appointment_id" bigint not null,
    "service_id" bigint not null,
    "staff_id" bigint,
    "start_time" timestamp without time zone not null,
    "duration_minutes" integer not null,
    "price" numeric not null,
    "vat_rate" numeric not null,
    "created_at" timestamp without time zone default now()
      );


alter table "public"."appointment_services" enable row level security;


  create table "public"."appointments" (
    "id" integer not null default nextval('public.appointments_id_seq'::regclass),
    "salon_id" integer,
    "customer_id" uuid not null,
    "staff_id" integer,
    "service_id" integer,
    "start_time" timestamp without time zone not null,
    "end_time" timestamp without time zone,
    "processing_start" timestamp without time zone,
    "processing_end" timestamp without time zone,
    "status" text default 'scheduled'::text,
    "notes" text,
    "created_at" timestamp without time zone default now(),
    "sale_id" bigint,
    "group_id" uuid
      );


alter table "public"."appointments" enable row level security;


  create table "public"."cash_sessions" (
    "id" bigint generated always as identity not null,
    "salon_id" integer not null,
    "session_date" date not null,
    "opened_by" uuid,
    "closed_by" uuid,
    "opening_cash" numeric not null default 0,
    "closing_cash" numeric,
    "notes" text,
    "status" text not null default 'open'::text,
    "opened_at" timestamp without time zone not null default now(),
    "closed_at" timestamp without time zone
      );


alter table "public"."cash_sessions" enable row level security;


  create table "public"."customer_notes" (
    "id" uuid not null default gen_random_uuid(),
    "customer_id" uuid not null,
    "content" text not null,
    "created_at" timestamp with time zone default now()
      );



  create table "public"."customer_profile" (
    "customer_id" uuid not null,
    "texture" text,
    "thickness" text,
    "density" text,
    "porosity" text,
    "elasticity" text,
    "scalp" text,
    "frizz_level" text,
    "baseline_level" integer,
    "allergies" text,
    "notes" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."customer_profile" enable row level security;


  create table "public"."customer_service_cards" (
    "id" uuid not null default gen_random_uuid(),
    "customer_id" uuid not null,
    "service_type" text not null,
    "data" jsonb not null default '{}'::jsonb,
    "salon_id" integer,
    "staff_id" integer,
    "appointment_id" integer,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."customer_service_cards" enable row level security;


  create table "public"."customer_tech_notes" (
    "id" bigint not null default nextval('public.customer_tech_notes_id_seq'::regclass),
    "customer_id" uuid not null,
    "salon_id" integer,
    "staff_id" integer,
    "note_date" date not null default (now())::date,
    "note_type" text not null default 'Altro'::text,
    "content" text not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."customer_tech_notes" enable row level security;


  create table "public"."customer_technical_cards" (
    "id" uuid not null default gen_random_uuid(),
    "customer_id" uuid not null,
    "color" text,
    "gloss" text,
    "lightening" text,
    "keratin" text,
    "botanicals" text,
    "notes" text,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."customer_technical_cards" enable row level security;


  create table "public"."customers" (
    "id" uuid not null default gen_random_uuid(),
    "first_name" text not null,
    "last_name" text not null,
    "phone" text not null,
    "email" text,
    "address" text,
    "notes" text,
    "created_at" timestamp without time zone default now()
      );


alter table "public"."customers" enable row level security;


  create table "public"."fiscal_profiles" (
    "id" bigint not null default nextval('public.fiscal_profiles_id_seq'::regclass),
    "salon_id" integer not null,
    "legal_name" text not null,
    "vat_number" text not null,
    "tax_code" text,
    "printer_model" text not null default 'EPSON FP81'::text,
    "printer_serial" text not null,
    "valid_from" date not null,
    "valid_to" date,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );



  create table "public"."import_products" (
    "name" text,
    "barcode" text,
    "category" text,
    "quantity" numeric,
    "cost" numeric
      );



  create table "public"."legal_entities" (
    "id" bigint not null default nextval('public.legal_entities_id_seq'::regclass),
    "name" text not null,
    "vat_number" text not null,
    "tax_code" text,
    "address_line" text not null,
    "city" text not null,
    "province" text,
    "zip" text,
    "country" text not null default 'IT'::text,
    "created_at" timestamp with time zone not null default now()
      );



  create table "public"."notification_templates" (
    "id" integer not null default nextval('public.notification_templates_id_seq'::regclass),
    "name" text not null,
    "content" text not null,
    "type" text not null,
    "created_at" timestamp without time zone default now()
      );



  create table "public"."notifications" (
    "id" integer not null default nextval('public.notifications_id_seq'::regclass),
    "customer_id" uuid,
    "salon_id" integer,
    "template_id" integer,
    "channel" text not null,
    "status" text default 'pending'::text,
    "send_at" timestamp without time zone default now(),
    "sent_at" timestamp without time zone,
    "message_preview" text,
    "created_at" timestamp without time zone default now()
      );


alter table "public"."notifications" enable row level security;


  create table "public"."product_stock" (
    "id" integer not null default nextval('public.product_stock_id_seq'::regclass),
    "product_id" integer,
    "salon_id" integer,
    "quantity" numeric(10,2) default 0
      );


alter table "public"."product_stock" enable row level security;


  create table "public"."products" (
    "id" integer not null default nextval('public.products_id_seq'::regclass),
    "name" text not null,
    "sku" text,
    "category" text,
    "unit" text default 'pz'::text,
    "cost" numeric(10,2),
    "price" numeric(10,2),
    "low_stock" integer default 0,
    "active" boolean default true,
    "created_at" timestamp without time zone default now(),
    "barcode" text,
    "type" text,
    "description" text,
    "vat_rate" numeric not null default 22
      );


alter table "public"."products" enable row level security;


  create table "public"."roles" (
    "id" integer not null default nextval('public.roles_id_seq'::regclass),
    "name" text not null
      );



  create table "public"."sale_items" (
    "id" integer not null default nextval('public.sale_items_id_seq'::regclass),
    "sale_id" bigint,
    "service_id" integer,
    "product_id" integer,
    "staff_id" integer,
    "quantity" integer default 1,
    "price" numeric(10,2) not null,
    "discount" numeric(10,2) default 0,
    "created_at" timestamp without time zone default now()
      );


alter table "public"."sale_items" enable row level security;


  create table "public"."sales" (
    "id" bigint not null default nextval('public.sales_id_seq'::regclass),
    "salon_id" integer,
    "customer_id" uuid,
    "total_amount" numeric(10,2) not null,
    "payment_method" text not null,
    "discount" numeric(10,2) default 0,
    "date" timestamp without time zone default now(),
    "created_at" timestamp without time zone default now()
      );


alter table "public"."sales" enable row level security;


  create table "public"."salon_fiscal_profiles" (
    "id" bigint not null default nextval('public.salon_fiscal_profiles_id_seq'::regclass),
    "salon_id" integer not null,
    "legal_entity_id" bigint not null,
    "effective_from" date not null,
    "effective_to" date,
    "printer_model" text,
    "printer_serial" text,
    "created_at" timestamp with time zone not null default now()
      );



  create table "public"."salons" (
    "id" integer not null default nextval('public.salons_id_seq'::regclass),
    "name" text not null,
    "created_at" timestamp without time zone default now()
      );


alter table "public"."salons" enable row level security;


  create table "public"."service_categories" (
    "id" integer not null default nextval('public.service_categories_id_seq'::regclass),
    "name" text not null
      );



  create table "public"."service_prices" (
    "id" integer not null default nextval('public.service_prices_id_seq'::regclass),
    "salon_id" integer,
    "service_id" integer,
    "price" numeric(10,2) not null
      );


alter table "public"."service_prices" enable row level security;


  create table "public"."services" (
    "id" integer not null default nextval('public.services_id_seq'::regclass),
    "category_id" integer,
    "name" text not null,
    "description" text,
    "price" numeric(10,2) not null,
    "duration" integer not null,
    "color_code" text,
    "active" boolean default true,
    "created_at" timestamp without time zone default now(),
    "duration_active" integer default 0,
    "duration_processing" integer default 0,
    "need_processing" boolean default false,
    "vat_rate" numeric not null default 22,
    "is_active" boolean default true,
    "visible_in_agenda" boolean default true,
    "visible_in_cash" boolean default true
      );


alter table "public"."services" enable row level security;


  create table "public"."staff" (
    "id" integer not null default nextval('public.staff_id_seq'::regclass),
    "salon_id" integer not null,
    "name" text not null,
    "role" text default 'stylist'::text,
    "phone" text,
    "active" boolean default true,
    "created_at" timestamp without time zone default now(),
    "user_id" uuid,
    "internal_id" integer
      );


alter table "public"."staff" enable row level security;


  create table "public"."stock_movements" (
    "id" integer not null default nextval('public.stock_movements_id_seq'::regclass),
    "product_id" integer,
    "from_salon" integer,
    "to_salon" integer,
    "quantity" numeric(10,2) not null,
    "movement_type" text not null,
    "reason" text,
    "created_at" timestamp without time zone default now()
      );


alter table "public"."stock_movements" enable row level security;


  create table "public"."system_log" (
    "id" integer not null default nextval('public.system_log_id_seq'::regclass),
    "user_id" uuid,
    "salon_id" integer,
    "action" text not null,
    "table_name" text not null,
    "reference_id" text,
    "payload" jsonb,
    "created_at" timestamp without time zone default now()
      );


alter table "public"."system_log" enable row level security;


  create table "public"."technical_sheets" (
    "id" integer not null default nextval('public.technical_sheets_id_seq'::regclass),
    "customer_id" uuid,
    "salon_id" integer,
    "staff_id" integer,
    "date" timestamp without time zone default now(),
    "description" text,
    "notes" text,
    "created_at" timestamp without time zone default now()
      );


alter table "public"."technical_sheets" enable row level security;


  create table "public"."transfer_items" (
    "id" bigint generated by default as identity not null,
    "transfer_id" bigint not null,
    "product_id" integer not null,
    "qty" integer not null
      );


alter table "public"."transfer_items" enable row level security;


  create table "public"."transfers" (
    "id" bigint generated by default as identity not null,
    "from_salon" integer not null,
    "to_salon" integer not null,
    "date" date default now(),
    "causale" text,
    "note" text,
    "created_at" timestamp without time zone default now(),
    "executed_at" timestamp without time zone,
    "executed_by" uuid,
    "status" text not null default 'draft'::text
      );


alter table "public"."transfers" enable row level security;


  create table "public"."user_salons" (
    "id" integer not null default nextval('public.user_salons_id_seq'::regclass),
    "user_id" uuid,
    "salon_id" integer,
    "role_id" integer,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."user_salons" enable row level security;


  create table "public"."users" (
    "id" uuid not null default gen_random_uuid(),
    "email" text not null,
    "full_name" text,
    "phone" text,
    "role_id" integer,
    "created_at" timestamp without time zone default now()
      );


alter table "public"."users" enable row level security;

alter sequence "public"."appointments_id_seq" owned by "public"."appointments"."id";

alter sequence "public"."customer_tech_notes_id_seq" owned by "public"."customer_tech_notes"."id";

alter sequence "public"."fiscal_profiles_id_seq" owned by "public"."fiscal_profiles"."id";

alter sequence "public"."legal_entities_id_seq" owned by "public"."legal_entities"."id";

alter sequence "public"."notification_templates_id_seq" owned by "public"."notification_templates"."id";

alter sequence "public"."notifications_id_seq" owned by "public"."notifications"."id";

alter sequence "public"."product_stock_id_seq" owned by "public"."product_stock"."id";

alter sequence "public"."products_id_seq" owned by "public"."products"."id";

alter sequence "public"."roles_id_seq" owned by "public"."roles"."id";

alter sequence "public"."sale_items_id_seq" owned by "public"."sale_items"."id";

alter sequence "public"."sales_id_seq" owned by "public"."sales"."id";

alter sequence "public"."salon_fiscal_profiles_id_seq" owned by "public"."salon_fiscal_profiles"."id";

alter sequence "public"."salons_id_seq" owned by "public"."salons"."id";

alter sequence "public"."service_categories_id_seq" owned by "public"."service_categories"."id";

alter sequence "public"."service_prices_id_seq" owned by "public"."service_prices"."id";

alter sequence "public"."services_id_seq" owned by "public"."services"."id";

alter sequence "public"."staff_id_seq" owned by "public"."staff"."id";

alter sequence "public"."stock_movements_id_seq" owned by "public"."stock_movements"."id";

alter sequence "public"."system_log_id_seq" owned by "public"."system_log"."id";

alter sequence "public"."technical_sheets_id_seq" owned by "public"."technical_sheets"."id";

alter sequence "public"."user_salons_id_seq" owned by "public"."user_salons"."id";

CREATE UNIQUE INDEX appointment_services_pkey ON public.appointment_services USING btree (id);

CREATE UNIQUE INDEX appointment_services_unique ON public.appointment_services USING btree (appointment_id, service_id, staff_id);

CREATE UNIQUE INDEX appointments_pkey ON public.appointments USING btree (id);

CREATE UNIQUE INDEX cash_sessions_pkey ON public.cash_sessions USING btree (id);

CREATE UNIQUE INDEX cash_sessions_unique ON public.cash_sessions USING btree (salon_id, session_date);

CREATE UNIQUE INDEX customer_notes_pkey ON public.customer_notes USING btree (id);

CREATE INDEX customer_profile_customer_id_idx ON public.customer_profile USING btree (customer_id);

CREATE UNIQUE INDEX customer_profile_pkey ON public.customer_profile USING btree (customer_id);

CREATE INDEX customer_service_cards_created_at_idx ON public.customer_service_cards USING btree (created_at DESC);

CREATE INDEX customer_service_cards_customer_id_idx ON public.customer_service_cards USING btree (customer_id);

CREATE INDEX customer_service_cards_data_gin_idx ON public.customer_service_cards USING gin (data);

CREATE UNIQUE INDEX customer_service_cards_pkey ON public.customer_service_cards USING btree (id);

CREATE INDEX customer_service_cards_type_idx ON public.customer_service_cards USING btree (service_type);

CREATE INDEX customer_tech_notes_customer_date_idx ON public.customer_tech_notes USING btree (customer_id, note_date DESC, id DESC);

CREATE UNIQUE INDEX customer_tech_notes_pkey ON public.customer_tech_notes USING btree (id);

CREATE UNIQUE INDEX customer_technical_cards_pkey ON public.customer_technical_cards USING btree (id);

CREATE UNIQUE INDEX customers_phone_unique ON public.customers USING btree (phone);

CREATE UNIQUE INDEX customers_pkey ON public.customers USING btree (id);

CREATE INDEX fiscal_profiles_active_idx ON public.fiscal_profiles USING btree (salon_id, is_active);

CREATE UNIQUE INDEX fiscal_profiles_pkey ON public.fiscal_profiles USING btree (id);

CREATE INDEX fiscal_profiles_salon_dates_idx ON public.fiscal_profiles USING btree (salon_id, valid_from, valid_to);

CREATE INDEX idx_appointment_services_appointment_id ON public.appointment_services USING btree (appointment_id);

CREATE INDEX idx_appointments_customer_id ON public.appointments USING btree (customer_id);

CREATE INDEX idx_appointments_salon_id ON public.appointments USING btree (salon_id);

CREATE INDEX idx_appointments_start_time ON public.appointments USING btree (start_time);

CREATE INDEX idx_cash_sessions_active ON public.cash_sessions USING btree (salon_id) WHERE (closed_at IS NULL);

CREATE INDEX idx_transfer_items_product_id ON public.transfer_items USING btree (product_id);

CREATE INDEX idx_transfer_items_transfer_id ON public.transfer_items USING btree (transfer_id);

CREATE INDEX idx_transfers_date ON public.transfers USING btree (date);

CREATE INDEX idx_transfers_from_salon ON public.transfers USING btree (from_salon);

CREATE INDEX idx_transfers_status ON public.transfers USING btree (status);

CREATE INDEX idx_transfers_to_salon ON public.transfers USING btree (to_salon);

CREATE INDEX idx_user_salons_user_id ON public.user_salons USING btree (user_id);

CREATE UNIQUE INDEX legal_entities_pkey ON public.legal_entities USING btree (id);

CREATE UNIQUE INDEX legal_entities_vat_uq ON public.legal_entities USING btree (vat_number);

CREATE UNIQUE INDEX notification_templates_pkey ON public.notification_templates USING btree (id);

CREATE UNIQUE INDEX notifications_pkey ON public.notifications USING btree (id);

CREATE UNIQUE INDEX product_stock_pkey ON public.product_stock USING btree (id);

CREATE UNIQUE INDEX product_stock_product_id_salon_id_key ON public.product_stock USING btree (product_id, salon_id);

CREATE UNIQUE INDEX product_stock_product_salon_uniq ON public.product_stock USING btree (product_id, salon_id);

CREATE UNIQUE INDEX product_stock_product_salon_ux ON public.product_stock USING btree (product_id, salon_id);

CREATE UNIQUE INDEX products_pkey ON public.products USING btree (id);

CREATE UNIQUE INDEX products_sku_key ON public.products USING btree (sku);

CREATE UNIQUE INDEX roles_name_key ON public.roles USING btree (name);

CREATE UNIQUE INDEX roles_pkey ON public.roles USING btree (id);

CREATE UNIQUE INDEX sale_items_pkey ON public.sale_items USING btree (id);

CREATE UNIQUE INDEX sale_items_unique_sale_product ON public.sale_items USING btree (sale_id, product_id);

CREATE UNIQUE INDEX sales_pkey ON public.sales USING btree (id);

CREATE INDEX salon_fiscal_profiles_lookup_idx ON public.salon_fiscal_profiles USING btree (salon_id, effective_from, effective_to);

CREATE UNIQUE INDEX salon_fiscal_profiles_one_active_uq ON public.salon_fiscal_profiles USING btree (salon_id) WHERE (effective_to IS NULL);

CREATE UNIQUE INDEX salon_fiscal_profiles_pkey ON public.salon_fiscal_profiles USING btree (id);

CREATE UNIQUE INDEX salons_pkey ON public.salons USING btree (id);

CREATE UNIQUE INDEX service_categories_pkey ON public.service_categories USING btree (id);

CREATE UNIQUE INDEX service_prices_pkey ON public.service_prices USING btree (id);

CREATE UNIQUE INDEX service_prices_salon_id_service_id_key ON public.service_prices USING btree (salon_id, service_id);

CREATE UNIQUE INDEX services_pkey ON public.services USING btree (id);

CREATE UNIQUE INDEX staff_pkey ON public.staff USING btree (id);

CREATE UNIQUE INDEX staff_user_id_unique ON public.staff USING btree (user_id) WHERE (user_id IS NOT NULL);

CREATE UNIQUE INDEX stock_movements_pkey ON public.stock_movements USING btree (id);

CREATE UNIQUE INDEX system_log_pkey ON public.system_log USING btree (id);

CREATE UNIQUE INDEX technical_sheets_pkey ON public.technical_sheets USING btree (id);

CREATE UNIQUE INDEX transfer_items_pkey ON public.transfer_items USING btree (id);

CREATE UNIQUE INDEX transfers_pkey ON public.transfers USING btree (id);

CREATE UNIQUE INDEX user_salons_pkey ON public.user_salons USING btree (id);

CREATE UNIQUE INDEX user_salons_reception_unique ON public.user_salons USING btree (user_id) WHERE (role_id = 2);

CREATE UNIQUE INDEX user_salons_user_id_salon_id_key ON public.user_salons USING btree (user_id, salon_id);

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);

CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id);

alter table "public"."appointment_services" add constraint "appointment_services_pkey" PRIMARY KEY using index "appointment_services_pkey";

alter table "public"."appointments" add constraint "appointments_pkey" PRIMARY KEY using index "appointments_pkey";

alter table "public"."cash_sessions" add constraint "cash_sessions_pkey" PRIMARY KEY using index "cash_sessions_pkey";

alter table "public"."customer_notes" add constraint "customer_notes_pkey" PRIMARY KEY using index "customer_notes_pkey";

alter table "public"."customer_profile" add constraint "customer_profile_pkey" PRIMARY KEY using index "customer_profile_pkey";

alter table "public"."customer_service_cards" add constraint "customer_service_cards_pkey" PRIMARY KEY using index "customer_service_cards_pkey";

alter table "public"."customer_tech_notes" add constraint "customer_tech_notes_pkey" PRIMARY KEY using index "customer_tech_notes_pkey";

alter table "public"."customer_technical_cards" add constraint "customer_technical_cards_pkey" PRIMARY KEY using index "customer_technical_cards_pkey";

alter table "public"."customers" add constraint "customers_pkey" PRIMARY KEY using index "customers_pkey";

alter table "public"."fiscal_profiles" add constraint "fiscal_profiles_pkey" PRIMARY KEY using index "fiscal_profiles_pkey";

alter table "public"."legal_entities" add constraint "legal_entities_pkey" PRIMARY KEY using index "legal_entities_pkey";

alter table "public"."notification_templates" add constraint "notification_templates_pkey" PRIMARY KEY using index "notification_templates_pkey";

alter table "public"."notifications" add constraint "notifications_pkey" PRIMARY KEY using index "notifications_pkey";

alter table "public"."product_stock" add constraint "product_stock_pkey" PRIMARY KEY using index "product_stock_pkey";

alter table "public"."products" add constraint "products_pkey" PRIMARY KEY using index "products_pkey";

alter table "public"."roles" add constraint "roles_pkey" PRIMARY KEY using index "roles_pkey";

alter table "public"."sale_items" add constraint "sale_items_pkey" PRIMARY KEY using index "sale_items_pkey";

alter table "public"."sales" add constraint "sales_pkey" PRIMARY KEY using index "sales_pkey";

alter table "public"."salon_fiscal_profiles" add constraint "salon_fiscal_profiles_pkey" PRIMARY KEY using index "salon_fiscal_profiles_pkey";

alter table "public"."salons" add constraint "salons_pkey" PRIMARY KEY using index "salons_pkey";

alter table "public"."service_categories" add constraint "service_categories_pkey" PRIMARY KEY using index "service_categories_pkey";

alter table "public"."service_prices" add constraint "service_prices_pkey" PRIMARY KEY using index "service_prices_pkey";

alter table "public"."services" add constraint "services_pkey" PRIMARY KEY using index "services_pkey";

alter table "public"."staff" add constraint "staff_pkey" PRIMARY KEY using index "staff_pkey";

alter table "public"."stock_movements" add constraint "stock_movements_pkey" PRIMARY KEY using index "stock_movements_pkey";

alter table "public"."system_log" add constraint "system_log_pkey" PRIMARY KEY using index "system_log_pkey";

alter table "public"."technical_sheets" add constraint "technical_sheets_pkey" PRIMARY KEY using index "technical_sheets_pkey";

alter table "public"."transfer_items" add constraint "transfer_items_pkey" PRIMARY KEY using index "transfer_items_pkey";

alter table "public"."transfers" add constraint "transfers_pkey" PRIMARY KEY using index "transfers_pkey";

alter table "public"."user_salons" add constraint "user_salons_pkey" PRIMARY KEY using index "user_salons_pkey";

alter table "public"."users" add constraint "users_pkey" PRIMARY KEY using index "users_pkey";

alter table "public"."appointment_services" add constraint "appointment_services_appointment_id_fkey" FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE not valid;

alter table "public"."appointment_services" validate constraint "appointment_services_appointment_id_fkey";

alter table "public"."appointment_services" add constraint "appointment_services_service_id_fkey" FOREIGN KEY (service_id) REFERENCES public.services(id) not valid;

alter table "public"."appointment_services" validate constraint "appointment_services_service_id_fkey";

alter table "public"."appointment_services" add constraint "appointment_services_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES public.staff(id) not valid;

alter table "public"."appointment_services" validate constraint "appointment_services_staff_id_fkey";

alter table "public"."appointment_services" add constraint "appointment_services_unique" UNIQUE using index "appointment_services_unique";

alter table "public"."appointments" add constraint "appointments_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id) not valid;

alter table "public"."appointments" validate constraint "appointments_customer_id_fkey";

alter table "public"."appointments" add constraint "appointments_sale_id_fkey" FOREIGN KEY (sale_id) REFERENCES public.sales(id) not valid;

alter table "public"."appointments" validate constraint "appointments_sale_id_fkey";

alter table "public"."appointments" add constraint "appointments_salon_id_fkey" FOREIGN KEY (salon_id) REFERENCES public.salons(id) ON DELETE CASCADE not valid;

alter table "public"."appointments" validate constraint "appointments_salon_id_fkey";

alter table "public"."appointments" add constraint "appointments_service_id_fkey" FOREIGN KEY (service_id) REFERENCES public.services(id) not valid;

alter table "public"."appointments" validate constraint "appointments_service_id_fkey";

alter table "public"."appointments" add constraint "appointments_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES public.staff(id) not valid;

alter table "public"."appointments" validate constraint "appointments_staff_id_fkey";

alter table "public"."cash_sessions" add constraint "cash_sessions_closed_by_fkey" FOREIGN KEY (closed_by) REFERENCES auth.users(id) not valid;

alter table "public"."cash_sessions" validate constraint "cash_sessions_closed_by_fkey";

alter table "public"."cash_sessions" add constraint "cash_sessions_opened_by_fkey" FOREIGN KEY (opened_by) REFERENCES auth.users(id) not valid;

alter table "public"."cash_sessions" validate constraint "cash_sessions_opened_by_fkey";

alter table "public"."cash_sessions" add constraint "cash_sessions_salon_id_fkey" FOREIGN KEY (salon_id) REFERENCES public.salons(id) not valid;

alter table "public"."cash_sessions" validate constraint "cash_sessions_salon_id_fkey";

alter table "public"."customer_notes" add constraint "customer_notes_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE not valid;

alter table "public"."customer_notes" validate constraint "customer_notes_customer_id_fkey";

alter table "public"."customer_profile" add constraint "customer_profile_baseline_level_check" CHECK (((baseline_level >= 1) AND (baseline_level <= 10))) not valid;

alter table "public"."customer_profile" validate constraint "customer_profile_baseline_level_check";

alter table "public"."customer_profile" add constraint "customer_profile_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE not valid;

alter table "public"."customer_profile" validate constraint "customer_profile_customer_id_fkey";

alter table "public"."customer_profile" add constraint "customer_profile_density_check" CHECK ((density = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))) not valid;

alter table "public"."customer_profile" validate constraint "customer_profile_density_check";

alter table "public"."customer_profile" add constraint "customer_profile_elasticity_check" CHECK ((elasticity = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text]))) not valid;

alter table "public"."customer_profile" validate constraint "customer_profile_elasticity_check";

alter table "public"."customer_profile" add constraint "customer_profile_frizz_level_check" CHECK ((frizz_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))) not valid;

alter table "public"."customer_profile" validate constraint "customer_profile_frizz_level_check";

alter table "public"."customer_profile" add constraint "customer_profile_porosity_check" CHECK ((porosity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))) not valid;

alter table "public"."customer_profile" validate constraint "customer_profile_porosity_check";

alter table "public"."customer_profile" add constraint "customer_profile_scalp_check" CHECK ((scalp = ANY (ARRAY['dry'::text, 'normal'::text, 'oily'::text, 'sensitive'::text]))) not valid;

alter table "public"."customer_profile" validate constraint "customer_profile_scalp_check";

alter table "public"."customer_profile" add constraint "customer_profile_texture_check" CHECK ((texture = ANY (ARRAY['straight'::text, 'wavy'::text, 'curly'::text, 'coily'::text]))) not valid;

alter table "public"."customer_profile" validate constraint "customer_profile_texture_check";

alter table "public"."customer_profile" add constraint "customer_profile_thickness_check" CHECK ((thickness = ANY (ARRAY['fine'::text, 'normal'::text, 'thick'::text]))) not valid;

alter table "public"."customer_profile" validate constraint "customer_profile_thickness_check";

alter table "public"."customer_service_cards" add constraint "customer_service_cards_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE not valid;

alter table "public"."customer_service_cards" validate constraint "customer_service_cards_customer_id_fkey";

alter table "public"."customer_service_cards" add constraint "customer_service_cards_service_type_check" CHECK ((service_type = ANY (ARRAY['oxidation'::text, 'direct'::text, 'botanicals'::text, 'gloss'::text, 'lightening'::text, 'keratin'::text, 'treatment'::text]))) not valid;

alter table "public"."customer_service_cards" validate constraint "customer_service_cards_service_type_check";

alter table "public"."customer_tech_notes" add constraint "customer_tech_notes_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE not valid;

alter table "public"."customer_tech_notes" validate constraint "customer_tech_notes_customer_id_fkey";

alter table "public"."customer_tech_notes" add constraint "customer_tech_notes_salon_id_fkey" FOREIGN KEY (salon_id) REFERENCES public.salons(id) ON DELETE SET NULL not valid;

alter table "public"."customer_tech_notes" validate constraint "customer_tech_notes_salon_id_fkey";

alter table "public"."customer_tech_notes" add constraint "customer_tech_notes_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE SET NULL not valid;

alter table "public"."customer_tech_notes" validate constraint "customer_tech_notes_staff_id_fkey";

alter table "public"."customer_technical_cards" add constraint "customer_technical_cards_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE not valid;

alter table "public"."customer_technical_cards" validate constraint "customer_technical_cards_customer_id_fkey";

alter table "public"."fiscal_profiles" add constraint "fiscal_profiles_salon_id_fkey" FOREIGN KEY (salon_id) REFERENCES public.salons(id) ON DELETE CASCADE not valid;

alter table "public"."fiscal_profiles" validate constraint "fiscal_profiles_salon_id_fkey";

alter table "public"."fiscal_profiles" add constraint "fiscal_profiles_valid_range_chk" CHECK (((valid_to IS NULL) OR (valid_to >= valid_from))) not valid;

alter table "public"."fiscal_profiles" validate constraint "fiscal_profiles_valid_range_chk";

alter table "public"."notifications" add constraint "notifications_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id) not valid;

alter table "public"."notifications" validate constraint "notifications_customer_id_fkey";

alter table "public"."notifications" add constraint "notifications_salon_id_fkey" FOREIGN KEY (salon_id) REFERENCES public.salons(id) not valid;

alter table "public"."notifications" validate constraint "notifications_salon_id_fkey";

alter table "public"."notifications" add constraint "notifications_template_id_fkey" FOREIGN KEY (template_id) REFERENCES public.notification_templates(id) not valid;

alter table "public"."notifications" validate constraint "notifications_template_id_fkey";

alter table "public"."product_stock" add constraint "product_stock_non_negative" CHECK ((quantity >= (0)::numeric)) not valid;

alter table "public"."product_stock" validate constraint "product_stock_non_negative";

alter table "public"."product_stock" add constraint "product_stock_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."product_stock" validate constraint "product_stock_product_id_fkey";

alter table "public"."product_stock" add constraint "product_stock_product_id_salon_id_key" UNIQUE using index "product_stock_product_id_salon_id_key";

alter table "public"."product_stock" add constraint "product_stock_salon_id_fkey" FOREIGN KEY (salon_id) REFERENCES public.salons(id) ON DELETE CASCADE not valid;

alter table "public"."product_stock" validate constraint "product_stock_salon_id_fkey";

alter table "public"."products" add constraint "products_sku_key" UNIQUE using index "products_sku_key";

alter table "public"."roles" add constraint "roles_name_key" UNIQUE using index "roles_name_key";

alter table "public"."sale_items" add constraint "sale_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL not valid;

alter table "public"."sale_items" validate constraint "sale_items_product_id_fkey";

alter table "public"."sale_items" add constraint "sale_items_sale_id_fkey" FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE not valid;

alter table "public"."sale_items" validate constraint "sale_items_sale_id_fkey";

alter table "public"."sale_items" add constraint "sale_items_service_id_fkey" FOREIGN KEY (service_id) REFERENCES public.services(id) not valid;

alter table "public"."sale_items" validate constraint "sale_items_service_id_fkey";

alter table "public"."sale_items" add constraint "sale_items_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES public.staff(id) not valid;

alter table "public"."sale_items" validate constraint "sale_items_staff_id_fkey";

alter table "public"."sale_items" add constraint "sale_items_unique_sale_product" UNIQUE using index "sale_items_unique_sale_product";

alter table "public"."sales" add constraint "sales_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id) not valid;

alter table "public"."sales" validate constraint "sales_customer_id_fkey";

alter table "public"."sales" add constraint "sales_salon_id_fkey" FOREIGN KEY (salon_id) REFERENCES public.salons(id) ON DELETE CASCADE not valid;

alter table "public"."sales" validate constraint "sales_salon_id_fkey";

alter table "public"."salon_fiscal_profiles" add constraint "salon_fiscal_profiles_dates_chk" CHECK (((effective_to IS NULL) OR (effective_to >= effective_from))) not valid;

alter table "public"."salon_fiscal_profiles" validate constraint "salon_fiscal_profiles_dates_chk";

alter table "public"."salon_fiscal_profiles" add constraint "salon_fiscal_profiles_legal_entity_id_fkey" FOREIGN KEY (legal_entity_id) REFERENCES public.legal_entities(id) not valid;

alter table "public"."salon_fiscal_profiles" validate constraint "salon_fiscal_profiles_legal_entity_id_fkey";

alter table "public"."salon_fiscal_profiles" add constraint "salon_fiscal_profiles_salon_id_fkey" FOREIGN KEY (salon_id) REFERENCES public.salons(id) ON DELETE CASCADE not valid;

alter table "public"."salon_fiscal_profiles" validate constraint "salon_fiscal_profiles_salon_id_fkey";

alter table "public"."service_prices" add constraint "service_prices_salon_id_fkey" FOREIGN KEY (salon_id) REFERENCES public.salons(id) ON DELETE CASCADE not valid;

alter table "public"."service_prices" validate constraint "service_prices_salon_id_fkey";

alter table "public"."service_prices" add constraint "service_prices_salon_id_service_id_key" UNIQUE using index "service_prices_salon_id_service_id_key";

alter table "public"."service_prices" add constraint "service_prices_service_id_fkey" FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE not valid;

alter table "public"."service_prices" validate constraint "service_prices_service_id_fkey";

alter table "public"."services" add constraint "services_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public.service_categories(id) not valid;

alter table "public"."services" validate constraint "services_category_id_fkey";

alter table "public"."staff" add constraint "staff_role_check" CHECK ((role = ANY (ARRAY['stylist'::text, 'reception'::text, 'estetista'::text, 'assistant'::text, 'manager'::text]))) not valid;

alter table "public"."staff" validate constraint "staff_role_check";

alter table "public"."staff" add constraint "staff_salon_id_fkey" FOREIGN KEY (salon_id) REFERENCES public.salons(id) ON DELETE CASCADE not valid;

alter table "public"."staff" validate constraint "staff_salon_id_fkey";

alter table "public"."staff" add constraint "staff_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."staff" validate constraint "staff_user_id_fkey";

alter table "public"."stock_movements" add constraint "stock_movements_from_salon_fkey" FOREIGN KEY (from_salon) REFERENCES public.salons(id) not valid;

alter table "public"."stock_movements" validate constraint "stock_movements_from_salon_fkey";

alter table "public"."stock_movements" add constraint "stock_movements_movement_type_check" CHECK ((movement_type = ANY (ARRAY['load'::text, 'unload'::text, 'transfer'::text, 'sale'::text]))) not valid;

alter table "public"."stock_movements" validate constraint "stock_movements_movement_type_check";

alter table "public"."stock_movements" add constraint "stock_movements_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) not valid;

alter table "public"."stock_movements" validate constraint "stock_movements_product_id_fkey";

alter table "public"."stock_movements" add constraint "stock_movements_to_salon_fkey" FOREIGN KEY (to_salon) REFERENCES public.salons(id) not valid;

alter table "public"."stock_movements" validate constraint "stock_movements_to_salon_fkey";

alter table "public"."system_log" add constraint "system_log_salon_id_fkey" FOREIGN KEY (salon_id) REFERENCES public.salons(id) not valid;

alter table "public"."system_log" validate constraint "system_log_salon_id_fkey";

alter table "public"."system_log" add constraint "system_log_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id) not valid;

alter table "public"."system_log" validate constraint "system_log_user_id_fkey";

alter table "public"."technical_sheets" add constraint "technical_sheets_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE not valid;

alter table "public"."technical_sheets" validate constraint "technical_sheets_customer_id_fkey";

alter table "public"."technical_sheets" add constraint "technical_sheets_salon_id_fkey" FOREIGN KEY (salon_id) REFERENCES public.salons(id) not valid;

alter table "public"."technical_sheets" validate constraint "technical_sheets_salon_id_fkey";

alter table "public"."technical_sheets" add constraint "technical_sheets_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES public.staff(id) not valid;

alter table "public"."technical_sheets" validate constraint "technical_sheets_staff_id_fkey";

alter table "public"."transfer_items" add constraint "transfer_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) not valid;

alter table "public"."transfer_items" validate constraint "transfer_items_product_id_fkey";

alter table "public"."transfer_items" add constraint "transfer_items_qty_check" CHECK ((qty > 0)) not valid;

alter table "public"."transfer_items" validate constraint "transfer_items_qty_check";

alter table "public"."transfer_items" add constraint "transfer_items_transfer_id_fkey" FOREIGN KEY (transfer_id) REFERENCES public.transfers(id) ON DELETE CASCADE not valid;

alter table "public"."transfer_items" validate constraint "transfer_items_transfer_id_fkey";

alter table "public"."transfers" add constraint "transfers_from_salon_fkey" FOREIGN KEY (from_salon) REFERENCES public.salons(id) not valid;

alter table "public"."transfers" validate constraint "transfers_from_salon_fkey";

alter table "public"."transfers" add constraint "transfers_from_to_check" CHECK ((from_salon <> to_salon)) not valid;

alter table "public"."transfers" validate constraint "transfers_from_to_check";

alter table "public"."transfers" add constraint "transfers_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'ready'::text, 'executed'::text, 'cancelled'::text]))) not valid;

alter table "public"."transfers" validate constraint "transfers_status_check";

alter table "public"."transfers" add constraint "transfers_to_salon_fkey" FOREIGN KEY (to_salon) REFERENCES public.salons(id) not valid;

alter table "public"."transfers" validate constraint "transfers_to_salon_fkey";

alter table "public"."user_salons" add constraint "user_salons_role_id_fkey" FOREIGN KEY (role_id) REFERENCES public.roles(id) not valid;

alter table "public"."user_salons" validate constraint "user_salons_role_id_fkey";

alter table "public"."user_salons" add constraint "user_salons_salon_id_fkey" FOREIGN KEY (salon_id) REFERENCES public.salons(id) ON DELETE CASCADE not valid;

alter table "public"."user_salons" validate constraint "user_salons_salon_id_fkey";

alter table "public"."user_salons" add constraint "user_salons_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE not valid;

alter table "public"."user_salons" validate constraint "user_salons_user_id_fkey";

alter table "public"."user_salons" add constraint "user_salons_user_id_salon_id_key" UNIQUE using index "user_salons_user_id_salon_id_key";

alter table "public"."users" add constraint "users_email_key" UNIQUE using index "users_email_key";

alter table "public"."users" add constraint "users_role_id_fkey" FOREIGN KEY (role_id) REFERENCES public.roles(id) not valid;

alter table "public"."users" validate constraint "users_role_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public._sm_export_table(_tbl text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare j jsonb;
begin
  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (select * from %I) t',
    _tbl
  ) into j;
  return j;
exception when undefined_table then
  return '[]'::jsonb;
end $function$
;

CREATE OR REPLACE FUNCTION public._sm_rowcount(_tbl text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare c bigint;
begin
  execute format('select count(*)::bigint from %I', _tbl) into c;
  return c;
exception when undefined_table then
  return 0;
end $function$
;

CREATE OR REPLACE FUNCTION public.app_role()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(
    (auth.jwt() -> 'user_metadata' ->> 'role'),
    ''
  );
$function$
;

CREATE OR REPLACE FUNCTION public.app_salon_id()
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  select nullif((auth.jwt() -> 'user_metadata' ->> 'salon_id'), '')::int;
$function$
;

CREATE OR REPLACE FUNCTION public.appointment_checkin(p_appointment_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_salon_id int;
  v_row public.appointments%rowtype;
begin
  select salon_id into v_salon_id
  from public.appointments
  where id = p_appointment_id;

  if not found then
    raise exception 'appointment % not found', p_appointment_id;
  end if;

  if not public.can_access_salon(v_salon_id) then
    raise exception 'access denied (salon_id=%)', v_salon_id;
  end if;

  update public.appointments
  set
    processing_start = coalesce(processing_start, now()),
    status = 'in_progress'
  where id = p_appointment_id
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'appointment_id', v_row.id,
    'salon_id', v_row.salon_id,
    'status', v_row.status,
    'processing_start', v_row.processing_start
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.auth_role()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role'),
    (auth.jwt() -> 'user_metadata' ->> 'role'),
    'salone'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.auth_salon_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v text;
begin
  v := coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'salon_id', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'salon_id', ''),
    null
  );

  if v is null then
    return null;
  end if;

  begin
    return v::uuid;
  exception when others then
    return null;
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.auth_salon_int()
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v text;
begin
  v := coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'salon_id', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'salon_id', ''),
    null
  );

  if v is null then
    return null;
  end if;

  begin
    return v::integer;
  exception when others then
    return null;
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.can_access_customer(p_customer_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select
    case
      when public.is_coordinator() or public.is_magazzino() then true
      else exists (
        select 1
        from public.appointments a
        where a.customer_id = p_customer_id
          and public.can_access_salon(a.salon_id)
        limit 1
      )
    end;
$function$
;

CREATE OR REPLACE FUNCTION public.can_access_salon(p_salon_id integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select
    case
      when public.is_coordinator() or public.is_magazzino() then true
      else public.current_salon_id() = p_salon_id
    end;
$function$
;

CREATE OR REPLACE FUNCTION public.can_access_salon(p_user_id uuid, p_salon_id integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select public.can_access_salon(p_salon_id);
$function$
;

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


CREATE OR REPLACE FUNCTION public.close_cash_session(p_salon_id integer, p_date date, p_closing_cash numeric, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(cash_session_id bigint, cash_difference numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id bigint;
  v_opening numeric;
  v_expected_cash numeric;
  v_diff numeric;
begin
  if p_salon_id is null then
    raise exception 'salon_id mancante';
  end if;

  if p_date is null then
    raise exception 'date mancante';
  end if;

  if p_closing_cash is null then
    raise exception 'closing_cash mancante';
  end if;

  if not public.can_access_salon(p_salon_id) then
    raise exception 'accesso negato al salone %', p_salon_id;
  end if;

  -- prendo (o creo) la sessione
  insert into public.cash_sessions (salon_id, session_date, opened_by, opening_cash, status)
  values (p_salon_id, p_date, auth.uid(), 0, 'open')
  on conflict (salon_id, session_date) do nothing;

  select id, opening_cash
  into v_id, v_opening
  from public.cash_sessions
  where salon_id = p_salon_id and session_date = p_date
  for update;

  v_expected_cash := coalesce((
    select sum(total_amount)
    from public.sales s
    where s.salon_id = p_salon_id
      and date(s.created_at) = p_date
      and s.payment_method = 'cash'
  ), 0);

  v_diff := round(p_closing_cash - (coalesce(v_opening,0) + v_expected_cash), 2);

  update public.cash_sessions
  set
    closing_cash = p_closing_cash,
    closed_by = auth.uid(),
    closed_at = now(),
    status = 'closed',
    notes = coalesce(p_notes, notes)
  where id = v_id;

  cash_session_id := v_id;
  cash_difference := v_diff;
  return next;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_sale(p_salon_id integer, p_items jsonb, p_payment_method text)
 RETURNS TABLE(sale_id bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_sale_id bigint;
  v_item jsonb;
  v_product_id int;
  v_qty int;
  v_price numeric;
  v_total numeric := 0;
begin
  if p_salon_id is null then
    raise exception 'salon_id mancante';
  end if;

  if p_payment_method is null or btrim(p_payment_method) = '' then
    raise exception 'payment_method mancante';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'items mancanti o non validi';
  end if;

  -- valida items + totale
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::int;
    v_qty := (v_item->>'qty')::int;
    v_price := nullif((v_item->>'price')::text,'')::numeric;

    if v_product_id is null or v_qty is null or v_qty <= 0 then
      raise exception 'item non valido (%)', v_item;
    end if;

    if v_price is null or v_price < 0 then
      raise exception 'price mancante/non valido (%)', v_item;
    end if;

    v_total := v_total + (v_price * v_qty);
  end loop;

  -- crea sale
  insert into public.sales (salon_id, total_amount, payment_method)
  values (p_salon_id, v_total, p_payment_method)
  returning id into v_sale_id;

  -- items + stock + movimenti
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::int;
    v_qty := (v_item->>'qty')::int;
    v_price := (v_item->>'price')::numeric;

    insert into public.product_stock (product_id, salon_id, quantity)
    values (v_product_id, p_salon_id, 0)
    on conflict (product_id, salon_id) do nothing;

    perform 1
    from public.product_stock
    where product_id = v_product_id
      and salon_id = p_salon_id
    for update;

    if (select quantity
        from public.product_stock
        where product_id = v_product_id
          and salon_id = p_salon_id) < v_qty then
      raise exception 'Stock insufficiente (product_id=%)', v_product_id;
    end if;

    insert into public.sale_items (sale_id, product_id, quantity, price)
    values (v_sale_id, v_product_id, v_qty, v_price);

    update public.product_stock
    set quantity = quantity - v_qty
    where product_id = v_product_id
      and salon_id = p_salon_id;

    insert into public.stock_movements (product_id, from_salon, to_salon, quantity, movement_type, reason)
    values (v_product_id, p_salon_id, null, -v_qty, 'sale', 'sale #' || v_sale_id);
  end loop;

  sale_id := v_sale_id;
  return next;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.current_role_name()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(
    (select r.name
     from public.users u
     join public.roles r on r.id = u.role_id
     where u.id = auth.uid()
     limit 1
    ),
    nullif(auth.jwt() ->> 'role',''),
    nullif((auth.jwt() -> 'app_metadata' ->> 'role'),''),
    nullif((auth.jwt() -> 'user_metadata' ->> 'role'),''),
    ''
  );
$function$
;

CREATE OR REPLACE FUNCTION public.current_salon_id()
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(
    (select us.salon_id
     from public.user_salons us
     where us.user_id = auth.uid()
     order by us.id desc
     limit 1
    ),
    nullif(auth.jwt() ->> 'salon_id','')::int,
    nullif((auth.jwt() -> 'app_metadata' ->> 'salon_id'),'')::int,
    nullif((auth.jwt() -> 'user_metadata' ->> 'salon_id'),'')::int,
    null
  );
$function$
;

CREATE OR REPLACE FUNCTION public.current_salon_id_safe()
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COALESCE(public.current_salon_id(), -1)
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

CREATE OR REPLACE FUNCTION public.export_all_tables_json()
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  result jsonb := '{}'::jsonb;
  r record;
  table_data jsonb;
begin
  for r in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format(
      'select jsonb_agg(t) from %I.%I t',
      'public',
      r.tablename
    )
    into table_data;

    result := result || jsonb_build_object(r.tablename, table_data);
  end loop;

  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_fiscal_profile(p_salon_id integer, p_on_date date)
 RETURNS TABLE(id bigint, salon_id integer, legal_name text, vat_number text, tax_code text, printer_model text, printer_serial text, valid_from date, valid_to date)
 LANGUAGE sql
 STABLE
AS $function$
  select
    fp.id,
    fp.salon_id,
    fp.legal_name,
    fp.vat_number,
    fp.tax_code,
    fp.printer_model,
    fp.printer_serial,
    fp.valid_from,
    fp.valid_to
  from public.fiscal_profiles fp
  where fp.salon_id = p_salon_id
    and fp.is_active = true
    and fp.valid_from <= p_on_date
    and (fp.valid_to is null or fp.valid_to >= p_on_date)
  order by fp.valid_from desc
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_server_date()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select to_char(timezone('Europe/Rome', now()), 'YYYY-MM-DD');
$function$
;

CREATE OR REPLACE FUNCTION public.is_coordinator()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$ select public.current_role_name() = 'coordinator'; $function$
;

CREATE OR REPLACE FUNCTION public.is_magazzino()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$ select public.current_role_name() = 'magazzino'; $function$
;

CREATE OR REPLACE FUNCTION public.is_reception()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$ select public.current_role_name() = 'reception'; $function$
;

CREATE OR REPLACE FUNCTION public.is_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select public.current_role_name() in ('coordinator','magazzino','reception');
$function$
;

CREATE OR REPLACE FUNCTION public.jwt_custom_claims()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
    select jsonb_build_object(
        'role',
            (select r.name
             from public.roles r
             join public.users u on u.role_id = r.id
             where u.id = auth.uid()
            ),
        'salon_id',
            (select us.salon_id
             from public.user_salons us
             where us.user_id = auth.uid()
             limit 1)
    );
$function$
;

CREATE OR REPLACE FUNCTION public.jwt_role()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(auth.jwt() ->> 'role', '');
$function$
;

CREATE OR REPLACE FUNCTION public.jwt_salon_id()
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  select nullif(auth.jwt() ->> 'salon_id', '')::int;
$function$
;

create or replace view "public"."movimenti_view" as  SELECT sm.id,
    sm.created_at,
    sm.product_id,
    p.name AS product_name,
    p.category,
    sm.quantity AS qty,
    sm.movement_type AS type,
    sm.from_salon,
    sm.to_salon
   FROM (public.stock_movements sm
     JOIN public.products p ON ((p.id = sm.product_id)))
  ORDER BY sm.created_at DESC;


CREATE OR REPLACE FUNCTION public.open_cash_session(p_salon_id integer, p_date date DEFAULT CURRENT_DATE, p_opening_cash numeric DEFAULT 0, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(cash_session_id bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id bigint;
begin
  if p_salon_id is null then
    raise exception 'salon_id mancante';
  end if;

  if not public.can_access_salon(p_salon_id) then
    raise exception 'accesso negato al salone %', p_salon_id;
  end if;

  insert into public.cash_sessions (salon_id, session_date, opened_by, opening_cash, notes, status)
  values (p_salon_id, p_date, auth.uid(), coalesce(p_opening_cash,0), p_notes, 'open')
  on conflict (salon_id, session_date) do update
    set opening_cash = excluded.opening_cash,
        notes = coalesce(excluded.notes, public.cash_sessions.notes)
  returning id into v_id;

  cash_session_id := v_id;
  return next;
end;
$function$
;

create or replace view "public"."products_with_stock" as  SELECT p.id AS product_id,
    p.name,
    p.category,
    p.sku,
    p.unit,
    p.barcode,
    p.cost,
    p.type,
    p.description,
    ps.salon_id,
    COALESCE(ps.quantity, (0)::numeric) AS quantity
   FROM (public.products p
     LEFT JOIN public.product_stock ps ON ((ps.product_id = p.id)));


CREATE OR REPLACE FUNCTION public.report_multisalon_turnover(p_date_from date, p_date_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rows jsonb;
  v_totals jsonb;
begin
  if p_date_from is null or p_date_to is null then
    raise exception 'date_from/date_to mancanti';
  end if;

  -- Per salone (solo quelli accessibili all'utente)
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'salon_id', x.salon_id,
        'gross_total', x.gross_total,
        'net_total', x.net_total,
        'vat_total', x.vat_total,
        'discount_total', x.discount_total
      )
      order by x.salon_id
    ),
    '[]'::jsonb
  )
  into v_rows
  from (
    select
      r.salon_id,
      round(sum(r.line_total_gross),2) as gross_total,
      round(sum(r.line_net),2) as net_total,
      round(sum(r.line_vat),2) as vat_total,
      round(sum(r.item_discount),2) as discount_total
    from public.sale_items_report r
    where r.sale_day between p_date_from and p_date_to
      and public.can_access_salon(r.salon_id)
    group by r.salon_id
  ) x;

  -- Totale generale (somma dei saloni accessibili)
  select jsonb_build_object(
    'date_from', p_date_from,
    'date_to', p_date_to,
    'gross_total', coalesce(round(sum(r.line_total_gross),2),0),
    'net_total',   coalesce(round(sum(r.line_net),2),0),
    'vat_total',   coalesce(round(sum(r.line_vat),2),0),
    'discount_total', coalesce(round(sum(r.item_discount),2),0)
  )
  into v_totals
  from public.sale_items_report r
  where r.sale_day between p_date_from and p_date_to
    and public.can_access_salon(r.salon_id);

  return jsonb_build_object(
    'report', 'multisalon_turnover',
    'totals', v_totals,
    'salons', v_rows
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.report_multisalon_turnover_admin(p_date_from date, p_date_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rows jsonb;
  v_totals jsonb;
begin
  if p_date_from is null or p_date_to is null then
    raise exception 'date_from/date_to mancanti';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'salon_id', x.salon_id,
        'gross_total', x.gross_total,
        'net_total', x.net_total,
        'vat_total', x.vat_total,
        'discount_total', x.discount_total
      )
      order by x.salon_id
    ),
    '[]'::jsonb
  )
  into v_rows
  from (
    select
      r.salon_id,
      round(sum(r.line_total_gross),2) as gross_total,
      round(sum(r.line_net),2) as net_total,
      round(sum(r.line_vat),2) as vat_total,
      round(sum(r.item_discount),2) as discount_total
    from public.sale_items_report r
    where r.sale_day between p_date_from and p_date_to
    group by r.salon_id
  ) x;

  select jsonb_build_object(
    'date_from', p_date_from,
    'date_to', p_date_to,
    'gross_total', coalesce(round(sum(r.line_total_gross),2),0),
    'net_total',   coalesce(round(sum(r.line_net),2),0),
    'vat_total',   coalesce(round(sum(r.line_vat),2),0),
    'discount_total', coalesce(round(sum(r.item_discount),2),0)
  )
  into v_totals
  from public.sale_items_report r
  where r.sale_day between p_date_from and p_date_to;

  return jsonb_build_object(
    'report', 'multisalon_turnover_admin',
    'totals', v_totals,
    'salons', v_rows
  );
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

CREATE OR REPLACE FUNCTION public.report_salon_turnover(p_salon_id integer, p_date_from date, p_date_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_totals jsonb;
  v_payments jsonb;
begin
  if p_salon_id is null then
    raise exception 'salon_id mancante';
  end if;

  if p_date_from is null or p_date_to is null then
    raise exception 'date_from/date_to mancanti';
  end if;

  if not public.can_access_salon(p_salon_id) then
    raise exception 'accesso negato al salone %', p_salon_id;
  end if;

  -- Totali (imponibile/iva/totale/sconti)
  select jsonb_build_object(
    'salon_id', p_salon_id,
    'date_from', p_date_from,
    'date_to', p_date_to,
    'gross_total', coalesce(round(sum(r.line_total_gross),2),0),
    'net_total',   coalesce(round(sum(r.line_net),2),0),
    'vat_total',   coalesce(round(sum(r.line_vat),2),0),
    'discount_total', coalesce(round(sum(r.item_discount),2),0)
  )
  into v_totals
  from public.sale_items_report r
  where r.salon_id = p_salon_id
    and r.sale_day between p_date_from and p_date_to;

  -- Totali per metodo pagamento (prima aggrego, poi json)
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'payment_method', x.payment_method,
        'gross_total', x.gross_total,
        'net_total', x.net_total,
        'vat_total', x.vat_total,
        'discount_total', x.discount_total
      )
      order by x.payment_method
    ),
    '[]'::jsonb
  )
  into v_payments
  from (
    select
      payment_method,
      round(sum(line_total_gross),2) as gross_total,
      round(sum(line_net),2) as net_total,
      round(sum(line_vat),2) as vat_total,
      round(sum(item_discount),2) as discount_total
    from public.sale_items_report
    where salon_id = p_salon_id
      and sale_day between p_date_from and p_date_to
    group by payment_method
  ) x;

  return jsonb_build_object(
    'report', 'salon_turnover',
    'totals', v_totals,
    'payments', v_payments
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.report_services_summary(p_salon_id integer, p_date_from date, p_date_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rows jsonb;
  v_totals jsonb;
begin
  if p_salon_id is null then
    raise exception 'salon_id mancante';
  end if;

  if p_date_from is null or p_date_to is null then
    raise exception 'date_from/date_to mancanti';
  end if;

  if not public.can_access_salon(p_salon_id) then
    raise exception 'accesso negato al salone %', p_salon_id;
  end if;

  -- Totali servizi (imponibile/iva/lordo/sconti + numero servizi)
  select jsonb_build_object(
    'salon_id', p_salon_id,
    'date_from', p_date_from,
    'date_to', p_date_to,
    'services_count', coalesce(sum(r.quantity),0),
    'gross_total', coalesce(round(sum(r.line_total_gross),2),0),
    'net_total',   coalesce(round(sum(r.line_net),2),0),
    'vat_total',   coalesce(round(sum(r.line_vat),2),0),
    'discount_total', coalesce(round(sum(r.item_discount),2),0)
  )
  into v_totals
  from public.sale_items_report r
  where r.salon_id = p_salon_id
    and r.sale_day between p_date_from and p_date_to
    and r.item_type = 'service';

  -- Dettaglio per servizio
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'service_id', x.service_id,
        'service_name', x.service_name,
        'count', x.count,
        'gross_total', x.gross_total,
        'net_total', x.net_total,
        'vat_total', x.vat_total,
        'discount_total', x.discount_total
      )
      order by x.gross_total desc
    ),
    '[]'::jsonb
  )
  into v_rows
  from (
    select
      r.service_id,
      max(r.service_name) as service_name,
      sum(r.quantity) as count,
      round(sum(r.line_total_gross),2) as gross_total,
      round(sum(r.line_net),2) as net_total,
      round(sum(r.line_vat),2) as vat_total,
      round(sum(r.item_discount),2) as discount_total
    from public.sale_items_report r
    where r.salon_id = p_salon_id
      and r.sale_day between p_date_from and p_date_to
      and r.item_type = 'service'
    group by r.service_id
  ) x;

  return jsonb_build_object(
    'report', 'services_summary',
    'totals', v_totals,
    'services', v_rows
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.report_staff_services_and_retail(p_salon_id integer, p_date_from date, p_date_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rows jsonb;
  v_totals jsonb;
begin
  if p_salon_id is null then
    raise exception 'salon_id mancante';
  end if;

  if p_date_from is null or p_date_to is null then
    raise exception 'date_from/date_to mancanti';
  end if;

  if not public.can_access_salon(p_salon_id) then
    raise exception 'accesso negato al salone %', p_salon_id;
  end if;

  -- Totali complessivi (servizi + prodotti)
  select jsonb_build_object(
    'salon_id', p_salon_id,
    'date_from', p_date_from,
    'date_to', p_date_to,
    'gross_total', coalesce(round(sum(r.line_total_gross),2),0),
    'net_total',   coalesce(round(sum(r.line_net),2),0),
    'vat_total',   coalesce(round(sum(r.line_vat),2),0),
    'discount_total', coalesce(round(sum(r.item_discount),2),0)
  )
  into v_totals
  from public.sale_items_report r
  where r.salon_id = p_salon_id
    and r.sale_day between p_date_from and p_date_to
    and r.staff_id is not null;

  -- Dettaglio per dipendente
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'staff_id', x.staff_id,
        'staff_name', x.staff_name,

        'services_count', x.services_count,
        'services_gross', x.services_gross,
        'services_net', x.services_net,
        'services_vat', x.services_vat,
        'services_discount', x.services_discount,

        'retail_units', x.retail_units,
        'retail_gross', x.retail_gross,
        'retail_net', x.retail_net,
        'retail_vat', x.retail_vat,
        'retail_discount', x.retail_discount,

        'total_gross', x.total_gross
      )
      order by x.total_gross desc
    ),
    '[]'::jsonb
  )
  into v_rows
  from (
    select
      r.staff_id,
      max(r.staff_name) as staff_name,

      -- SERVIZI
      coalesce(sum(case when r.item_type='service' then r.quantity else 0 end),0) as services_count,
      round(coalesce(sum(case when r.item_type='service' then r.line_total_gross else 0 end),0),2) as services_gross,
      round(coalesce(sum(case when r.item_type='service' then r.line_net else 0 end),0),2) as services_net,
      round(coalesce(sum(case when r.item_type='service' then r.line_vat else 0 end),0),2) as services_vat,
      round(coalesce(sum(case when r.item_type='service' then r.item_discount else 0 end),0),2) as services_discount,

      -- RIVENDITA (prodotti)
      coalesce(sum(case when r.item_type='product' then r.quantity else 0 end),0) as retail_units,
      round(coalesce(sum(case when r.item_type='product' then r.line_total_gross else 0 end),0),2) as retail_gross,
      round(coalesce(sum(case when r.item_type='product' then r.line_net else 0 end),0),2) as retail_net,
      round(coalesce(sum(case when r.item_type='product' then r.line_vat else 0 end),0),2) as retail_vat,
      round(coalesce(sum(case when r.item_type='product' then r.item_discount else 0 end),0),2) as retail_discount,

      -- TOTALE
      round(coalesce(sum(r.line_total_gross),0),2) as total_gross
    from public.sale_items_report r
    where r.salon_id = p_salon_id
      and r.sale_day between p_date_from and p_date_to
      and r.staff_id is not null
    group by r.staff_id
  ) x;

  return jsonb_build_object(
    'report', 'staff_services_and_retail',
    'totals', v_totals,
    'staff', v_rows
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.report_turnover(p_salon_id integer, p_from date, p_to date, p_staff_id integer DEFAULT NULL::integer, p_payment_method text DEFAULT NULL::text, p_item_type text DEFAULT NULL::text)
 RETURNS TABLE(salon_id integer, date_from date, date_to date, receipts_count integer, gross_total numeric, net_total numeric, vat_total numeric, discount_total numeric, gross_cash numeric, gross_card numeric, gross_services numeric, gross_products numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid;
  v_role text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Non autenticato' using errcode = '28000';
  end if;

  select r.name
    into v_role
  from public.users u
  join public.roles r on r.id = u.role_id
  where u.id = v_uid;

  if coalesce(v_role,'') <> 'coordinator' then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;

  return query
  with rows as (
    select *
    from public.report_rows(
      p_salon_id,
      p_from,
      p_to,
      p_staff_id,
      p_payment_method,
      p_item_type
    )
  )
  select
    p_salon_id as salon_id,
    p_from as date_from,
    p_to as date_to,
    count(distinct sale_id)::int as receipts_count,
    coalesce(sum(line_total_gross), 0)::numeric as gross_total,
    coalesce(sum(line_net), 0)::numeric as net_total,
    coalesce(sum(line_vat), 0)::numeric as vat_total,
    coalesce(sum(item_discount), 0)::numeric as discount_total,
    coalesce(sum(case when payment_method = 'cash' then line_total_gross else 0 end), 0)::numeric as gross_cash,
    coalesce(sum(case when payment_method = 'card' then line_total_gross else 0 end), 0)::numeric as gross_card,
    coalesce(sum(case when item_type = 'service' then line_total_gross else 0 end), 0)::numeric as gross_services,
    coalesce(sum(case when item_type = 'product' then line_total_gross else 0 end), 0)::numeric as gross_products
  from rows;
end;
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


create or replace view "public"."services_with_prices" as  SELECT sp.salon_id,
    sv.id AS service_id,
    sv.category_id,
    sv.name,
    sv.description,
    sv.color_code,
    sv.duration_active,
    sv.duration_processing,
    sv.need_processing,
    sv.vat_rate,
    sp.price
   FROM (public.service_prices sp
     JOIN public.services sv ON ((sv.id = sp.service_id)))
  WHERE (sv.active = true);


CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

create or replace view "public"."staff_revenue" as  SELECT s.id AS staff_id,
    s.name AS staff_name,
    a.salon_id,
    date(a.start_time) AS work_date,
    sum(aps.price) AS revenue
   FROM ((public.appointment_services aps
     JOIN public.appointments a ON ((a.id = aps.appointment_id)))
     JOIN public.staff s ON ((s.id = aps.staff_id)))
  WHERE (a.status = 'done'::text)
  GROUP BY s.id, s.name, a.salon_id, (date(a.start_time));


create or replace view "public"."staff_worked_hours" as  SELECT s.id AS staff_id,
    s.name AS staff_name,
    a.salon_id,
    date(a.start_time) AS work_date,
    sum(aps.duration_minutes) AS total_minutes,
    round(((sum(aps.duration_minutes))::numeric / 60.0), 2) AS total_hours
   FROM ((public.appointment_services aps
     JOIN public.appointments a ON ((a.id = aps.appointment_id)))
     JOIN public.staff s ON ((s.id = aps.staff_id)))
  WHERE (a.status = 'done'::text)
  GROUP BY s.id, s.name, a.salon_id, (date(a.start_time));


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
    SELECT 1 FROM product_stock
    WHERE salon_id = p_salon AND product_id = p_product AND quantity >= p_qty
  ) THEN
    RAISE EXCEPTION 'Giacenza insufficiente';
  END IF;

  UPDATE product_stock
  SET quantity = quantity - p_qty
  WHERE salon_id = p_salon AND product_id = p_product;

  INSERT INTO stock_movements (
    product_id, from_salon, to_salon, quantity, movement_type, reason
  )
  VALUES (
    p_product, p_salon, NULL, -p_qty, 'scarico', p_reason
  );
END;
$function$
;

create or replace view "public"."stock_levels" as  SELECT product_id,
    salon_id,
    sum(qty) AS quantity
   FROM ( SELECT stock_movements.product_id,
            stock_movements.to_salon AS salon_id,
            stock_movements.quantity AS qty
           FROM public.stock_movements
          WHERE (stock_movements.to_salon IS NOT NULL)
        UNION ALL
         SELECT stock_movements.product_id,
            stock_movements.from_salon AS salon_id,
            (- stock_movements.quantity) AS qty
           FROM public.stock_movements
          WHERE (stock_movements.from_salon IS NOT NULL)) m
  GROUP BY product_id, salon_id;


CREATE OR REPLACE FUNCTION public.stock_move(p_product_id integer, p_qty numeric, p_from_salon integer, p_to_salon integer, p_movement_type text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_role_name text;
  v_from_qty numeric;
  v_to_qty numeric;
  v_mt text := lower(coalesce(p_movement_type,''));
begin
  if p_product_id is null then
    raise exception 'p_product_id is required';
  end if;

  if p_qty is null or p_qty <= 0 then
    raise exception 'p_qty must be > 0';
  end if;

  -- normalizza movement_type
  if v_mt = 'transfer' then v_mt := 'trasferimento'; end if;
  if v_mt not in ('carico','scarico','trasferimento','sale') then
    raise exception 'invalid movement_type: %', p_movement_type;
  end if;

  -- regole coerenza
  if v_mt = 'carico' then
    if p_to_salon is null then raise exception 'carico requires p_to_salon'; end if;
    p_from_salon := null;
  elsif v_mt in ('scarico','sale') then
    if p_from_salon is null then raise exception '% requires p_from_salon', v_mt; end if;
    p_to_salon := null;
  elsif v_mt = 'trasferimento' then
    if p_from_salon is null or p_to_salon is null then
      raise exception 'trasferimento requires both p_from_salon and p_to_salon';
    end if;
    if p_from_salon = p_to_salon then
      raise exception 'trasferimento requires different salons';
    end if;
  end if;

  v_role_name := public.current_role_name();
  if v_role_name not in ('coordinator','magazzino','reception') then
    raise exception 'not allowed';
  end if;

  -- reception: solo proprio salone (via can_access_salon)
  if v_role_name = 'reception' then
    if (p_from_salon is not null and not public.can_access_salon(p_from_salon)) then
      raise exception 'reception not allowed for from_salon=%', p_from_salon;
    end if;
    if (p_to_salon is not null and not public.can_access_salon(p_to_salon)) then
      raise exception 'reception not allowed for to_salon=%', p_to_salon;
    end if;
  end if;

  -- LOCK anti race: (product, salon)
  if p_from_salon is not null then
    perform pg_advisory_xact_lock(p_product_id, p_from_salon);
  end if;
  if p_to_salon is not null then
    perform pg_advisory_xact_lock(p_product_id, p_to_salon);
  end if;

  -- assicurati che esista la riga stock per i saloni coinvolti
  if p_from_salon is not null then
    insert into public.product_stock(product_id, salon_id, quantity)
    values (p_product_id, p_from_salon, 0)
    on conflict (product_id, salon_id) do nothing;
  end if;

  if p_to_salon is not null then
    insert into public.product_stock(product_id, salon_id, quantity)
    values (p_product_id, p_to_salon, 0)
    on conflict (product_id, salon_id) do nothing;
  end if;

  -- update stock
  if v_mt = 'carico' then
    update public.product_stock
    set quantity = quantity + p_qty
    where product_id = p_product_id and salon_id = p_to_salon;

  elsif v_mt in ('scarico','sale') then
    update public.product_stock
    set quantity = quantity - p_qty
    where product_id = p_product_id and salon_id = p_from_salon;

  elsif v_mt = 'trasferimento' then
    update public.product_stock
    set quantity = quantity - p_qty
    where product_id = p_product_id and salon_id = p_from_salon;

    update public.product_stock
    set quantity = quantity + p_qty
    where product_id = p_product_id and salon_id = p_to_salon;
  end if;

  -- blocco stock negativo (solo se c'è from_salon)
  if p_from_salon is not null then
    select quantity into v_from_qty
    from public.product_stock
    where product_id = p_product_id and salon_id = p_from_salon;

    if v_from_qty < 0 then
      raise exception 'negative stock not allowed (product %, salon %, qty %)',
        p_product_id, p_from_salon, v_from_qty;
    end if;
  end if;

  if p_to_salon is not null then
    select quantity into v_to_qty
    from public.product_stock
    where product_id = p_product_id and salon_id = p_to_salon;
  end if;

  -- log movimento (sale/scarico negativi)
  insert into public.stock_movements(product_id, from_salon, to_salon, quantity, movement_type, reason)
  values (
    p_product_id,
    p_from_salon,
    p_to_salon,
    case when v_mt in ('scarico','sale') then -p_qty else p_qty end,
    v_mt,
    p_reason
  );

  return jsonb_build_object(
    'ok', true,
    'product_id', p_product_id,
    'movement_type', v_mt,
    'from_salon', p_from_salon,
    'to_salon', p_to_salon,
    'from_qty', v_from_qty,
    'to_qty', v_to_qty
  );
end $function$
;

create or replace view "public"."transfers_view" as  SELECT t.id,
    t.from_salon,
    t.to_salon,
    t.date,
    t.causale,
    t.note,
    t.created_at,
    t.executed_at,
    t.executed_by,
    t.status,
    sf.name AS from_salon_name,
    st.name AS to_salon_name
   FROM ((public.transfers t
     LEFT JOIN public.salons sf ON ((sf.id = t.from_salon)))
     LEFT JOIN public.salons st ON ((st.id = t.to_salon)));


CREATE OR REPLACE FUNCTION public.update_appointment_end_time()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  update public.appointments a
  set end_time = (
    select max(start_time + (duration_minutes || ' minutes')::interval)
    from public.appointment_services
    where appointment_id = a.id
  )
  where a.id = coalesce(new.appointment_id, old.appointment_id);

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.close_sale_atomic(p_salon_id integer, p_customer_id uuid, p_total_amount numeric, p_payment_method text, p_discount numeric, p_items jsonb, p_appointment_id integer DEFAULT NULL::integer)
 RETURNS TABLE(sale_id bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sale_id bigint;
  v_item record;
  v_updated integer;
BEGIN
  -- Validazione minima
  IF p_salon_id IS NULL OR p_salon_id <= 0 THEN
    RAISE EXCEPTION 'close_sale_atomic: salon_id richiesto e deve essere > 0';
  END IF;
  IF p_total_amount IS NULL OR p_total_amount < 0 THEN
    RAISE EXCEPTION 'close_sale_atomic: total_amount non valido';
  END IF;
  IF p_payment_method IS NULL OR p_payment_method NOT IN ('cash', 'card') THEN
    RAISE EXCEPTION 'close_sale_atomic: payment_method deve essere cash o card';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'close_sale_atomic: p_items non può essere vuoto';
  END IF;
  IF p_discount IS NULL THEN
    p_discount := 0;
  END IF;

  -- 1) INSERT vendita
  INSERT INTO public.sales (salon_id, customer_id, total_amount, payment_method, discount, date)
  VALUES (p_salon_id, p_customer_id, p_total_amount, p_payment_method, COALESCE(p_discount, 0), now())
  RETURNING id INTO v_sale_id;

  -- 2) INSERT sale_items da p_items
  INSERT INTO public.sale_items (sale_id, service_id, product_id, staff_id, quantity, price, discount)
  SELECT
    v_sale_id,
    CASE WHEN (elem->>'kind') = 'service' THEN (elem->>'ref_id')::integer ELSE NULL END,
    CASE WHEN (elem->>'kind') = 'product' THEN (elem->>'ref_id')::integer ELSE NULL END,
    (elem->>'staff_id')::integer,
    (elem->>'quantity')::integer,
    (elem->>'price')::numeric,
    COALESCE((elem->>'discount')::numeric, 0)
  FROM jsonb_array_elements(p_items) AS elem;

  -- 3) Scarico magazzino: per ogni riga product, chiamata a stock_move (stessa transazione)
  FOR v_item IN SELECT elem FROM jsonb_array_elements(p_items) AS elem
  LOOP
    IF (v_item.elem->>'kind') = 'product' THEN
      PERFORM public.stock_move(
        p_product_id := (v_item.elem->>'ref_id')::integer,
        p_qty := (v_item.elem->>'quantity')::integer,
        p_from_salon := p_salon_id,
        p_to_salon := NULL,
        p_movement_type := 'sale',
        p_reason := 'Vendita #' || v_sale_id
      );
    END IF;
  END LOOP;

  -- 4) Chiusura appuntamento se richiesto
  IF p_appointment_id IS NOT NULL AND p_appointment_id > 0 THEN
    UPDATE public.appointments
    SET sale_id = v_sale_id, status = 'done'
    WHERE id = p_appointment_id AND sale_id IS NULL;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN
      RAISE EXCEPTION 'close_sale_atomic: appuntamento % non trovato o già chiuso (righe aggiornate: %)', p_appointment_id, v_updated;
    END IF;
  END IF;

  -- Ritorno sale_id
  sale_id := v_sale_id;
  RETURN NEXT;
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


create or replace view "public"."staff_productivity" as  SELECT h.staff_id,
    h.staff_name,
    h.salon_id,
    h.work_date,
    h.total_hours,
    r.revenue,
        CASE
            WHEN (h.total_hours > (0)::numeric) THEN round((r.revenue / h.total_hours), 2)
            ELSE (0)::numeric
        END AS revenue_per_hour
   FROM (public.staff_worked_hours h
     JOIN public.staff_revenue r ON (((r.staff_id = h.staff_id) AND (r.work_date = h.work_date) AND (r.salon_id = h.salon_id))));


grant delete on table "public"."_bak_products" to "anon";

grant insert on table "public"."_bak_products" to "anon";

grant references on table "public"."_bak_products" to "anon";

grant select on table "public"."_bak_products" to "anon";

grant trigger on table "public"."_bak_products" to "anon";

grant truncate on table "public"."_bak_products" to "anon";

grant update on table "public"."_bak_products" to "anon";

grant delete on table "public"."_bak_products" to "authenticated";

grant insert on table "public"."_bak_products" to "authenticated";

grant references on table "public"."_bak_products" to "authenticated";

grant select on table "public"."_bak_products" to "authenticated";

grant trigger on table "public"."_bak_products" to "authenticated";

grant truncate on table "public"."_bak_products" to "authenticated";

grant update on table "public"."_bak_products" to "authenticated";

grant delete on table "public"."_bak_products" to "service_role";

grant insert on table "public"."_bak_products" to "service_role";

grant references on table "public"."_bak_products" to "service_role";

grant select on table "public"."_bak_products" to "service_role";

grant trigger on table "public"."_bak_products" to "service_role";

grant truncate on table "public"."_bak_products" to "service_role";

grant update on table "public"."_bak_products" to "service_role";

grant delete on table "public"."_bak_staff" to "anon";

grant insert on table "public"."_bak_staff" to "anon";

grant references on table "public"."_bak_staff" to "anon";

grant select on table "public"."_bak_staff" to "anon";

grant trigger on table "public"."_bak_staff" to "anon";

grant truncate on table "public"."_bak_staff" to "anon";

grant update on table "public"."_bak_staff" to "anon";

grant delete on table "public"."_bak_staff" to "authenticated";

grant insert on table "public"."_bak_staff" to "authenticated";

grant references on table "public"."_bak_staff" to "authenticated";

grant select on table "public"."_bak_staff" to "authenticated";

grant trigger on table "public"."_bak_staff" to "authenticated";

grant truncate on table "public"."_bak_staff" to "authenticated";

grant update on table "public"."_bak_staff" to "authenticated";

grant delete on table "public"."_bak_staff" to "service_role";

grant insert on table "public"."_bak_staff" to "service_role";

grant references on table "public"."_bak_staff" to "service_role";

grant select on table "public"."_bak_staff" to "service_role";

grant trigger on table "public"."_bak_staff" to "service_role";

grant truncate on table "public"."_bak_staff" to "service_role";

grant update on table "public"."_bak_staff" to "service_role";

grant delete on table "public"."_bak_stock_movements" to "anon";

grant insert on table "public"."_bak_stock_movements" to "anon";

grant references on table "public"."_bak_stock_movements" to "anon";

grant select on table "public"."_bak_stock_movements" to "anon";

grant trigger on table "public"."_bak_stock_movements" to "anon";

grant truncate on table "public"."_bak_stock_movements" to "anon";

grant update on table "public"."_bak_stock_movements" to "anon";

grant delete on table "public"."_bak_stock_movements" to "authenticated";

grant insert on table "public"."_bak_stock_movements" to "authenticated";

grant references on table "public"."_bak_stock_movements" to "authenticated";

grant select on table "public"."_bak_stock_movements" to "authenticated";

grant trigger on table "public"."_bak_stock_movements" to "authenticated";

grant truncate on table "public"."_bak_stock_movements" to "authenticated";

grant update on table "public"."_bak_stock_movements" to "authenticated";

grant delete on table "public"."_bak_stock_movements" to "service_role";

grant insert on table "public"."_bak_stock_movements" to "service_role";

grant references on table "public"."_bak_stock_movements" to "service_role";

grant select on table "public"."_bak_stock_movements" to "service_role";

grant trigger on table "public"."_bak_stock_movements" to "service_role";

grant truncate on table "public"."_bak_stock_movements" to "service_role";

grant update on table "public"."_bak_stock_movements" to "service_role";

grant delete on table "public"."_bak_transfer_items" to "anon";

grant insert on table "public"."_bak_transfer_items" to "anon";

grant references on table "public"."_bak_transfer_items" to "anon";

grant select on table "public"."_bak_transfer_items" to "anon";

grant trigger on table "public"."_bak_transfer_items" to "anon";

grant truncate on table "public"."_bak_transfer_items" to "anon";

grant update on table "public"."_bak_transfer_items" to "anon";

grant delete on table "public"."_bak_transfer_items" to "authenticated";

grant insert on table "public"."_bak_transfer_items" to "authenticated";

grant references on table "public"."_bak_transfer_items" to "authenticated";

grant select on table "public"."_bak_transfer_items" to "authenticated";

grant trigger on table "public"."_bak_transfer_items" to "authenticated";

grant truncate on table "public"."_bak_transfer_items" to "authenticated";

grant update on table "public"."_bak_transfer_items" to "authenticated";

grant delete on table "public"."_bak_transfer_items" to "service_role";

grant insert on table "public"."_bak_transfer_items" to "service_role";

grant references on table "public"."_bak_transfer_items" to "service_role";

grant select on table "public"."_bak_transfer_items" to "service_role";

grant trigger on table "public"."_bak_transfer_items" to "service_role";

grant truncate on table "public"."_bak_transfer_items" to "service_role";

grant update on table "public"."_bak_transfer_items" to "service_role";

grant delete on table "public"."appointment_services" to "anon";

grant insert on table "public"."appointment_services" to "anon";

grant references on table "public"."appointment_services" to "anon";

grant select on table "public"."appointment_services" to "anon";

grant trigger on table "public"."appointment_services" to "anon";

grant truncate on table "public"."appointment_services" to "anon";

grant update on table "public"."appointment_services" to "anon";

grant delete on table "public"."appointment_services" to "authenticated";

grant insert on table "public"."appointment_services" to "authenticated";

grant references on table "public"."appointment_services" to "authenticated";

grant select on table "public"."appointment_services" to "authenticated";

grant trigger on table "public"."appointment_services" to "authenticated";

grant truncate on table "public"."appointment_services" to "authenticated";

grant update on table "public"."appointment_services" to "authenticated";

grant delete on table "public"."appointment_services" to "service_role";

grant insert on table "public"."appointment_services" to "service_role";

grant references on table "public"."appointment_services" to "service_role";

grant select on table "public"."appointment_services" to "service_role";

grant trigger on table "public"."appointment_services" to "service_role";

grant truncate on table "public"."appointment_services" to "service_role";

grant update on table "public"."appointment_services" to "service_role";

grant delete on table "public"."appointments" to "anon";

grant insert on table "public"."appointments" to "anon";

grant references on table "public"."appointments" to "anon";

grant select on table "public"."appointments" to "anon";

grant trigger on table "public"."appointments" to "anon";

grant truncate on table "public"."appointments" to "anon";

grant update on table "public"."appointments" to "anon";

grant delete on table "public"."appointments" to "authenticated";

grant insert on table "public"."appointments" to "authenticated";

grant references on table "public"."appointments" to "authenticated";

grant select on table "public"."appointments" to "authenticated";

grant trigger on table "public"."appointments" to "authenticated";

grant truncate on table "public"."appointments" to "authenticated";

grant update on table "public"."appointments" to "authenticated";

grant delete on table "public"."appointments" to "service_role";

grant insert on table "public"."appointments" to "service_role";

grant references on table "public"."appointments" to "service_role";

grant select on table "public"."appointments" to "service_role";

grant trigger on table "public"."appointments" to "service_role";

grant truncate on table "public"."appointments" to "service_role";

grant update on table "public"."appointments" to "service_role";

grant references on table "public"."cash_sessions" to "anon";

grant select on table "public"."cash_sessions" to "anon";

grant trigger on table "public"."cash_sessions" to "anon";

grant truncate on table "public"."cash_sessions" to "anon";

grant delete on table "public"."cash_sessions" to "authenticated";

grant insert on table "public"."cash_sessions" to "authenticated";

grant references on table "public"."cash_sessions" to "authenticated";

grant select on table "public"."cash_sessions" to "authenticated";

grant trigger on table "public"."cash_sessions" to "authenticated";

grant truncate on table "public"."cash_sessions" to "authenticated";

grant update on table "public"."cash_sessions" to "authenticated";

grant delete on table "public"."cash_sessions" to "service_role";

grant insert on table "public"."cash_sessions" to "service_role";

grant references on table "public"."cash_sessions" to "service_role";

grant select on table "public"."cash_sessions" to "service_role";

grant trigger on table "public"."cash_sessions" to "service_role";

grant truncate on table "public"."cash_sessions" to "service_role";

grant update on table "public"."cash_sessions" to "service_role";

grant delete on table "public"."customer_notes" to "anon";

grant insert on table "public"."customer_notes" to "anon";

grant references on table "public"."customer_notes" to "anon";

grant select on table "public"."customer_notes" to "anon";

grant trigger on table "public"."customer_notes" to "anon";

grant truncate on table "public"."customer_notes" to "anon";

grant update on table "public"."customer_notes" to "anon";

grant delete on table "public"."customer_notes" to "authenticated";

grant insert on table "public"."customer_notes" to "authenticated";

grant references on table "public"."customer_notes" to "authenticated";

grant select on table "public"."customer_notes" to "authenticated";

grant trigger on table "public"."customer_notes" to "authenticated";

grant truncate on table "public"."customer_notes" to "authenticated";

grant update on table "public"."customer_notes" to "authenticated";

grant delete on table "public"."customer_notes" to "service_role";

grant insert on table "public"."customer_notes" to "service_role";

grant references on table "public"."customer_notes" to "service_role";

grant select on table "public"."customer_notes" to "service_role";

grant trigger on table "public"."customer_notes" to "service_role";

grant truncate on table "public"."customer_notes" to "service_role";

grant update on table "public"."customer_notes" to "service_role";

grant delete on table "public"."customer_profile" to "anon";

grant insert on table "public"."customer_profile" to "anon";

grant references on table "public"."customer_profile" to "anon";

grant select on table "public"."customer_profile" to "anon";

grant trigger on table "public"."customer_profile" to "anon";

grant truncate on table "public"."customer_profile" to "anon";

grant update on table "public"."customer_profile" to "anon";

grant delete on table "public"."customer_profile" to "authenticated";

grant insert on table "public"."customer_profile" to "authenticated";

grant references on table "public"."customer_profile" to "authenticated";

grant select on table "public"."customer_profile" to "authenticated";

grant trigger on table "public"."customer_profile" to "authenticated";

grant truncate on table "public"."customer_profile" to "authenticated";

grant update on table "public"."customer_profile" to "authenticated";

grant delete on table "public"."customer_profile" to "service_role";

grant insert on table "public"."customer_profile" to "service_role";

grant references on table "public"."customer_profile" to "service_role";

grant select on table "public"."customer_profile" to "service_role";

grant trigger on table "public"."customer_profile" to "service_role";

grant truncate on table "public"."customer_profile" to "service_role";

grant update on table "public"."customer_profile" to "service_role";

grant delete on table "public"."customer_service_cards" to "anon";

grant insert on table "public"."customer_service_cards" to "anon";

grant references on table "public"."customer_service_cards" to "anon";

grant select on table "public"."customer_service_cards" to "anon";

grant trigger on table "public"."customer_service_cards" to "anon";

grant truncate on table "public"."customer_service_cards" to "anon";

grant update on table "public"."customer_service_cards" to "anon";

grant delete on table "public"."customer_service_cards" to "authenticated";

grant insert on table "public"."customer_service_cards" to "authenticated";

grant references on table "public"."customer_service_cards" to "authenticated";

grant select on table "public"."customer_service_cards" to "authenticated";

grant trigger on table "public"."customer_service_cards" to "authenticated";

grant truncate on table "public"."customer_service_cards" to "authenticated";

grant update on table "public"."customer_service_cards" to "authenticated";

grant delete on table "public"."customer_service_cards" to "service_role";

grant insert on table "public"."customer_service_cards" to "service_role";

grant references on table "public"."customer_service_cards" to "service_role";

grant select on table "public"."customer_service_cards" to "service_role";

grant trigger on table "public"."customer_service_cards" to "service_role";

grant truncate on table "public"."customer_service_cards" to "service_role";

grant update on table "public"."customer_service_cards" to "service_role";

grant delete on table "public"."customer_tech_notes" to "anon";

grant insert on table "public"."customer_tech_notes" to "anon";

grant references on table "public"."customer_tech_notes" to "anon";

grant select on table "public"."customer_tech_notes" to "anon";

grant trigger on table "public"."customer_tech_notes" to "anon";

grant truncate on table "public"."customer_tech_notes" to "anon";

grant update on table "public"."customer_tech_notes" to "anon";

grant delete on table "public"."customer_tech_notes" to "authenticated";

grant insert on table "public"."customer_tech_notes" to "authenticated";

grant references on table "public"."customer_tech_notes" to "authenticated";

grant select on table "public"."customer_tech_notes" to "authenticated";

grant trigger on table "public"."customer_tech_notes" to "authenticated";

grant truncate on table "public"."customer_tech_notes" to "authenticated";

grant update on table "public"."customer_tech_notes" to "authenticated";

grant delete on table "public"."customer_tech_notes" to "service_role";

grant insert on table "public"."customer_tech_notes" to "service_role";

grant references on table "public"."customer_tech_notes" to "service_role";

grant select on table "public"."customer_tech_notes" to "service_role";

grant trigger on table "public"."customer_tech_notes" to "service_role";

grant truncate on table "public"."customer_tech_notes" to "service_role";

grant update on table "public"."customer_tech_notes" to "service_role";

grant delete on table "public"."customer_technical_cards" to "anon";

grant insert on table "public"."customer_technical_cards" to "anon";

grant references on table "public"."customer_technical_cards" to "anon";

grant select on table "public"."customer_technical_cards" to "anon";

grant trigger on table "public"."customer_technical_cards" to "anon";

grant truncate on table "public"."customer_technical_cards" to "anon";

grant update on table "public"."customer_technical_cards" to "anon";

grant delete on table "public"."customer_technical_cards" to "authenticated";

grant insert on table "public"."customer_technical_cards" to "authenticated";

grant references on table "public"."customer_technical_cards" to "authenticated";

grant select on table "public"."customer_technical_cards" to "authenticated";

grant trigger on table "public"."customer_technical_cards" to "authenticated";

grant truncate on table "public"."customer_technical_cards" to "authenticated";

grant update on table "public"."customer_technical_cards" to "authenticated";

grant delete on table "public"."customer_technical_cards" to "service_role";

grant insert on table "public"."customer_technical_cards" to "service_role";

grant references on table "public"."customer_technical_cards" to "service_role";

grant select on table "public"."customer_technical_cards" to "service_role";

grant trigger on table "public"."customer_technical_cards" to "service_role";

grant truncate on table "public"."customer_technical_cards" to "service_role";

grant update on table "public"."customer_technical_cards" to "service_role";

grant delete on table "public"."customers" to "anon";

grant insert on table "public"."customers" to "anon";

grant references on table "public"."customers" to "anon";

grant select on table "public"."customers" to "anon";

grant trigger on table "public"."customers" to "anon";

grant truncate on table "public"."customers" to "anon";

grant update on table "public"."customers" to "anon";

grant delete on table "public"."customers" to "authenticated";

grant insert on table "public"."customers" to "authenticated";

grant references on table "public"."customers" to "authenticated";

grant select on table "public"."customers" to "authenticated";

grant trigger on table "public"."customers" to "authenticated";

grant truncate on table "public"."customers" to "authenticated";

grant update on table "public"."customers" to "authenticated";

grant delete on table "public"."customers" to "service_role";

grant insert on table "public"."customers" to "service_role";

grant references on table "public"."customers" to "service_role";

grant select on table "public"."customers" to "service_role";

grant trigger on table "public"."customers" to "service_role";

grant truncate on table "public"."customers" to "service_role";

grant update on table "public"."customers" to "service_role";

grant delete on table "public"."fiscal_profiles" to "anon";

grant insert on table "public"."fiscal_profiles" to "anon";

grant references on table "public"."fiscal_profiles" to "anon";

grant select on table "public"."fiscal_profiles" to "anon";

grant trigger on table "public"."fiscal_profiles" to "anon";

grant truncate on table "public"."fiscal_profiles" to "anon";

grant update on table "public"."fiscal_profiles" to "anon";

grant delete on table "public"."fiscal_profiles" to "authenticated";

grant insert on table "public"."fiscal_profiles" to "authenticated";

grant references on table "public"."fiscal_profiles" to "authenticated";

grant select on table "public"."fiscal_profiles" to "authenticated";

grant trigger on table "public"."fiscal_profiles" to "authenticated";

grant truncate on table "public"."fiscal_profiles" to "authenticated";

grant update on table "public"."fiscal_profiles" to "authenticated";

grant delete on table "public"."fiscal_profiles" to "service_role";

grant insert on table "public"."fiscal_profiles" to "service_role";

grant references on table "public"."fiscal_profiles" to "service_role";

grant select on table "public"."fiscal_profiles" to "service_role";

grant trigger on table "public"."fiscal_profiles" to "service_role";

grant truncate on table "public"."fiscal_profiles" to "service_role";

grant update on table "public"."fiscal_profiles" to "service_role";

grant delete on table "public"."import_products" to "anon";

grant insert on table "public"."import_products" to "anon";

grant references on table "public"."import_products" to "anon";

grant select on table "public"."import_products" to "anon";

grant trigger on table "public"."import_products" to "anon";

grant truncate on table "public"."import_products" to "anon";

grant update on table "public"."import_products" to "anon";

grant delete on table "public"."import_products" to "authenticated";

grant insert on table "public"."import_products" to "authenticated";

grant references on table "public"."import_products" to "authenticated";

grant select on table "public"."import_products" to "authenticated";

grant trigger on table "public"."import_products" to "authenticated";

grant truncate on table "public"."import_products" to "authenticated";

grant update on table "public"."import_products" to "authenticated";

grant delete on table "public"."import_products" to "service_role";

grant insert on table "public"."import_products" to "service_role";

grant references on table "public"."import_products" to "service_role";

grant select on table "public"."import_products" to "service_role";

grant trigger on table "public"."import_products" to "service_role";

grant truncate on table "public"."import_products" to "service_role";

grant update on table "public"."import_products" to "service_role";

grant delete on table "public"."legal_entities" to "anon";

grant insert on table "public"."legal_entities" to "anon";

grant references on table "public"."legal_entities" to "anon";

grant select on table "public"."legal_entities" to "anon";

grant trigger on table "public"."legal_entities" to "anon";

grant truncate on table "public"."legal_entities" to "anon";

grant update on table "public"."legal_entities" to "anon";

grant delete on table "public"."legal_entities" to "authenticated";

grant insert on table "public"."legal_entities" to "authenticated";

grant references on table "public"."legal_entities" to "authenticated";

grant select on table "public"."legal_entities" to "authenticated";

grant trigger on table "public"."legal_entities" to "authenticated";

grant truncate on table "public"."legal_entities" to "authenticated";

grant update on table "public"."legal_entities" to "authenticated";

grant delete on table "public"."legal_entities" to "service_role";

grant insert on table "public"."legal_entities" to "service_role";

grant references on table "public"."legal_entities" to "service_role";

grant select on table "public"."legal_entities" to "service_role";

grant trigger on table "public"."legal_entities" to "service_role";

grant truncate on table "public"."legal_entities" to "service_role";

grant update on table "public"."legal_entities" to "service_role";

grant delete on table "public"."notification_templates" to "anon";

grant insert on table "public"."notification_templates" to "anon";

grant references on table "public"."notification_templates" to "anon";

grant select on table "public"."notification_templates" to "anon";

grant trigger on table "public"."notification_templates" to "anon";

grant truncate on table "public"."notification_templates" to "anon";

grant update on table "public"."notification_templates" to "anon";

grant delete on table "public"."notification_templates" to "authenticated";

grant insert on table "public"."notification_templates" to "authenticated";

grant references on table "public"."notification_templates" to "authenticated";

grant select on table "public"."notification_templates" to "authenticated";

grant trigger on table "public"."notification_templates" to "authenticated";

grant truncate on table "public"."notification_templates" to "authenticated";

grant update on table "public"."notification_templates" to "authenticated";

grant delete on table "public"."notification_templates" to "service_role";

grant insert on table "public"."notification_templates" to "service_role";

grant references on table "public"."notification_templates" to "service_role";

grant select on table "public"."notification_templates" to "service_role";

grant trigger on table "public"."notification_templates" to "service_role";

grant truncate on table "public"."notification_templates" to "service_role";

grant update on table "public"."notification_templates" to "service_role";

grant delete on table "public"."notifications" to "anon";

grant insert on table "public"."notifications" to "anon";

grant references on table "public"."notifications" to "anon";

grant select on table "public"."notifications" to "anon";

grant trigger on table "public"."notifications" to "anon";

grant truncate on table "public"."notifications" to "anon";

grant update on table "public"."notifications" to "anon";

grant delete on table "public"."notifications" to "authenticated";

grant insert on table "public"."notifications" to "authenticated";

grant references on table "public"."notifications" to "authenticated";

grant select on table "public"."notifications" to "authenticated";

grant trigger on table "public"."notifications" to "authenticated";

grant truncate on table "public"."notifications" to "authenticated";

grant update on table "public"."notifications" to "authenticated";

grant delete on table "public"."notifications" to "service_role";

grant insert on table "public"."notifications" to "service_role";

grant references on table "public"."notifications" to "service_role";

grant select on table "public"."notifications" to "service_role";

grant trigger on table "public"."notifications" to "service_role";

grant truncate on table "public"."notifications" to "service_role";

grant update on table "public"."notifications" to "service_role";

grant references on table "public"."product_stock" to "anon";

grant select on table "public"."product_stock" to "anon";

grant trigger on table "public"."product_stock" to "anon";

grant truncate on table "public"."product_stock" to "anon";

grant references on table "public"."product_stock" to "authenticated";

grant select on table "public"."product_stock" to "authenticated";

grant trigger on table "public"."product_stock" to "authenticated";

grant truncate on table "public"."product_stock" to "authenticated";

grant delete on table "public"."product_stock" to "service_role";

grant insert on table "public"."product_stock" to "service_role";

grant references on table "public"."product_stock" to "service_role";

grant select on table "public"."product_stock" to "service_role";

grant trigger on table "public"."product_stock" to "service_role";

grant truncate on table "public"."product_stock" to "service_role";

grant update on table "public"."product_stock" to "service_role";

grant delete on table "public"."products" to "anon";

grant insert on table "public"."products" to "anon";

grant references on table "public"."products" to "anon";

grant select on table "public"."products" to "anon";

grant trigger on table "public"."products" to "anon";

grant truncate on table "public"."products" to "anon";

grant update on table "public"."products" to "anon";

grant delete on table "public"."products" to "authenticated";

grant insert on table "public"."products" to "authenticated";

grant references on table "public"."products" to "authenticated";

grant select on table "public"."products" to "authenticated";

grant trigger on table "public"."products" to "authenticated";

grant truncate on table "public"."products" to "authenticated";

grant update on table "public"."products" to "authenticated";

grant delete on table "public"."products" to "service_role";

grant insert on table "public"."products" to "service_role";

grant references on table "public"."products" to "service_role";

grant select on table "public"."products" to "service_role";

grant trigger on table "public"."products" to "service_role";

grant truncate on table "public"."products" to "service_role";

grant update on table "public"."products" to "service_role";

grant delete on table "public"."roles" to "anon";

grant insert on table "public"."roles" to "anon";

grant references on table "public"."roles" to "anon";

grant select on table "public"."roles" to "anon";

grant trigger on table "public"."roles" to "anon";

grant truncate on table "public"."roles" to "anon";

grant update on table "public"."roles" to "anon";

grant delete on table "public"."roles" to "authenticated";

grant insert on table "public"."roles" to "authenticated";

grant references on table "public"."roles" to "authenticated";

grant select on table "public"."roles" to "authenticated";

grant trigger on table "public"."roles" to "authenticated";

grant truncate on table "public"."roles" to "authenticated";

grant update on table "public"."roles" to "authenticated";

grant delete on table "public"."roles" to "service_role";

grant insert on table "public"."roles" to "service_role";

grant references on table "public"."roles" to "service_role";

grant select on table "public"."roles" to "service_role";

grant trigger on table "public"."roles" to "service_role";

grant truncate on table "public"."roles" to "service_role";

grant update on table "public"."roles" to "service_role";

grant references on table "public"."sale_items" to "anon";

grant select on table "public"."sale_items" to "anon";

grant trigger on table "public"."sale_items" to "anon";

grant truncate on table "public"."sale_items" to "anon";

grant insert on table "public"."sale_items" to "authenticated";

grant references on table "public"."sale_items" to "authenticated";

grant select on table "public"."sale_items" to "authenticated";

grant trigger on table "public"."sale_items" to "authenticated";

grant truncate on table "public"."sale_items" to "authenticated";

grant delete on table "public"."sale_items" to "service_role";

grant insert on table "public"."sale_items" to "service_role";

grant references on table "public"."sale_items" to "service_role";

grant select on table "public"."sale_items" to "service_role";

grant trigger on table "public"."sale_items" to "service_role";

grant truncate on table "public"."sale_items" to "service_role";

grant update on table "public"."sale_items" to "service_role";

grant references on table "public"."sales" to "anon";

grant select on table "public"."sales" to "anon";

grant trigger on table "public"."sales" to "anon";

grant truncate on table "public"."sales" to "anon";

grant insert on table "public"."sales" to "authenticated";

grant references on table "public"."sales" to "authenticated";

grant select on table "public"."sales" to "authenticated";

grant trigger on table "public"."sales" to "authenticated";

grant truncate on table "public"."sales" to "authenticated";

grant delete on table "public"."sales" to "service_role";

grant insert on table "public"."sales" to "service_role";

grant references on table "public"."sales" to "service_role";

grant select on table "public"."sales" to "service_role";

grant trigger on table "public"."sales" to "service_role";

grant truncate on table "public"."sales" to "service_role";

grant update on table "public"."sales" to "service_role";

grant delete on table "public"."salon_fiscal_profiles" to "anon";

grant insert on table "public"."salon_fiscal_profiles" to "anon";

grant references on table "public"."salon_fiscal_profiles" to "anon";

grant select on table "public"."salon_fiscal_profiles" to "anon";

grant trigger on table "public"."salon_fiscal_profiles" to "anon";

grant truncate on table "public"."salon_fiscal_profiles" to "anon";

grant update on table "public"."salon_fiscal_profiles" to "anon";

grant delete on table "public"."salon_fiscal_profiles" to "authenticated";

grant insert on table "public"."salon_fiscal_profiles" to "authenticated";

grant references on table "public"."salon_fiscal_profiles" to "authenticated";

grant select on table "public"."salon_fiscal_profiles" to "authenticated";

grant trigger on table "public"."salon_fiscal_profiles" to "authenticated";

grant truncate on table "public"."salon_fiscal_profiles" to "authenticated";

grant update on table "public"."salon_fiscal_profiles" to "authenticated";

grant delete on table "public"."salon_fiscal_profiles" to "service_role";

grant insert on table "public"."salon_fiscal_profiles" to "service_role";

grant references on table "public"."salon_fiscal_profiles" to "service_role";

grant select on table "public"."salon_fiscal_profiles" to "service_role";

grant trigger on table "public"."salon_fiscal_profiles" to "service_role";

grant truncate on table "public"."salon_fiscal_profiles" to "service_role";

grant update on table "public"."salon_fiscal_profiles" to "service_role";

grant delete on table "public"."salons" to "anon";

grant insert on table "public"."salons" to "anon";

grant references on table "public"."salons" to "anon";

grant select on table "public"."salons" to "anon";

grant trigger on table "public"."salons" to "anon";

grant truncate on table "public"."salons" to "anon";

grant update on table "public"."salons" to "anon";

grant delete on table "public"."salons" to "authenticated";

grant insert on table "public"."salons" to "authenticated";

grant references on table "public"."salons" to "authenticated";

grant select on table "public"."salons" to "authenticated";

grant trigger on table "public"."salons" to "authenticated";

grant truncate on table "public"."salons" to "authenticated";

grant update on table "public"."salons" to "authenticated";

grant delete on table "public"."salons" to "service_role";

grant insert on table "public"."salons" to "service_role";

grant references on table "public"."salons" to "service_role";

grant select on table "public"."salons" to "service_role";

grant trigger on table "public"."salons" to "service_role";

grant truncate on table "public"."salons" to "service_role";

grant update on table "public"."salons" to "service_role";

grant delete on table "public"."service_categories" to "anon";

grant insert on table "public"."service_categories" to "anon";

grant references on table "public"."service_categories" to "anon";

grant select on table "public"."service_categories" to "anon";

grant trigger on table "public"."service_categories" to "anon";

grant truncate on table "public"."service_categories" to "anon";

grant update on table "public"."service_categories" to "anon";

grant delete on table "public"."service_categories" to "authenticated";

grant insert on table "public"."service_categories" to "authenticated";

grant references on table "public"."service_categories" to "authenticated";

grant select on table "public"."service_categories" to "authenticated";

grant trigger on table "public"."service_categories" to "authenticated";

grant truncate on table "public"."service_categories" to "authenticated";

grant update on table "public"."service_categories" to "authenticated";

grant delete on table "public"."service_categories" to "service_role";

grant insert on table "public"."service_categories" to "service_role";

grant references on table "public"."service_categories" to "service_role";

grant select on table "public"."service_categories" to "service_role";

grant trigger on table "public"."service_categories" to "service_role";

grant truncate on table "public"."service_categories" to "service_role";

grant update on table "public"."service_categories" to "service_role";

grant delete on table "public"."service_prices" to "anon";

grant insert on table "public"."service_prices" to "anon";

grant references on table "public"."service_prices" to "anon";

grant select on table "public"."service_prices" to "anon";

grant trigger on table "public"."service_prices" to "anon";

grant truncate on table "public"."service_prices" to "anon";

grant update on table "public"."service_prices" to "anon";

grant delete on table "public"."service_prices" to "authenticated";

grant insert on table "public"."service_prices" to "authenticated";

grant references on table "public"."service_prices" to "authenticated";

grant select on table "public"."service_prices" to "authenticated";

grant trigger on table "public"."service_prices" to "authenticated";

grant truncate on table "public"."service_prices" to "authenticated";

grant update on table "public"."service_prices" to "authenticated";

grant delete on table "public"."service_prices" to "service_role";

grant insert on table "public"."service_prices" to "service_role";

grant references on table "public"."service_prices" to "service_role";

grant select on table "public"."service_prices" to "service_role";

grant trigger on table "public"."service_prices" to "service_role";

grant truncate on table "public"."service_prices" to "service_role";

grant update on table "public"."service_prices" to "service_role";

grant delete on table "public"."services" to "anon";

grant insert on table "public"."services" to "anon";

grant references on table "public"."services" to "anon";

grant select on table "public"."services" to "anon";

grant trigger on table "public"."services" to "anon";

grant truncate on table "public"."services" to "anon";

grant update on table "public"."services" to "anon";

grant delete on table "public"."services" to "authenticated";

grant insert on table "public"."services" to "authenticated";

grant references on table "public"."services" to "authenticated";

grant select on table "public"."services" to "authenticated";

grant trigger on table "public"."services" to "authenticated";

grant truncate on table "public"."services" to "authenticated";

grant update on table "public"."services" to "authenticated";

grant delete on table "public"."services" to "service_role";

grant insert on table "public"."services" to "service_role";

grant references on table "public"."services" to "service_role";

grant select on table "public"."services" to "service_role";

grant trigger on table "public"."services" to "service_role";

grant truncate on table "public"."services" to "service_role";

grant update on table "public"."services" to "service_role";

grant delete on table "public"."staff" to "anon";

grant insert on table "public"."staff" to "anon";

grant references on table "public"."staff" to "anon";

grant select on table "public"."staff" to "anon";

grant trigger on table "public"."staff" to "anon";

grant truncate on table "public"."staff" to "anon";

grant update on table "public"."staff" to "anon";

grant delete on table "public"."staff" to "authenticated";

grant insert on table "public"."staff" to "authenticated";

grant references on table "public"."staff" to "authenticated";

grant select on table "public"."staff" to "authenticated";

grant trigger on table "public"."staff" to "authenticated";

grant truncate on table "public"."staff" to "authenticated";

grant update on table "public"."staff" to "authenticated";

grant delete on table "public"."staff" to "service_role";

grant insert on table "public"."staff" to "service_role";

grant references on table "public"."staff" to "service_role";

grant select on table "public"."staff" to "service_role";

grant trigger on table "public"."staff" to "service_role";

grant truncate on table "public"."staff" to "service_role";

grant update on table "public"."staff" to "service_role";

grant references on table "public"."stock_movements" to "anon";

grant select on table "public"."stock_movements" to "anon";

grant trigger on table "public"."stock_movements" to "anon";

grant truncate on table "public"."stock_movements" to "anon";

grant references on table "public"."stock_movements" to "authenticated";

grant select on table "public"."stock_movements" to "authenticated";

grant trigger on table "public"."stock_movements" to "authenticated";

grant truncate on table "public"."stock_movements" to "authenticated";

grant delete on table "public"."stock_movements" to "service_role";

grant insert on table "public"."stock_movements" to "service_role";

grant references on table "public"."stock_movements" to "service_role";

grant select on table "public"."stock_movements" to "service_role";

grant trigger on table "public"."stock_movements" to "service_role";

grant truncate on table "public"."stock_movements" to "service_role";

grant update on table "public"."stock_movements" to "service_role";

grant delete on table "public"."system_log" to "anon";

grant insert on table "public"."system_log" to "anon";

grant references on table "public"."system_log" to "anon";

grant select on table "public"."system_log" to "anon";

grant trigger on table "public"."system_log" to "anon";

grant truncate on table "public"."system_log" to "anon";

grant update on table "public"."system_log" to "anon";

grant delete on table "public"."system_log" to "authenticated";

grant insert on table "public"."system_log" to "authenticated";

grant references on table "public"."system_log" to "authenticated";

grant select on table "public"."system_log" to "authenticated";

grant trigger on table "public"."system_log" to "authenticated";

grant truncate on table "public"."system_log" to "authenticated";

grant update on table "public"."system_log" to "authenticated";

grant delete on table "public"."system_log" to "service_role";

grant insert on table "public"."system_log" to "service_role";

grant references on table "public"."system_log" to "service_role";

grant select on table "public"."system_log" to "service_role";

grant trigger on table "public"."system_log" to "service_role";

grant truncate on table "public"."system_log" to "service_role";

grant update on table "public"."system_log" to "service_role";

grant delete on table "public"."technical_sheets" to "anon";

grant insert on table "public"."technical_sheets" to "anon";

grant references on table "public"."technical_sheets" to "anon";

grant select on table "public"."technical_sheets" to "anon";

grant trigger on table "public"."technical_sheets" to "anon";

grant truncate on table "public"."technical_sheets" to "anon";

grant update on table "public"."technical_sheets" to "anon";

grant delete on table "public"."technical_sheets" to "authenticated";

grant insert on table "public"."technical_sheets" to "authenticated";

grant references on table "public"."technical_sheets" to "authenticated";

grant select on table "public"."technical_sheets" to "authenticated";

grant trigger on table "public"."technical_sheets" to "authenticated";

grant truncate on table "public"."technical_sheets" to "authenticated";

grant update on table "public"."technical_sheets" to "authenticated";

grant delete on table "public"."technical_sheets" to "service_role";

grant insert on table "public"."technical_sheets" to "service_role";

grant references on table "public"."technical_sheets" to "service_role";

grant select on table "public"."technical_sheets" to "service_role";

grant trigger on table "public"."technical_sheets" to "service_role";

grant truncate on table "public"."technical_sheets" to "service_role";

grant update on table "public"."technical_sheets" to "service_role";

grant delete on table "public"."transfer_items" to "anon";

grant insert on table "public"."transfer_items" to "anon";

grant references on table "public"."transfer_items" to "anon";

grant select on table "public"."transfer_items" to "anon";

grant trigger on table "public"."transfer_items" to "anon";

grant truncate on table "public"."transfer_items" to "anon";

grant update on table "public"."transfer_items" to "anon";

grant delete on table "public"."transfer_items" to "authenticated";

grant insert on table "public"."transfer_items" to "authenticated";

grant references on table "public"."transfer_items" to "authenticated";

grant trigger on table "public"."transfer_items" to "authenticated";

grant truncate on table "public"."transfer_items" to "authenticated";

grant update on table "public"."transfer_items" to "authenticated";

grant delete on table "public"."transfer_items" to "service_role";

grant insert on table "public"."transfer_items" to "service_role";

grant references on table "public"."transfer_items" to "service_role";

grant select on table "public"."transfer_items" to "service_role";

grant trigger on table "public"."transfer_items" to "service_role";

grant truncate on table "public"."transfer_items" to "service_role";

grant update on table "public"."transfer_items" to "service_role";

grant delete on table "public"."transfers" to "anon";

grant insert on table "public"."transfers" to "anon";

grant references on table "public"."transfers" to "anon";

grant select on table "public"."transfers" to "anon";

grant trigger on table "public"."transfers" to "anon";

grant truncate on table "public"."transfers" to "anon";

grant update on table "public"."transfers" to "anon";

grant delete on table "public"."transfers" to "authenticated";

grant insert on table "public"."transfers" to "authenticated";

grant references on table "public"."transfers" to "authenticated";

grant select on table "public"."transfers" to "authenticated";

grant trigger on table "public"."transfers" to "authenticated";

grant truncate on table "public"."transfers" to "authenticated";

grant update on table "public"."transfers" to "authenticated";

grant delete on table "public"."transfers" to "service_role";

grant insert on table "public"."transfers" to "service_role";

grant references on table "public"."transfers" to "service_role";

grant select on table "public"."transfers" to "service_role";

grant trigger on table "public"."transfers" to "service_role";

grant truncate on table "public"."transfers" to "service_role";

grant update on table "public"."transfers" to "service_role";

grant delete on table "public"."user_salons" to "anon";

grant insert on table "public"."user_salons" to "anon";

grant references on table "public"."user_salons" to "anon";

grant select on table "public"."user_salons" to "anon";

grant trigger on table "public"."user_salons" to "anon";

grant truncate on table "public"."user_salons" to "anon";

grant update on table "public"."user_salons" to "anon";

grant delete on table "public"."user_salons" to "authenticated";

grant insert on table "public"."user_salons" to "authenticated";

grant references on table "public"."user_salons" to "authenticated";

grant select on table "public"."user_salons" to "authenticated";

grant trigger on table "public"."user_salons" to "authenticated";

grant truncate on table "public"."user_salons" to "authenticated";

grant update on table "public"."user_salons" to "authenticated";

grant delete on table "public"."user_salons" to "service_role";

grant insert on table "public"."user_salons" to "service_role";

grant references on table "public"."user_salons" to "service_role";

grant select on table "public"."user_salons" to "service_role";

grant trigger on table "public"."user_salons" to "service_role";

grant truncate on table "public"."user_salons" to "service_role";

grant update on table "public"."user_salons" to "service_role";

grant delete on table "public"."users" to "anon";

grant insert on table "public"."users" to "anon";

grant references on table "public"."users" to "anon";

grant select on table "public"."users" to "anon";

grant trigger on table "public"."users" to "anon";

grant truncate on table "public"."users" to "anon";

grant update on table "public"."users" to "anon";

grant delete on table "public"."users" to "authenticated";

grant insert on table "public"."users" to "authenticated";

grant references on table "public"."users" to "authenticated";

grant select on table "public"."users" to "authenticated";

grant trigger on table "public"."users" to "authenticated";

grant truncate on table "public"."users" to "authenticated";

grant update on table "public"."users" to "authenticated";

grant delete on table "public"."users" to "service_role";

grant insert on table "public"."users" to "service_role";

grant references on table "public"."users" to "service_role";

grant select on table "public"."users" to "service_role";

grant trigger on table "public"."users" to "service_role";

grant truncate on table "public"."users" to "service_role";

grant update on table "public"."users" to "service_role";


  create policy "appointment_services_insert"
  on "public"."appointment_services"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.appointments a
  WHERE ((a.id = appointment_services.appointment_id) AND public.can_access_salon(a.salon_id)))));



  create policy "appointment_services_insert_own_salon"
  on "public"."appointment_services"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.appointments a
  WHERE ((a.id = appointment_services.appointment_id) AND public.can_access_salon(a.salon_id)))));



  create policy "appointment_services_select"
  on "public"."appointment_services"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.appointments a
  WHERE ((a.id = appointment_services.appointment_id) AND public.can_access_salon(a.salon_id)))));



  create policy "appointment_services_select_auth"
  on "public"."appointment_services"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.appointments a
  WHERE ((a.id = appointment_services.appointment_id) AND public.can_access_salon(a.salon_id)))));



  create policy "appointment_services_select_own_salon"
  on "public"."appointment_services"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.appointments a
  WHERE ((a.id = appointment_services.appointment_id) AND public.can_access_salon(a.salon_id)))));



  create policy "appointments_delete_auth"
  on "public"."appointments"
  as permissive
  for delete
  to authenticated
using (public.can_access_salon(salon_id));



  create policy "appointments_insert_auth"
  on "public"."appointments"
  as permissive
  for insert
  to authenticated
with check (public.can_access_salon(salon_id));



  create policy "appointments_select_auth"
  on "public"."appointments"
  as permissive
  for select
  to authenticated
using (public.can_access_salon(salon_id));



  create policy "appointments_update_auth"
  on "public"."appointments"
  as permissive
  for update
  to authenticated
using (public.can_access_salon(salon_id))
with check (public.can_access_salon(salon_id));



  create policy "cash_sessions_select"
  on "public"."cash_sessions"
  as permissive
  for select
  to authenticated
using (public.can_access_salon(salon_id));



  create policy "customer_profile_insert_staff"
  on "public"."customer_profile"
  as permissive
  for insert
  to authenticated
with check (public.is_staff());



  create policy "customer_profile_select_staff_or_self"
  on "public"."customer_profile"
  as permissive
  for select
  to authenticated
using ((public.is_staff() OR ((public.current_role_name() = 'cliente'::text) AND (customer_id = auth.uid())) OR (customer_id = auth.uid())));



  create policy "customer_profile_update_staff"
  on "public"."customer_profile"
  as permissive
  for update
  to authenticated
using (public.is_staff())
with check (public.is_staff());



  create policy "customer_service_cards_delete_admin"
  on "public"."customer_service_cards"
  as permissive
  for delete
  to authenticated
using ((public.is_coordinator() OR public.is_magazzino()));



  create policy "customer_service_cards_insert_staff"
  on "public"."customer_service_cards"
  as permissive
  for insert
  to authenticated
with check (public.is_staff());



  create policy "customer_service_cards_select_staff_or_self"
  on "public"."customer_service_cards"
  as permissive
  for select
  to authenticated
using ((public.is_staff() OR ((public.current_role_name() = 'cliente'::text) AND (customer_id = auth.uid())) OR (customer_id = auth.uid())));



  create policy "customer_service_cards_update_staff"
  on "public"."customer_service_cards"
  as permissive
  for update
  to authenticated
using (public.is_staff())
with check (public.is_staff());



  create policy "customer_tech_notes_delete"
  on "public"."customer_tech_notes"
  as permissive
  for delete
  to authenticated
using ((public.is_coordinator() OR public.is_reception() OR public.is_magazzino()));



  create policy "customer_tech_notes_insert"
  on "public"."customer_tech_notes"
  as permissive
  for insert
  to authenticated
with check ((public.is_reception() OR public.is_coordinator() OR public.is_magazzino()));



  create policy "customer_tech_notes_update"
  on "public"."customer_tech_notes"
  as permissive
  for update
  to authenticated
using ((public.is_coordinator() OR public.is_reception() OR public.is_magazzino()))
with check ((public.is_coordinator() OR public.is_reception() OR public.is_magazzino()));



  create policy "Accesso schede tecniche per salone"
  on "public"."customer_technical_cards"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.user_salons
  WHERE (user_salons.user_id = auth.uid()))));



  create policy "customers_delete_admin"
  on "public"."customers"
  as permissive
  for delete
  to authenticated
using ((public.is_coordinator() OR public.is_magazzino()));



  create policy "customers_insert_staff"
  on "public"."customers"
  as permissive
  for insert
  to authenticated
with check (public.is_staff());



  create policy "customers_select_staff_or_self"
  on "public"."customers"
  as permissive
  for select
  to authenticated
using ((public.is_staff() OR ((public.current_role_name() = 'cliente'::text) AND (id = auth.uid())) OR (id = auth.uid())));



  create policy "customers_update_staff"
  on "public"."customers"
  as permissive
  for update
  to authenticated
using (public.is_staff())
with check (public.is_staff());



  create policy "cliente_notifications"
  on "public"."notifications"
  as permissive
  for select
  to public
using ((customer_id = auth.uid()));



  create policy "coordinator_notifications"
  on "public"."notifications"
  as permissive
  for select
  to public
using (((auth.jwt() ->> 'role'::text) = 'coordinator'::text));



  create policy "reception_notifications"
  on "public"."notifications"
  as permissive
  for select
  to public
using (((auth.jwt() ->> 'role'::text) = 'reception'::text));



  create policy "coordinator_select_all_stock"
  on "public"."product_stock"
  as permissive
  for select
  to public
using (((auth.jwt() ->> 'role'::text) = 'coordinator'::text));



  create policy "magazzino_read_all_stock"
  on "public"."product_stock"
  as permissive
  for select
  to public
using (((auth.jwt() ->> 'role'::text) = 'magazzino'::text));



  create policy "magazzino_update_own_stock"
  on "public"."product_stock"
  as permissive
  for update
  to authenticated
using ((public.is_magazzino() AND (salon_id = public.auth_salon_int())))
with check ((public.is_magazzino() AND (salon_id = public.auth_salon_int())));



  create policy "product_stock_delete"
  on "public"."product_stock"
  as permissive
  for delete
  to authenticated
using ((public.is_coordinator() OR public.is_magazzino()));



  create policy "product_stock_insert"
  on "public"."product_stock"
  as permissive
  for insert
  to authenticated
with check ((public.is_coordinator() OR public.is_magazzino()));



  create policy "product_stock_select"
  on "public"."product_stock"
  as permissive
  for select
  to authenticated
using (public.can_access_salon(salon_id));



  create policy "product_stock_update"
  on "public"."product_stock"
  as permissive
  for update
  to authenticated
using ((public.is_coordinator() OR public.is_magazzino()))
with check ((public.is_coordinator() OR public.is_magazzino()));



  create policy "reception_product_stock"
  on "public"."product_stock"
  as permissive
  for select
  to public
using ((((auth.jwt() ->> 'role'::text) = 'reception'::text) AND (salon_id = ((auth.jwt() ->> 'salon_id'::text))::integer)));



  create policy "magazzino_products"
  on "public"."products"
  as permissive
  for select
  to public
using (((auth.jwt() ->> 'role'::text) = 'magazzino'::text));



  create policy "products_insert_magazzino"
  on "public"."products"
  as permissive
  for insert
  to authenticated
with check ((public.is_coordinator() OR public.is_magazzino()));



  create policy "sale_items_insert"
  on "public"."sale_items"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.sales s
  WHERE ((s.id = sale_items.sale_id) AND public.can_access_salon(s.salon_id)))));



  create policy "sale_items_select"
  on "public"."sale_items"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.sales s
  WHERE ((s.id = sale_items.sale_id) AND public.can_access_salon(s.salon_id)))));



  create policy "Gli utenti vedono solo le vendite dei propri saloni"
  on "public"."sales"
  as permissive
  for select
  to authenticated
using ((salon_id IN ( SELECT user_salons.salon_id
   FROM public.user_salons
  WHERE (user_salons.user_id = auth.uid()))));



  create policy "coordinator_select_all_sales"
  on "public"."sales"
  as permissive
  for select
  to public
using (((auth.jwt() ->> 'role'::text) = 'coordinator'::text));



  create policy "reception_sales"
  on "public"."sales"
  as permissive
  for select
  to public
using ((((auth.jwt() ->> 'role'::text) = 'reception'::text) AND (salon_id = ((auth.jwt() ->> 'salon_id'::text))::integer)));



  create policy "sales_insert_auth"
  on "public"."sales"
  as permissive
  for insert
  to authenticated
with check (public.can_access_salon(salon_id));



  create policy "sales_select"
  on "public"."sales"
  as permissive
  for select
  to authenticated
using (public.can_access_salon(salon_id));



  create policy "Allow select for authenticated users"
  on "public"."salons"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Select salons for authenticated"
  on "public"."salons"
  as permissive
  for select
  to authenticated
using (true);



  create policy "service_prices_select"
  on "public"."service_prices"
  as permissive
  for select
  to authenticated
using (public.can_access_salon(salon_id));



  create policy "Servizi visibili a tutto lo staff"
  on "public"."services"
  as permissive
  for select
  to authenticated
using (true);



  create policy "services_select_auth"
  on "public"."services"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Visualizzazione staff per salone"
  on "public"."staff"
  as permissive
  for select
  to authenticated
using ((salon_id IN ( SELECT user_salons.salon_id
   FROM public.user_salons
  WHERE (user_salons.user_id = auth.uid()))));



  create policy "staff_select_secure"
  on "public"."staff"
  as permissive
  for select
  to authenticated
using (public.can_access_salon(salon_id));



  create policy "stock_movements_insert_admin_only"
  on "public"."stock_movements"
  as permissive
  for insert
  to authenticated
with check ((public.is_coordinator() OR public.is_magazzino()));



  create policy "stock_movements_select_secure"
  on "public"."stock_movements"
  as permissive
  for select
  to authenticated
using ((public.is_coordinator() OR public.is_magazzino() OR (public.is_reception() AND public.can_access_salon(COALESCE(from_salon, to_salon)))));



  create policy "coordinator_select_all_logs"
  on "public"."system_log"
  as permissive
  for select
  to public
using (((auth.jwt() ->> 'role'::text) = 'coordinator'::text));



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



  create policy "transfer_items_delete"
  on "public"."transfer_items"
  as permissive
  for delete
  to authenticated
using ((public.is_coordinator() OR public.is_magazzino()));



  create policy "transfer_items_insert"
  on "public"."transfer_items"
  as permissive
  for insert
  to authenticated
with check ((public.is_coordinator() OR public.is_magazzino()));



  create policy "transfer_items_select"
  on "public"."transfer_items"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.transfers t
  WHERE ((t.id = transfer_items.transfer_id) AND (public.is_coordinator() OR public.is_magazzino() OR (public.is_reception() AND ((t.from_salon = public.app_salon_id()) OR (t.to_salon = public.app_salon_id()))))))));



  create policy "transfer_items_update"
  on "public"."transfer_items"
  as permissive
  for update
  to authenticated
using ((public.is_coordinator() OR public.is_magazzino()))
with check ((public.is_coordinator() OR public.is_magazzino()));



  create policy "transfers_delete"
  on "public"."transfers"
  as permissive
  for delete
  to authenticated
using (public.is_coordinator());



  create policy "transfers_insert"
  on "public"."transfers"
  as permissive
  for insert
  to authenticated
with check ((public.is_coordinator() OR public.is_magazzino()));



  create policy "transfers_select"
  on "public"."transfers"
  as permissive
  for select
  to authenticated
using ((public.is_coordinator() OR public.is_magazzino() OR (public.is_reception() AND ((from_salon = public.app_salon_id()) OR (to_salon = public.app_salon_id())))));



  create policy "transfers_update"
  on "public"."transfers"
  as permissive
  for update
  to authenticated
using ((public.is_coordinator() OR public.is_magazzino()))
with check ((public.is_coordinator() OR public.is_magazzino()));



  create policy "user_salons_select_admin_magazzino"
  on "public"."user_salons"
  as permissive
  for select
  to authenticated
using ((public.is_coordinator() OR public.is_magazzino()));



  create policy "user_salons_select_reception_self"
  on "public"."user_salons"
  as permissive
  for select
  to authenticated
using ((public.is_reception() AND (user_id = auth.uid())));



  create policy "coordinator_select_all"
  on "public"."users"
  as permissive
  for select
  to public
using (((auth.jwt() ->> 'role'::text) = 'coordinator'::text));



  create policy "users_insert_own"
  on "public"."users"
  as permissive
  for insert
  to public
with check ((id = auth.uid()));



  create policy "users_select_own"
  on "public"."users"
  as permissive
  for select
  to public
using ((id = auth.uid()));



  create policy "users_update_own"
  on "public"."users"
  as permissive
  for update
  to public
using ((id = auth.uid()))
with check ((id = auth.uid()));


CREATE TRIGGER trg_update_appointment_end_time AFTER INSERT OR DELETE OR UPDATE ON public.appointment_services FOR EACH ROW EXECUTE FUNCTION public.update_appointment_end_time();

CREATE TRIGGER trg_customer_profile_updated_at BEFORE UPDATE ON public.customer_profile FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_customer_tech_notes_updated_at BEFORE UPDATE ON public.customer_tech_notes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_fiscal_profiles_updated_at BEFORE UPDATE ON public.fiscal_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


