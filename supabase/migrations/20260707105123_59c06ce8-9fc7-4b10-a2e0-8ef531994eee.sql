-- Remove WireGuard private key column: private keys must never be stored server-side.
-- The client generates keys locally and only the public key is persisted.
ALTER TABLE public.node_installations DROP COLUMN IF EXISTS wireguard_private_key;