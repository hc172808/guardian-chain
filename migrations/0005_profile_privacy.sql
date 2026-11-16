-- Persist profile visibility and default existing accounts to private.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;
