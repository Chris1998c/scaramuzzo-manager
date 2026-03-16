BEGIN;

create table if not exists public.fiscal_print_jobs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  salon_id integer not null references public.salons(id),
  created_by uuid not null references auth.users(id),
  kind text not null,
  printer_model text,
  printer_serial text,
  payload jsonb not null,
  status text not null default 'pending'
);

create index if not exists fiscal_print_jobs_salon_id_idx
  on public.fiscal_print_jobs (salon_id);

create index if not exists fiscal_print_jobs_status_idx
  on public.fiscal_print_jobs (status);

alter table public.fiscal_print_jobs
  enable row level security;

grant select, insert, update, delete
  on table public.fiscal_print_jobs
  to service_role;

grant usage, select
  on sequence public.fiscal_print_jobs_id_seq
  to service_role;

COMMIT;
