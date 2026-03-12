-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public._bak_products (
  id integer,
  name text,
  sku text,
  category text,
  unit text,
  cost numeric,
  price numeric,
  low_stock integer,
  active boolean,
  created_at timestamp without time zone,
  barcode text,
  type text,
  description text,
  vat_rate numeric
);
CREATE TABLE public._bak_staff (
  id integer,
  salon_id integer,
  name text,
  role text,
  phone text,
  active boolean,
  created_at timestamp without time zone
);
CREATE TABLE public._bak_stock_movements (
  id integer,
  product_id integer,
  from_salon integer,
  to_salon integer,
  quantity numeric,
  movement_type text,
  reason text,
  created_at timestamp without time zone
);
CREATE TABLE public._bak_transfer_items (
  id bigint,
  transfer_id bigint,
  product_id integer,
  qty integer
);
CREATE TABLE public.appointment_services (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  appointment_id bigint NOT NULL,
  service_id bigint NOT NULL,
  staff_id bigint,
  start_time timestamp without time zone NOT NULL,
  duration_minutes integer NOT NULL,
  price numeric NOT NULL,
  vat_rate numeric NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT appointment_services_pkey PRIMARY KEY (id),
  CONSTRAINT appointment_services_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id),
  CONSTRAINT appointment_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id),
  CONSTRAINT appointment_services_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id)
);
CREATE TABLE public.appointments (
  id integer NOT NULL DEFAULT nextval('appointments_id_seq'::regclass),
  salon_id integer,
  customer_id uuid NOT NULL,
  staff_id integer,
  service_id integer,
  start_time timestamp without time zone NOT NULL,
  end_time timestamp without time zone,
  processing_start timestamp without time zone,
  processing_end timestamp without time zone,
  status text DEFAULT 'scheduled'::text,
  notes text,
  created_at timestamp without time zone DEFAULT now(),
  sale_id bigint,
  group_id uuid,
  CONSTRAINT appointments_pkey PRIMARY KEY (id),
  CONSTRAINT appointments_salon_id_fkey FOREIGN KEY (salon_id) REFERENCES public.salons(id),
  CONSTRAINT appointments_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id),
  CONSTRAINT appointments_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id),
  CONSTRAINT appointments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT appointments_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id)
);
CREATE TABLE public.cash_sessions (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  salon_id integer NOT NULL,
  session_date date NOT NULL,
  opened_by uuid,
  closed_by uuid,
  opening_cash numeric NOT NULL DEFAULT 0,
  closing_cash numeric,
  notes text,
  status text NOT NULL DEFAULT 'open'::text,
  opened_at timestamp without time zone NOT NULL DEFAULT now(),
  closed_at timestamp without time zone,
  CONSTRAINT cash_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT cash_sessions_salon_id_fkey FOREIGN KEY (salon_id) REFERENCES public.salons(id),
  CONSTRAINT cash_sessions_opened_by_fkey FOREIGN KEY (opened_by) REFERENCES auth.users(id),
  CONSTRAINT cash_sessions_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES auth.users(id)
);
CREATE TABLE public.customer_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT customer_notes_pkey PRIMARY KEY (id),
  CONSTRAINT customer_notes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id)
);
CREATE TABLE public.customer_profile (
  customer_id uuid NOT NULL,
  texture text CHECK (texture = ANY (ARRAY['straight'::text, 'wavy'::text, 'curly'::text, 'coily'::text])),
  thickness text CHECK (thickness = ANY (ARRAY['fine'::text, 'normal'::text, 'thick'::text])),
  density text CHECK (density = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])),
  porosity text CHECK (porosity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])),
  elasticity text CHECK (elasticity = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text])),
  scalp text CHECK (scalp = ANY (ARRAY['dry'::text, 'normal'::text, 'oily'::text, 'sensitive'::text])),
  frizz_level text CHECK (frizz_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])),
  baseline_level integer CHECK (baseline_level >= 1 AND baseline_level <= 10),
  allergies text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT customer_profile_pkey PRIMARY KEY (customer_id),
  CONSTRAINT customer_profile_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id)
);
CREATE TABLE public.customer_service_cards (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  service_type text NOT NULL CHECK (service_type = ANY (ARRAY['oxidation'::text, 'direct'::text, 'botanicals'::text, 'gloss'::text, 'lightening'::text, 'keratin'::text, 'treatment'::text])),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  salon_id integer,
  staff_id integer,
  appointment_id integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT customer_service_cards_pkey PRIMARY KEY (id),
  CONSTRAINT customer_service_cards_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id)
);
CREATE TABLE public.customer_tech_notes (
  id bigint NOT NULL DEFAULT nextval('customer_tech_notes_id_seq'::regclass),
  customer_id uuid NOT NULL,
  salon_id integer,
  staff_id integer,
  note_date date NOT NULL DEFAULT (now())::date,
  note_type text NOT NULL DEFAULT 'Altro'::text,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT customer_tech_notes_pkey PRIMARY KEY (id),
  CONSTRAINT customer_tech_notes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT customer_tech_notes_salon_id_fkey FOREIGN KEY (salon_id) REFERENCES public.salons(id),
  CONSTRAINT customer_tech_notes_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id)
);
CREATE TABLE public.customer_technical_cards (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  color text,
  gloss text,
  lightening text,
  keratin text,
  botanicals text,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT customer_technical_cards_pkey PRIMARY KEY (id),
  CONSTRAINT customer_technical_cards_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id)
);
CREATE TABLE public.customers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text NOT NULL,
  email text,
  address text,
  notes text,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT customers_pkey PRIMARY KEY (id)
);
CREATE TABLE public.fiscal_profiles (
  id bigint NOT NULL DEFAULT nextval('fiscal_profiles_id_seq'::regclass),
  salon_id integer NOT NULL,
  legal_name text NOT NULL,
  vat_number text NOT NULL,
  tax_code text,
  printer_model text NOT NULL DEFAULT 'EPSON FP81'::text,
  printer_serial text NOT NULL,
  valid_from date NOT NULL,
  valid_to date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT fiscal_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT fiscal_profiles_salon_id_fkey FOREIGN KEY (salon_id) REFERENCES public.salons(id)
);
CREATE TABLE public.import_products (
  name text,
  barcode text,
  category text,
  quantity numeric,
  cost numeric
);
CREATE TABLE public.legal_entities (
  id bigint NOT NULL DEFAULT nextval('legal_entities_id_seq'::regclass),
  name text NOT NULL,
  vat_number text NOT NULL,
  tax_code text,
  address_line text NOT NULL,
  city text NOT NULL,
  province text,
  zip text,
  country text NOT NULL DEFAULT 'IT'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT legal_entities_pkey PRIMARY KEY (id)
);
CREATE TABLE public.notification_templates (
  id integer NOT NULL DEFAULT nextval('notification_templates_id_seq'::regclass),
  name text NOT NULL,
  content text NOT NULL,
  type text NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT notification_templates_pkey PRIMARY KEY (id)
);
CREATE TABLE public.notifications (
  id integer NOT NULL DEFAULT nextval('notifications_id_seq'::regclass),
  customer_id uuid,
  salon_id integer,
  template_id integer,
  channel text NOT NULL,
  status text DEFAULT 'pending'::text,
  send_at timestamp without time zone DEFAULT now(),
  sent_at timestamp without time zone,
  message_preview text,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT notifications_salon_id_fkey FOREIGN KEY (salon_id) REFERENCES public.salons(id),
  CONSTRAINT notifications_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.notification_templates(id)
);
CREATE TABLE public.product_stock (
  id integer NOT NULL DEFAULT nextval('product_stock_id_seq'::regclass),
  product_id integer,
  salon_id integer,
  quantity numeric DEFAULT 0 CHECK (quantity >= 0::numeric),
  CONSTRAINT product_stock_pkey PRIMARY KEY (id),
  CONSTRAINT product_stock_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id),
  CONSTRAINT product_stock_salon_id_fkey FOREIGN KEY (salon_id) REFERENCES public.salons(id)
);
CREATE TABLE public.products (
  id integer NOT NULL DEFAULT nextval('products_id_seq'::regclass),
  name text NOT NULL,
  sku text UNIQUE,
  category text,
  unit text DEFAULT 'pz'::text,
  cost numeric,
  price numeric,
  low_stock integer DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamp without time zone DEFAULT now(),
  barcode text,
  type text,
  description text,
  vat_rate numeric NOT NULL DEFAULT 22,
  CONSTRAINT products_pkey PRIMARY KEY (id)
);
CREATE TABLE public.roles (
  id integer NOT NULL DEFAULT nextval('roles_id_seq'::regclass),
  name text NOT NULL UNIQUE,
  CONSTRAINT roles_pkey PRIMARY KEY (id)
);
CREATE TABLE public.sale_items (
  id integer NOT NULL DEFAULT nextval('sale_items_id_seq'::regclass),
  sale_id bigint,
  service_id integer,
  product_id integer,
  staff_id integer,
  quantity integer DEFAULT 1,
  price numeric NOT NULL,
  discount numeric DEFAULT 0,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT sale_items_pkey PRIMARY KEY (id),
  CONSTRAINT sale_items_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id),
  CONSTRAINT sale_items_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id),
  CONSTRAINT sale_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id),
  CONSTRAINT sale_items_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id)
);
CREATE TABLE public.sales (
  id bigint NOT NULL DEFAULT nextval('sales_id_seq'::regclass),
  salon_id integer,
  customer_id uuid,
  total_amount numeric NOT NULL,
  payment_method text NOT NULL,
  discount numeric DEFAULT 0,
  date timestamp without time zone DEFAULT now(),
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT sales_pkey PRIMARY KEY (id),
  CONSTRAINT sales_salon_id_fkey FOREIGN KEY (salon_id) REFERENCES public.salons(id),
  CONSTRAINT sales_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id)
);
CREATE TABLE public.salon_fiscal_profiles (
  id bigint NOT NULL DEFAULT nextval('salon_fiscal_profiles_id_seq'::regclass),
  salon_id integer NOT NULL,
  legal_entity_id bigint NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  printer_model text,
  printer_serial text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT salon_fiscal_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT salon_fiscal_profiles_salon_id_fkey FOREIGN KEY (salon_id) REFERENCES public.salons(id),
  CONSTRAINT salon_fiscal_profiles_legal_entity_id_fkey FOREIGN KEY (legal_entity_id) REFERENCES public.legal_entities(id)
);
CREATE TABLE public.salons (
  id integer NOT NULL DEFAULT nextval('salons_id_seq'::regclass),
  name text NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT salons_pkey PRIMARY KEY (id)
);
CREATE TABLE public.service_categories (
  id integer NOT NULL DEFAULT nextval('service_categories_id_seq'::regclass),
  name text NOT NULL,
  CONSTRAINT service_categories_pkey PRIMARY KEY (id)
);
CREATE TABLE public.service_prices (
  id integer NOT NULL DEFAULT nextval('service_prices_id_seq'::regclass),
  salon_id integer,
  service_id integer,
  price numeric NOT NULL,
  CONSTRAINT service_prices_pkey PRIMARY KEY (id),
  CONSTRAINT service_prices_salon_id_fkey FOREIGN KEY (salon_id) REFERENCES public.salons(id),
  CONSTRAINT service_prices_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id)
);
CREATE TABLE public.services (
  id integer NOT NULL DEFAULT nextval('services_id_seq'::regclass),
  category_id integer,
  name text NOT NULL,
  description text,
  price numeric NOT NULL,
  duration integer NOT NULL,
  color_code text,
  active boolean DEFAULT true,
  created_at timestamp without time zone DEFAULT now(),
  duration_active integer DEFAULT 0,
  duration_processing integer DEFAULT 0,
  need_processing boolean DEFAULT false,
  vat_rate numeric NOT NULL DEFAULT 22,
  is_active boolean DEFAULT true,
  visible_in_agenda boolean DEFAULT true,
  visible_in_cash boolean DEFAULT true,
  CONSTRAINT services_pkey PRIMARY KEY (id),
  CONSTRAINT services_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.service_categories(id)
);
CREATE TABLE public.staff (
  id integer NOT NULL DEFAULT nextval('staff_id_seq'::regclass),
  salon_id integer NOT NULL,
  name text NOT NULL,
  role text DEFAULT 'stylist'::text CHECK (role = ANY (ARRAY['stylist'::text, 'reception'::text, 'estetista'::text, 'assistant'::text, 'manager'::text])),
  phone text,
  active boolean DEFAULT true,
  created_at timestamp without time zone DEFAULT now(),
  user_id uuid,
  internal_id integer,
  CONSTRAINT staff_pkey PRIMARY KEY (id),
  CONSTRAINT staff_salon_id_fkey FOREIGN KEY (salon_id) REFERENCES public.salons(id),
  CONSTRAINT staff_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.stock_movements (
  id integer NOT NULL DEFAULT nextval('stock_movements_id_seq'::regclass),
  product_id integer,
  from_salon integer,
  to_salon integer,
  quantity numeric NOT NULL,
  movement_type text NOT NULL CHECK (movement_type = ANY (ARRAY['load'::text, 'unload'::text, 'transfer'::text, 'sale'::text])),
  reason text,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT stock_movements_pkey PRIMARY KEY (id),
  CONSTRAINT stock_movements_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id),
  CONSTRAINT stock_movements_from_salon_fkey FOREIGN KEY (from_salon) REFERENCES public.salons(id),
  CONSTRAINT stock_movements_to_salon_fkey FOREIGN KEY (to_salon) REFERENCES public.salons(id)
);
CREATE TABLE public.system_log (
  id integer NOT NULL DEFAULT nextval('system_log_id_seq'::regclass),
  user_id uuid,
  salon_id integer,
  action text NOT NULL,
  table_name text NOT NULL,
  reference_id text,
  payload jsonb,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT system_log_pkey PRIMARY KEY (id),
  CONSTRAINT system_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT system_log_salon_id_fkey FOREIGN KEY (salon_id) REFERENCES public.salons(id)
);
CREATE TABLE public.technical_sheets (
  id integer NOT NULL DEFAULT nextval('technical_sheets_id_seq'::regclass),
  customer_id uuid,
  salon_id integer,
  staff_id integer,
  date timestamp without time zone DEFAULT now(),
  description text,
  notes text,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT technical_sheets_pkey PRIMARY KEY (id),
  CONSTRAINT technical_sheets_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT technical_sheets_salon_id_fkey FOREIGN KEY (salon_id) REFERENCES public.salons(id),
  CONSTRAINT technical_sheets_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id)
);
CREATE TABLE public.transfer_items (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  transfer_id bigint NOT NULL,
  product_id integer NOT NULL,
  qty integer NOT NULL CHECK (qty > 0),
  CONSTRAINT transfer_items_pkey PRIMARY KEY (id),
  CONSTRAINT transfer_items_transfer_id_fkey FOREIGN KEY (transfer_id) REFERENCES public.transfers(id),
  CONSTRAINT transfer_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.transfers (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  from_salon integer NOT NULL,
  to_salon integer NOT NULL,
  date date DEFAULT now(),
  causale text,
  note text,
  created_at timestamp without time zone DEFAULT now(),
  executed_at timestamp without time zone,
  executed_by uuid,
  status text NOT NULL DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'ready'::text, 'executed'::text, 'cancelled'::text])),
  CONSTRAINT transfers_pkey PRIMARY KEY (id),
  CONSTRAINT transfers_from_salon_fkey FOREIGN KEY (from_salon) REFERENCES public.salons(id),
  CONSTRAINT transfers_to_salon_fkey FOREIGN KEY (to_salon) REFERENCES public.salons(id)
);
CREATE TABLE public.user_salons (
  id integer NOT NULL DEFAULT nextval('user_salons_id_seq'::regclass),
  user_id uuid,
  salon_id integer,
  role_id integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_salons_pkey PRIMARY KEY (id),
  CONSTRAINT user_salons_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT user_salons_salon_id_fkey FOREIGN KEY (salon_id) REFERENCES public.salons(id),
  CONSTRAINT user_salons_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id)
);
CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  full_name text,
  phone text,
  role_id integer,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id)
);