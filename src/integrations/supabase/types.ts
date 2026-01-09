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
    PostgrestVersion: "14.1"
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
          wireguard_private_key: string | null
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
          wireguard_private_key?: string | null
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
          wireguard_private_key?: string | null
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
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
