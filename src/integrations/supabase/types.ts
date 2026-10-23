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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      builds: {
        Row: {
          author_name: string | null
          weapon: string | null
          helmet: string | null
          armor: string | null
          boots: string | null
          cape: string | null
          offhand: string | null
          potion: string | null
          food: string | null
          mount: string | null
          content_type: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          author_name?: string | null
          weapon?: string | null
          helmet?: string | null
          armor?: string | null
          boots?: string | null
          cape?: string | null
          offhand?: string | null
          potion?: string | null
          food?: string | null
          mount?: string | null
          content_type?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          owner_id?: string
          updated_at?: string
        }
        Update: {
          author_name?: string | null
          weapon?: string | null
          helmet?: string | null
          armor?: string | null
          boots?: string | null
          cape?: string | null
          offhand?: string | null
          potion?: string | null
          food?: string | null
          mount?: string | null
          content_type?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      content_options: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
          position: number
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          name: string
          position?: number
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          position?: number
        }
        Relationships: []
      }
      build_groups: {
        Row: {
          author_name: string | null
          content_type: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          author_name?: string | null
          content_type?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          owner_id?: string
          updated_at?: string
        }
        Update: {
          author_name?: string | null
          content_type?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      build_group_members: {
        Row: {
          build_id: string
          created_at: string
          group_id: string
          id: string
          position: number
          quantity: number
          role: string | null
        }
        Insert: {
          build_id: string
          created_at?: string
          group_id: string
          id?: string
          position?: number
          quantity?: number
          role?: string | null
        }
        Update: {
          build_id?: string
          created_at?: string
          group_id?: string
          id?: string
          position?: number
          quantity?: number
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "build_group_members_build_id_fkey"
            columns: ["build_id"]
            isOneToOne: false
            referencedRelation: "builds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "build_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "build_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      discord_channels: {
        Row: {
          channel_id: string
          created_at: string
          guild_id: string
          id: string
          label: string | null
          user_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          guild_id: string
          id?: string
          label?: string | null
          user_id?: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          guild_id?: string
          id?: string
          label?: string | null
          user_id?: string
        }
        Relationships: []
      }
      discord_posts: {
        Row: {
          channel_id: string
          created_at: string
          event_id: string
          message_id: string
          reminded_at: string | null
        }
        Insert: {
          channel_id: string
          created_at?: string
          event_id: string
          message_id: string
          reminded_at?: string | null
        }
        Update: {
          channel_id?: string
          created_at?: string
          event_id?: string
          message_id?: string
          reminded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discord_posts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_editors: {
        Row: {
          created_at: string
          event_id: string
          granted_by: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          granted_by?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          granted_by?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_editors_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_weapons: {
        Row: {
          build_id: string | null
          event_id: string
          icon_code: string | null
          icon_path: string | null
          id: string
          name: string
          position: number
          role: string | null
          slots: number
        }
        Insert: {
          build_id?: string | null
          event_id: string
          icon_code?: string | null
          icon_path?: string | null
          id?: string
          name: string
          position?: number
          role?: string | null
          slots?: number
        }
        Update: {
          build_id?: string | null
          event_id?: string
          icon_code?: string | null
          icon_path?: string | null
          id?: string
          name?: string
          position?: number
          role?: string | null
          slots?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_weapons_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_weapons_build_id_fkey"
            columns: ["build_id"]
            isOneToOne: false
            referencedRelation: "builds"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          caller_name: string | null
          content_type: string | null
          created_at: string
          created_by: string
          guild_id: string | null
          is_private: boolean
          description: string | null
          id: string
          max_players: number
          mode: string | null
          starts_at: string
          title: string
        }
        Insert: {
          caller_name?: string | null
          content_type?: string | null
          created_at?: string
          created_by?: string
          guild_id?: string | null
          is_private?: boolean
          description?: string | null
          id?: string
          max_players?: number
          mode?: string | null
          starts_at: string
          title: string
        }
        Update: {
          caller_name?: string | null
          content_type?: string | null
          created_at?: string
          created_by?: string
          guild_id?: string | null
          is_private?: boolean
          description?: string | null
          id?: string
          max_players?: number
          mode?: string | null
          starts_at?: string
          title?: string
        }
        Relationships: []
      }
      gear_catalog: {
        Row: {
          category: string | null
          created_at: string
          id: string
          item_code: string
          max_enchant: number
          max_tier: number
          min_tier: number
          name: string
          position: number
          slot: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          item_code: string
          max_enchant?: number
          max_tier?: number
          min_tier?: number
          name: string
          position?: number
          slot: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          item_code?: string
          max_enchant?: number
          max_tier?: number
          min_tier?: number
          name?: string
          position?: number
          slot?: string
        }
        Relationships: []
      }
      attendance: {
        Row: { event_id: string; marked_at: string; nick: string; present: boolean }
        Insert: { event_id: string; marked_at?: string; nick: string; present: boolean }
        Update: { event_id?: string; marked_at?: string; nick?: string; present?: boolean }
        Relationships: [
          { foreignKeyName: "attendance_event_id_fkey"; columns: ["event_id"]; isOneToOne: false; referencedRelation: "events"; referencedColumns: ["id"] },
        ]
      }
      guilds: {
        Row: { created_at: string; description: string | null; id: string; name: string; owner_id: string; slug: string }
        Insert: { created_at?: string; description?: string | null; id?: string; name: string; owner_id?: string; slug: string }
        Update: { created_at?: string; description?: string | null; id?: string; name?: string; owner_id?: string; slug?: string }
        Relationships: []
      }
      profiles: {
        Row: { albion_guild: string | null; albion_nick: string | null; avatar_url: string | null; created_at: string; display_name: string; guild_id: string | null; guild_leader: boolean; updated_at: string; user_id: string }
        Insert: { albion_guild?: string | null; albion_nick?: string | null; avatar_url?: string | null; created_at?: string; display_name: string; guild_id?: string | null; guild_leader?: boolean; updated_at?: string; user_id: string }
        Update: { albion_guild?: string | null; albion_nick?: string | null; avatar_url?: string | null; created_at?: string; display_name?: string; guild_id?: string | null; guild_leader?: boolean; updated_at?: string; user_id?: string }
        Relationships: [
          { foreignKeyName: "profiles_guild_id_fkey"; columns: ["guild_id"]; isOneToOne: false; referencedRelation: "guilds"; referencedColumns: ["id"] },
        ]
      }
      confirmations: {
        Row: { confirmed_at: string; event_id: string; nick: string }
        Insert: { confirmed_at?: string; event_id: string; nick: string }
        Update: { confirmed_at?: string; event_id?: string; nick?: string }
        Relationships: [
          { foreignKeyName: "confirmations_event_id_fkey"; columns: ["event_id"]; isOneToOne: false; referencedRelation: "events"; referencedColumns: ["id"] },
        ]
      }
      event_messages: {
        Row: { body: string; created_at: string; event_id: string; id: string; nick: string }
        Insert: { body: string; created_at?: string; event_id: string; id?: string; nick: string }
        Update: { body?: string; created_at?: string; event_id?: string; id?: string; nick?: string }
        Relationships: [
          { foreignKeyName: "event_messages_event_id_fkey"; columns: ["event_id"]; isOneToOne: false; referencedRelation: "events"; referencedColumns: ["id"] },
        ]
      }
      loot_sessions: {
        Row: { created_at: string; created_by: string; event_id: string; id: string; people: Json; silver: number; split_config: Json; status: string; title: string }
        Insert: { created_at?: string; created_by?: string; event_id: string; id?: string; people?: Json; silver?: number; split_config?: Json; status?: string; title?: string }
        Update: { created_at?: string; created_by?: string; event_id?: string; id?: string; people?: Json; silver?: number; split_config?: Json; status?: string; title?: string }
        Relationships: [
          { foreignKeyName: "loot_sessions_event_id_fkey"; columns: ["event_id"]; isOneToOne: false; referencedRelation: "events"; referencedColumns: ["id"] },
        ]
      }
      loot_items: {
        Row: { created_at: string; external_id: string | null; id: string; looted_by: string | null; name: string; quantity: number; session_id: string; unit_value: number }
        Insert: { created_at?: string; external_id?: string | null; id?: string; looted_by?: string | null; name: string; quantity?: number; session_id: string; unit_value?: number }
        Update: { created_at?: string; external_id?: string | null; id?: string; looted_by?: string | null; name?: string; quantity?: number; session_id?: string; unit_value?: number }
        Relationships: [
          { foreignKeyName: "loot_items_session_id_fkey"; columns: ["session_id"]; isOneToOne: false; referencedRelation: "loot_sessions"; referencedColumns: ["id"] },
        ]
      }
      logger_tokens: {
        Row: { created_at: string; id: string; label: string; last_used_at: string | null; token_hash: string; user_id: string }
        Insert: { created_at?: string; id?: string; label?: string; last_used_at?: string | null; token_hash: string; user_id?: string }
        Update: { created_at?: string; id?: string; label?: string; last_used_at?: string | null; token_hash?: string; user_id?: string }
        Relationships: []
      }
      dps_entries: {
        Row: { damage: number; healing: number; nick: string; session_id: string }
        Insert: { damage?: number; healing?: number; nick: string; session_id: string }
        Update: { damage?: number; healing?: number; nick?: string; session_id?: string }
        Relationships: [
          { foreignKeyName: "dps_entries_session_id_fkey"; columns: ["session_id"]; isOneToOne: false; referencedRelation: "loot_sessions"; referencedColumns: ["id"] },
        ]
      }
      waitlist: {
        Row: { created_at: string; event_id: string; id: string; nick: string; weapon_id: string }
        Insert: { created_at?: string; event_id: string; id?: string; nick: string; weapon_id: string }
        Update: { created_at?: string; event_id?: string; id?: string; nick?: string; weapon_id?: string }
        Relationships: [
          { foreignKeyName: "waitlist_event_id_fkey"; columns: ["event_id"]; isOneToOne: false; referencedRelation: "events"; referencedColumns: ["id"] },
          { foreignKeyName: "waitlist_weapon_id_fkey"; columns: ["weapon_id"]; isOneToOne: false; referencedRelation: "event_weapons"; referencedColumns: ["id"] },
        ]
      }
      signups: {
        Row: {
          created_at: string
          event_id: string
          id: string
          nick: string
          weapon_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          nick: string
          weapon_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          nick?: string
          weapon_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signups_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signups_weapon_id_fkey"
            columns: ["weapon_id"]
            isOneToOne: false
            referencedRelation: "event_weapons"
            referencedColumns: ["id"]
          },
        ]
      }
      site_share_settings: {
        Row: {
          id: string
          image_path: string
          updated_at: string
        }
        Insert: {
          id?: string
          image_path: string
          updated_at?: string
        }
        Update: {
          id?: string
          image_path?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      weapon_catalog: {
        Row: {
          category: string | null
          created_at: string
          id: string
          item_code: string
          name: string
          position: number
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          item_code: string
          name: string
          position?: number
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          item_code?: string
          name?: string
          position?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      discord_claim_reminder: {
        Args: { p_event: string }
        Returns: boolean
      }
      discord_confirm: {
        Args: { p_event: string; p_discord_user: string }
        Returns: string[]
      }
      discord_claim_promotions: {
        Args: { p_event?: string }
        Returns: { event_id: string; weapon_id: string | null; nick: string }[]
      }
      discord_waitlist_join: {
        Args: { p_event: string; p_weapon: string; p_nick: string; p_discord_user: string }
        Returns: number
      }
      discord_leave: {
        Args: { p_event: string; p_discord_user: string }
        Returns: number
      }
      discord_signup: {
        Args: { p_event: string; p_weapon: string; p_nick: string; p_discord_user: string }
        Returns: undefined
      }
      admin_rename_content_option: {
        Args: { _id: string; _name: string }
        Returns: string
      }
      admin_panel_directory: {
        Args: never
        Returns: {
          created_at: string
          email: string
          is_admin: boolean
          is_creator: boolean
          user_id: string
        }[]
      }
      admin_set_admin_by_email: {
        Args: { _email: string; _grant: boolean }
        Returns: string
      }
      admin_set_panel_role: {
        Args: {
          _email: string
          _grant: boolean
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: string
      }
      admin_user_directory: {
        Args: never
        Returns: {
          created_at: string
          email: string
          is_admin: boolean
          user_id: string
        }[]
      }
      can_access_content_panel: { Args: never; Returns: boolean }
      can_create_content: { Args: never; Returns: boolean }
      can_edit_event: { Args: { _event_id: string }; Returns: boolean }
      can_manage_event: { Args: { _event_id: string }; Returns: boolean }
      logger_create_token: { Args: { _label?: string }; Returns: string }
      logger_my_events: { Args: { _token: string }; Returns: { id: string; starts_at: string; title: string }[] }
      logger_ingest: {
        Args: { _dps?: Json; _event: string; _items?: Json; _session?: string; _silver?: number; _token: string }
        Returns: Json
      }
      send_event_message: {
        Args: { _body: string; _event_id: string }
        Returns: { body: string; created_at: string; event_id: string; id: string; nick: string }
      }
      event_editor_directory: {
        Args: { _event_id: string }
        Returns: {
          created_at: string
          email: string
          user_id: string
        }[]
      }
      grant_event_editor: {
        Args: { _email: string; _event_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      managed_event_ids: {
        Args: never
        Returns: {
          id: string
        }[]
      }
      revoke_event_editor: {
        Args: { _event_id: string; _user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user" | "creator"
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
      app_role: ["admin", "user", "creator"],
    },
  },
} as const
