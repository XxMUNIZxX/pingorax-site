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
          event_id: string
          icon_path: string | null
          id: string
          name: string
          position: number
          slots: number
        }
        Insert: {
          event_id: string
          icon_path?: string | null
          id?: string
          name: string
          position?: number
          slots?: number
        }
        Update: {
          event_id?: string
          icon_path?: string | null
          id?: string
          name?: string
          position?: number
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
        ]
      }
      events: {
        Row: {
          caller_name: string | null
          content_type: string | null
          created_at: string
          created_by: string
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
          description?: string | null
          id?: string
          max_players?: number
          mode?: string | null
          starts_at?: string
          title?: string
        }
        Relationships: []
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
