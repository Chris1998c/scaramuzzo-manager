-- Bridge installations + scoped tokens (enterprise / SaaS-ready)
-- Non modifica fiscal_print_jobs, close_sale_atomic, finalize_fiscal_job_atomic.

-- SaaS: tenant_id nullable senza FK finché non esiste tabella tenants (1 azienda / 4 saloni oggi).
CREATE TABLE IF NOT EXISTS public.bridge_installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NULL,
  salon_id integer NOT NULL REFERENCES public.salons (id) ON DELETE RESTRICT,
  bridge_id text NOT NULL,
  name text NULL,
  status text NOT NULL DEFAULT 'unknown',
  version text NULL,
  last_seen_at timestamptz NULL,
  last_health jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL,
  CONSTRAINT bridge_installations_bridge_id_unique UNIQUE (bridge_id),
  CONSTRAINT bridge_installations_salon_id_check CHECK (salon_id BETWEEN 1 AND 4),
  CONSTRAINT bridge_installations_status_check CHECK (
    status IN ('unknown', 'online', 'offline', 'degraded', 'revoked')
  )
);

COMMENT ON TABLE public.bridge_installations IS
  'Registro bridge Print locali per salone. tenant_id riservato multi-tenant SaaS futuro.';
COMMENT ON COLUMN public.bridge_installations.tenant_id IS
  'Nullable: futuro isolamento tenant; NULL = singola azienda Scaramuzzo.';

CREATE INDEX IF NOT EXISTS bridge_installations_salon_id_idx
  ON public.bridge_installations (salon_id);

CREATE INDEX IF NOT EXISTS bridge_installations_last_seen_at_idx
  ON public.bridge_installations (last_seen_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS public.bridge_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bridge_installation_id uuid NOT NULL REFERENCES public.bridge_installations (id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  token_prefix text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NULL,
  revoked_at timestamptz NULL,
  expires_at timestamptz NULL,
  CONSTRAINT bridge_tokens_token_hash_unique UNIQUE (token_hash)
);

COMMENT ON TABLE public.bridge_tokens IS
  'Token bridge: solo hash SHA-256 (+ pepper server). Mai plaintext in DB.';

CREATE INDEX IF NOT EXISTS bridge_tokens_installation_id_idx
  ON public.bridge_tokens (bridge_installation_id);

CREATE INDEX IF NOT EXISTS bridge_tokens_active_idx
  ON public.bridge_tokens (bridge_installation_id)
  WHERE revoked_at IS NULL;

-- RLS: nessuna policy per authenticated → solo service role (Manager supabaseAdmin / Edge future).
ALTER TABLE public.bridge_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bridge_tokens ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bridge_installations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bridge_tokens TO service_role;
