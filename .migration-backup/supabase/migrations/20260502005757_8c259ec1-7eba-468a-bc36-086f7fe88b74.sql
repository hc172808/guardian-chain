-- Authority Registry: 49 chain-level capability switches
CREATE TABLE IF NOT EXISTS public.authorities (
  id text PRIMARY KEY,
  category text NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  required_role text NOT NULL DEFAULT 'founder' CHECK (required_role IN ('founder', 'admin')),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.authorities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view authorities"
  ON public.authorities FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Founders can update any authority"
  ON public.authorities FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'founder'::app_role));

CREATE POLICY "Admins can update admin-required authorities"
  ON public.authorities FOR UPDATE
  TO authenticated
  USING (
    required_role = 'admin'
    AND (has_role(auth.uid(), 'founder'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  );

CREATE POLICY "Founders can insert authorities"
  ON public.authorities FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'founder'::app_role));

CREATE INDEX IF NOT EXISTS idx_authorities_category ON public.authorities(category);
CREATE INDEX IF NOT EXISTS idx_authorities_enabled ON public.authorities(enabled);

-- Summary view for quick category badges
CREATE OR REPLACE VIEW public.v_authority_summary AS
SELECT
  category,
  count(*) AS total,
  count(*) FILTER (WHERE enabled) AS enabled_count,
  count(*) FILTER (WHERE NOT enabled) AS disabled_count
FROM public.authorities
GROUP BY category;

GRANT SELECT ON public.v_authority_summary TO authenticated, anon;

-- Seed all 49 authorities
INSERT INTO public.authorities (id, category, name, description, required_role) VALUES
  -- Consensus & Block Production (8)
  ('genesis',                'Consensus & Block Production', 'Genesis Authority',                'Defines the genesis block and initial chain state.',                  'founder'),
  ('validator',              'Consensus & Block Production', 'Validator Authority',              'Permission to act as a validator and propose blocks.',                'founder'),
  ('miner',                  'Consensus & Block Production', 'Miner Authority',                  'Permission to mine and earn block rewards.',                          'founder'),
  ('consensus_rules',        'Consensus & Block Production', 'Consensus Rules Authority',        'Owns the active consensus rule set.',                                 'founder'),
  ('block_production',       'Consensus & Block Production', 'Block Production Authority',       'Controls who may produce new blocks.',                                'founder'),
  ('fork_choice',            'Consensus & Block Production', 'Fork Choice Authority',            'Decides the canonical chain on competing forks.',                     'founder'),
  ('finality',               'Consensus & Block Production', 'Finality Authority',               'Marks blocks as final and irreversible.',                             'founder'),
  ('validator_set_mgmt',     'Consensus & Block Production', 'Validator Set Management Authority','Adds, removes, and rotates validators.',                              'founder'),

  -- Economic / Monetary (7)
  ('mint',                   'Economic / Monetary',          'Mint Authority',                   'Permission to mint new tokens.',                                       'founder'),
  ('burn',                   'Economic / Monetary',          'Burn Authority',                   'Permission to burn tokens from supply.',                               'founder'),
  ('emission',               'Economic / Monetary',          'Emission Authority',               'Controls the chain emission schedule.',                                'founder'),
  ('fee_setting',            'Economic / Monetary',          'Fee Setting Authority',            'Sets transaction and protocol fees.',                                  'admin'),
  ('reward_distribution',    'Economic / Monetary',          'Reward Distribution Authority',    'Controls validator and miner reward payouts.',                         'founder'),
  ('treasury',               'Economic / Monetary',          'Treasury Authority',               'Controls the protocol treasury.',                                      'founder'),
  ('inflation_policy',       'Economic / Monetary',          'Inflation Policy Authority',       'Adjusts the inflation policy.',                                        'founder'),

  -- Protocol Upgrade (6)
  ('slashing',               'Consensus & Block Production', 'Slashing Authority',               'Punishes misbehaving validators by slashing stake.',                   'founder'),
  ('upgrade',                'Protocol Upgrade',             'Upgrade Authority',                'Authorizes protocol upgrades.',                                        'founder'),
  ('parameter_update',       'Protocol Upgrade',             'Parameter Update Authority',       'Updates on-chain parameters.',                                         'founder'),
  ('protocol_config',        'Protocol Upgrade',             'Protocol Configuration Authority', 'Controls protocol-wide configuration.',                                'founder'),
  ('hard_fork',              'Protocol Upgrade',             'Hard Fork Authority',              'Authorizes a hard fork of the chain.',                                 'founder'),
  ('soft_fork',              'Protocol Upgrade',             'Soft Fork Authority',              'Authorizes a soft fork of the chain.',                                 'founder'),
  ('state_transition',       'Protocol Upgrade',             'State Transition Authority',       'Controls allowed state transitions.',                                  'founder'),

  -- Administrative (5)
  ('admin',                  'Administrative',               'Admin Authority',                  'Standard administrative powers.',                                      'admin'),
  ('super_admin',            'Administrative',               'Super Admin Authority',            'Elevated administrative powers.',                                      'founder'),
  ('freeze_pause',           'Administrative',               'Freeze / Pause Authority',         'Pauses token transfers system-wide.',                                  'founder'),
  ('blacklist',              'Administrative',               'Blacklist Authority',              'Blacklists addresses from interacting with the protocol.',             'admin'),
  ('account_recovery',       'Administrative',               'Account Recovery Authority',       'Recovers lost or compromised accounts.',                               'admin'),

  -- Access / Security (1) + Emergency
  ('emergency_shutdown',     'Administrative',               'Emergency Shutdown Authority',     'Halts the entire chain in an emergency.',                              'founder'),

  -- Governance (5)
  ('governance',             'Governance',                   'Governance Authority',             'Top-level governance powers.',                                         'founder'),
  ('proposal_submission',    'Governance',                   'Proposal Submission Authority',    'Permission to submit governance proposals.',                           'admin'),
  ('voting',                 'Governance',                   'Voting Authority',                 'Permission to vote on governance proposals.',                          'admin'),
  ('execution',              'Governance',                   'Execution Authority',              'Executes passed governance proposals.',                                'founder'),
  ('delegation',             'Governance',                   'Delegation Authority',             'Permission to delegate stake or votes.',                               'admin'),

  -- Access / Security RBAC (5)
  ('multisig',               'Access / Security',            'Multi-Signature Authority',        'Controls multi-signature operations.',                                 'founder'),
  ('rbac',                   'Access / Security',            'Role-Based Access Control',        'Controls the RBAC system.',                                            'founder'),
  ('permission_grant',       'Access / Security',            'Permission Grant Authority',       'Grants permissions to roles or accounts.',                             'admin'),
  ('permission_revoke',      'Access / Security',            'Permission Revocation Authority',  'Revokes permissions from roles or accounts.',                          'admin'),
  ('key_rotation',           'Access / Security',            'Key Rotation Authority',           'Rotates protocol or admin keys.',                                      'founder'),

  -- Cross-Chain & Oracles (5)
  ('oracle',                 'Cross-Chain & Oracles',        'Oracle Authority',                 'Controls oracle registrations and updates.',                           'admin'),
  ('bridge',                 'Cross-Chain & Oracles',        'Bridge Authority',                 'Controls cross-chain bridge operations.',                              'founder'),
  ('relayer',                'Cross-Chain & Oracles',        'Relayer Authority',                'Permission to operate as a relayer.',                                  'admin'),
  ('cross_chain_messaging',  'Cross-Chain & Oracles',        'Cross-Chain Messaging Authority',  'Controls cross-chain message passing.',                                'founder'),
  ('data_feed',              'Cross-Chain & Oracles',        'Data Feed Authority',              'Controls on-chain data feeds.',                                        'admin'),

  -- Contract Lifecycle (4)
  ('contract_deploy',        'Contract Lifecycle',           'Contract Deployment Authority',    'Permission to deploy smart contracts.',                                'admin'),
  ('contract_upgrade',       'Contract Lifecycle',           'Contract Upgrade Authority',       'Permission to upgrade existing contracts.',                            'admin'),
  ('contract_execute',       'Contract Lifecycle',           'Contract Execution Authority',     'Permission to execute contract calls.',                                'admin'),
  ('contract_pause',         'Contract Lifecycle',           'Contract Pausing Authority',       'Permission to pause specific contracts.',                              'founder'),

  -- Wallet (2)
  ('wallet',                 'Wallet',                       'Wallet Authority (Private Key Ownership)','Custody of wallet private keys.',                                'admin'),
  ('tx_signing',             'Wallet',                       'Transaction Signing Authority',    'Permission to sign transactions on behalf of an account.',             'admin')
ON CONFLICT (id) DO NOTHING;