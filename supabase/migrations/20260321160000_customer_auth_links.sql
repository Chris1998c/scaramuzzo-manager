-- Bridge esplicito account Supabase (auth.users) ↔ anagrafica cliente (public.customers).
-- Il legame futuro non usa customers.id = auth.uid(); passa da questa tabella.

BEGIN;

CREATE TABLE public.customer_auth_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  user_id uuid NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  link_method text,
  verified_at timestamptz NULL,
  CONSTRAINT customer_auth_links_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES public.customers (id) ON DELETE CASCADE,
  CONSTRAINT customer_auth_links_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT customer_auth_links_customer_id_key UNIQUE (customer_id),
  CONSTRAINT customer_auth_links_user_id_key UNIQUE (user_id)
);

COMMENT ON TABLE public.customer_auth_links IS
  'Collegamento 1:1 tra utente Auth e record customers; policy RLS da definire con i flussi app.';

ALTER TABLE public.customer_auth_links ENABLE ROW LEVEL SECURITY;

-- Solo service_role finché non esistono policy RLS per il ruolo app cliente (bypass RLS).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customer_auth_links TO service_role;

COMMIT;
