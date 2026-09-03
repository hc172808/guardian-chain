export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_config: {
        Row: {
          config_key: string
          config_value: Json
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config_key: string
          config_value: Json
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config_key?: string
          config_value?: Json
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      ai_security_events: {
        Row: {
          action: string
          category: string
          created_at: string
          details: Json
          id: string
          model: string | null
          severity: string
          source: string
          subject_address: string | null
          subject_user_id: string | null
          summary: string
        }
        Insert: {
          action?: string
          category: string
          created_at?: string
          details?: Json
          id?: string
          model?: string | null
          severity: string
          source?: string
          subject_address?: string | null
          subject_user_id?: string | null
          summary: string
        }
        Update: {
          action?: string
          category?: string
          created_at?: string
          details?: Json
          id?: string
          model?: string | null
          severity?: string
          source?: string
          subject_address?: string | null
          subject_user_id?: string | null
          summary?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          category: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          target_id: string | null
          target_type: string | null
          user_email: string | null
          user_id: string
        }
        Insert: {
          action: string
          category?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_type?: string | null
          user_email?: string | null
          user_id: string
        }
        Update: {
          action?: string
          category?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_type?: string | null
          user_email?: string | null
          user_id?: string
        }
        Relationships: []
      }
      authorities: {
        Row: {
          category: string
          description: string
          enabled: boolean
          id: string
          name: string
          required_role: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category: string
          description: string
          enabled?: boolean
          id: string
          name: string
          required_role?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          description?: string
          enabled?: boolean
          id?: string
          name?: string
          required_role?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      contract_templates: {
        Row: {
          abi: Json | null
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          parameters: Json | null
          solidity_code: string
          updated_at: string
        }
        Insert: {
          abi?: Json | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          parameters?: Json | null
          solidity_code: string
          updated_at?: string
        }
        Update: {
          abi?: Json | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          parameters?: Json | null
          solidity_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      ddos_protection: {
        Row: {
          action: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_enabled: boolean
          name: string
          parameters: Json | null
          protection_type: string
          threshold: number
          updated_at: string
        }
        Insert: {
          action?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean
          name: string
          parameters?: Json | null
          protection_type?: string
          threshold?: number
          updated_at?: string
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean
          name?: string
          parameters?: Json | null
          protection_type?: string
          threshold?: number
          updated_at?: string
        }
        Relationships: []
      }
      documentation: {
        Row: {
          content: string
          created_at: string
          id: string
          slug: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          slug: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          slug?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      fail2ban_jails: {
        Row: {
          action: string | null
          ban_time: number
          banned_ips: string[] | null
          created_at: string
          created_by: string | null
          description: string | null
          filter_name: string | null
          find_time: number
          id: string
          is_enabled: boolean
          jail_name: string
          log_path: string | null
          max_retries: number
          updated_at: string
        }
        Insert: {
          action?: string | null
          ban_time?: number
          banned_ips?: string[] | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          filter_name?: string | null
          find_time?: number
          id?: string
          is_enabled?: boolean
          jail_name: string
          log_path?: string | null
          max_retries?: number
          updated_at?: string
        }
        Update: {
          action?: string | null
          ban_time?: number
          banned_ips?: string[] | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          filter_name?: string | null
          find_time?: number
          id?: string
          is_enabled?: boolean
          jail_name?: string
          log_path?: string | null
          max_retries?: number
          updated_at?: string
        }
        Relationships: []
      }
      faucet_claims: {
        Row: {
          amount: number
          created_at: string
          id: string
          ip_address: string | null
          token_type: string
          tx_hash: string | null
          user_id: string
          wallet_address: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          ip_address?: string | null
          token_type: string
          tx_hash?: string | null
          user_id: string
          wallet_address: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          ip_address?: string | null
          token_type?: string
          tx_hash?: string | null
          user_id?: string
          wallet_address?: string
        }
        Relationships: []
      }
      feature_toggles: {
        Row: {
          admin_only: boolean
          created_at: string
          description: string | null
          feature_key: string
          feature_name: string
          id: string
          is_enabled: boolean
          updated_at: string
        }
        Insert: {
          admin_only?: boolean
          created_at?: string
          description?: string | null
          feature_key: string
          feature_name: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
        }
        Update: {
          admin_only?: boolean
          created_at?: string
          description?: string | null
          feature_key?: string
          feature_name?: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      firewall_rules: {
        Row: {
          action: string
          created_at: string
          created_by: string | null
          description: string | null
          direction: string
          id: string
          ip_address: string | null
          is_active: boolean
          port: string | null
          protocol: string
          rule_type: string
          updated_at: string
        }
        Insert: {
          action?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          direction?: string
          id?: string
          ip_address?: string | null
          is_active?: boolean
          port?: string | null
          protocol?: string
          rule_type?: string
          updated_at?: string
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          direction?: string
          id?: string
          ip_address?: string | null
          is_active?: boolean
          port?: string | null
          protocol?: string
          rule_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      ip_access_list: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          ip_address: string
          list_type: string
          reason: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          ip_address: string
          list_type?: string
          reason?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          ip_address?: string
          list_type?: string
          reason?: string | null
        }
        Relationships: []
      }
      liquidity_pools: {
        Row: {
          apr: number
          created_at: string
          creator_id: string
          fee_tier: number
          fees_24h: number
          id: string
          is_active: boolean
          token_a_address: string | null
          token_a_symbol: string
          token_b_address: string | null
          token_b_symbol: string
          tvl: number
          updated_at: string
          volume_24h: number
        }
        Insert: {
          apr?: number
          created_at?: string
          creator_id: string
          fee_tier?: number
          fees_24h?: number
          id?: string
          is_active?: boolean
          token_a_address?: string | null
          token_a_symbol: string
          token_b_address?: string | null
          token_b_symbol: string
          tvl?: number
          updated_at?: string
          volume_24h?: number
        }
        Update: {
          apr?: number
          created_at?: string
          creator_id?: string
          fee_tier?: number
          fees_24h?: number
          id?: string
          is_active?: boolean
          token_a_address?: string | null
          token_a_symbol?: string
          token_b_address?: string | null
          token_b_symbol?: string
          tvl?: number
          updated_at?: string
          volume_24h?: number
        }
        Relationships: []
      }
      network_validators: {
        Row: {
          address: string
          blocks_proposed: number
          commission: number
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_jailed: boolean
          last_vote_height: number
          name: string | null
          stake: number
          updated_at: string
          uptime: number
        }
        Insert: {
          address: string
          blocks_proposed?: number
          commission?: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_jailed?: boolean
          last_vote_height?: number
          name?: string | null
          stake?: number
          updated_at?: string
          uptime?: number
        }
        Update: {
          address?: string
          blocks_proposed?: number
          commission?: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_jailed?: boolean
          last_vote_height?: number
          name?: string | null
          stake?: number
          updated_at?: string
          uptime?: number
        }
        Relationships: []
      }
      node_installations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          blocks_synced: number | null
          connection_quality: number | null
          created_at: string
          error_count: number | null
          hash_rate: number | null
          id: string
          is_approved: boolean | null
          is_online: boolean | null
          is_synced: boolean | null
          last_block_height: number | null
          last_heartbeat: string | null
          last_sync_at: string | null
          node_type: string
          peer_count: number | null
          sync_progress: number | null
          total_rewards: number | null
          uptime_seconds: number | null
          user_id: string
          valid_shares: number | null
          wireguard_public_key: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          blocks_synced?: number | null
          connection_quality?: number | null
          created_at?: string
          error_count?: number | null
          hash_rate?: number | null
          id?: string
          is_approved?: boolean | null
          is_online?: boolean | null
          is_synced?: boolean | null
          last_block_height?: number | null
          last_heartbeat?: string | null
          last_sync_at?: string | null
          node_type: string
          peer_count?: number | null
          sync_progress?: number | null
          total_rewards?: number | null
          uptime_seconds?: number | null
          user_id: string
          valid_shares?: number | null
          wireguard_public_key?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          blocks_synced?: number | null
          connection_quality?: number | null
          created_at?: string
          error_count?: number | null
          hash_rate?: number | null
          id?: string
          is_approved?: boolean | null
          is_online?: boolean | null
          is_synced?: boolean | null
          last_block_height?: number | null
          last_heartbeat?: string | null
          last_sync_at?: string | null
          node_type?: string
          peer_count?: number | null
          sync_progress?: number | null
          total_rewards?: number | null
          uptime_seconds?: number | null
          user_id?: string
          valid_shares?: number | null
          wireguard_public_key?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rate_limit_rules: {
        Row: {
          action: string
          burst_limit: number
          created_at: string
          created_by: string | null
          description: string | null
          endpoint: string
          id: string
          is_enabled: boolean
          name: string
          requests_per_window: number
          updated_at: string
          window_seconds: number
        }
        Insert: {
          action?: string
          burst_limit?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          endpoint: string
          id?: string
          is_enabled?: boolean
          name: string
          requests_per_window?: number
          updated_at?: string
          window_seconds?: number
        }
        Update: {
          action?: string
          burst_limit?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          endpoint?: string
          id?: string
          is_enabled?: boolean
          name?: string
          requests_per_window?: number
          updated_at?: string
          window_seconds?: number
        }
        Relationships: []
      }
      smart_contracts: {
        Row: {
          abi: Json | null
          bytecode: string | null
          constructor_args: Json | null
          contract_address: string | null
          created_at: string
          deploy_tx_hash: string | null
          deployed_at: string | null
          description: string | null
          id: string
          is_verified: boolean
          name: string
          source_code: string
          status: string
          template_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          abi?: Json | null
          bytecode?: string | null
          constructor_args?: Json | null
          contract_address?: string | null
          created_at?: string
          deploy_tx_hash?: string | null
          deployed_at?: string | null
          description?: string | null
          id?: string
          is_verified?: boolean
          name: string
          source_code: string
          status?: string
          template_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          abi?: Json | null
          bytecode?: string | null
          constructor_args?: Json | null
          contract_address?: string | null
          created_at?: string
          deploy_tx_hash?: string | null
          deployed_at?: string | null
          description?: string | null
          id?: string
          is_verified?: boolean
          name?: string
          source_code?: string
          status?: string
          template_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "smart_contracts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      token_launches: {
        Row: {
          bonding_curve_steepness: number
          bonding_curve_type: string
          created_at: string
          creator_id: string
          description: string | null
          ends_at: string | null
          id: string
          initial_price: number
          is_premier: boolean
          logo_url: string | null
          max_price: number | null
          name: string
          participants: number
          raised_amount: number
          starts_at: string | null
          status: string
          symbol: string
          target_raise: number
          token_id: string | null
          updated_at: string
        }
        Insert: {
          bonding_curve_steepness?: number
          bonding_curve_type?: string
          created_at?: string
          creator_id: string
          description?: string | null
          ends_at?: string | null
          id?: string
          initial_price?: number
          is_premier?: boolean
          logo_url?: string | null
          max_price?: number | null
          name: string
          participants?: number
          raised_amount?: number
          starts_at?: string | null
          status?: string
          symbol: string
          target_raise?: number
          token_id?: string | null
          updated_at?: string
        }
        Update: {
          bonding_curve_steepness?: number
          bonding_curve_type?: string
          created_at?: string
          creator_id?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          initial_price?: number
          is_premier?: boolean
          logo_url?: string | null
          max_price?: number | null
          name?: string
          participants?: number
          raised_amount?: number
          starts_at?: string | null
          status?: string
          symbol?: string
          target_raise?: number
          token_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_launches_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      token_operations: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          operation_type: string
          status: string
          tx_hash: string | null
          usdt_amount: number | null
          wallet_address: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          operation_type: string
          status?: string
          tx_hash?: string | null
          usdt_amount?: number | null
          wallet_address: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          operation_type?: string
          status?: string
          tx_hash?: string | null
          usdt_amount?: number | null
          wallet_address?: string
        }
        Relationships: []
      }
      token_price: {
        Row: {
          burned_total: number
          circulating_supply: number
          id: string
          price: number
          total_supply: number
          updated_at: string
        }
        Insert: {
          burned_total?: number
          circulating_supply?: number
          id?: string
          price?: number
          total_supply?: number
          updated_at?: string
        }
        Update: {
          burned_total?: number
          circulating_supply?: number
          id?: string
          price?: number
          total_supply?: number
          updated_at?: string
        }
        Relationships: []
      }
      token_price_alerts: {
        Row: {
          created_at: string
          direction: string
          id: string
          is_triggered: boolean
          target_price: number
          token_id: string
          triggered_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          direction?: string
          id?: string
          is_triggered?: boolean
          target_price: number
          token_id: string
          triggered_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          direction?: string
          id?: string
          is_triggered?: boolean
          target_price?: number
          token_id?: string
          triggered_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_price_alerts_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      token_watchlist: {
        Row: {
          created_at: string
          id: string
          token_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          token_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          token_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_watchlist_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      tokens: {
        Row: {
          address: string
          burned_supply: number
          created_at: string
          creator_id: string
          decimals: number
          description: string | null
          discord: string | null
          facebook: string | null
          freeze_enabled: boolean
          freeze_holder: string | null
          freeze_locked: boolean
          gyds_liquidity: number
          hosted_site_fee_paid: number | null
          hosted_site_url: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          lp_lock_type: string
          lp_unlock_time: string | null
          mint_enabled: boolean
          mint_holder: string | null
          mint_locked: boolean
          name: string
          symbol: string
          telegram: string | null
          total_supply: number
          twitter: string | null
          update_enabled: boolean
          update_holder: string | null
          update_locked: boolean
          updated_at: string
          website: string | null
        }
        Insert: {
          address: string
          burned_supply?: number
          created_at?: string
          creator_id: string
          decimals?: number
          description?: string | null
          discord?: string | null
          facebook?: string | null
          freeze_enabled?: boolean
          freeze_holder?: string | null
          freeze_locked?: boolean
          gyds_liquidity?: number
          hosted_site_fee_paid?: number | null
          hosted_site_url?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          lp_lock_type?: string
          lp_unlock_time?: string | null
          mint_enabled?: boolean
          mint_holder?: string | null
          mint_locked?: boolean
          name: string
          symbol: string
          telegram?: string | null
          total_supply: number
          twitter?: string | null
          update_enabled?: boolean
          update_holder?: string | null
          update_locked?: boolean
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string
          burned_supply?: number
          created_at?: string
          creator_id?: string
          decimals?: number
          description?: string | null
          discord?: string | null
          facebook?: string | null
          freeze_enabled?: boolean
          freeze_holder?: string | null
          freeze_locked?: boolean
          gyds_liquidity?: number
          hosted_site_fee_paid?: number | null
          hosted_site_url?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          lp_lock_type?: string
          lp_unlock_time?: string | null
          mint_enabled?: boolean
          mint_holder?: string | null
          mint_locked?: boolean
          name?: string
          symbol?: string
          telegram?: string | null
          total_supply?: number
          twitter?: string | null
          update_enabled?: boolean
          update_holder?: string | null
          update_locked?: boolean
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          block_height: number | null
          confirmed_at: string | null
          created_at: string
          fee: number
          from_address: string
          id: string
          status: string
          to_address: string
          tx_hash: string | null
          user_id: string
          wallet_id: string | null
        }
        Insert: {
          amount: number
          block_height?: number | null
          confirmed_at?: string | null
          created_at?: string
          fee?: number
          from_address: string
          id?: string
          status?: string
          to_address: string
          tx_hash?: string | null
          user_id: string
          wallet_id?: string | null
        }
        Update: {
          amount?: number
          block_height?: number | null
          confirmed_at?: string | null
          created_at?: string
          fee?: number
          from_address?: string
          id?: string
          status?: string
          to_address?: string
          tx_hash?: string | null
          user_id?: string
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      validator_delegations: {
        Row: {
          amount: number
          created_at: string
          delegated_at: string
          id: string
          status: string
          undelegated_at: string | null
          user_id: string
          validator_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          delegated_at?: string
          id?: string
          status?: string
          undelegated_at?: string | null
          user_id: string
          validator_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          delegated_at?: string
          id?: string
          status?: string
          undelegated_at?: string | null
          user_id?: string
          validator_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "validator_delegations_validator_id_fkey"
            columns: ["validator_id"]
            isOneToOne: false
            referencedRelation: "network_validators"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          address: string
          created_at: string
          encrypted_seed: string
          id: string
          pin_hash: string
          user_id: string
        }
        Insert: {
          address: string
          created_at?: string
          encrypted_seed: string
          id?: string
          pin_hash: string
          user_id: string
        }
        Update: {
          address?: string
          created_at?: string
          encrypted_seed?: string
          id?: string
          pin_hash?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_authority_summary: {
        Row: {
          category: string | null
          disabled_count: number | null
          enabled_count: number | null
          total: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "user" | "admin" | "founder"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["user", "admin", "founder"],
    },
  },
} as const
