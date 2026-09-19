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
      account_cadence_steps: {
        Row: {
          account_id: string
          channel: string
          org_id: string
          recipients: string
          step_key: string
          tone: string
        }
        Insert: {
          account_id: string
          channel: string
          org_id: string
          recipients: string
          step_key: string
          tone: string
        }
        Update: {
          account_id?: string
          channel?: string
          org_id?: string
          recipients?: string
          step_key?: string
          tone?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_cadence_steps_account_fk"
            columns: ["account_id", "org_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "account_cadence_steps_account_fk"
            columns: ["account_id", "org_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id", "org_id"]
          },
          {
            foreignKeyName: "account_cadence_steps_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          archived_at: string | null
          chase_mode: string
          created_at: string
          default_currency: string
          detail_version: string
          id: string
          is_msme: boolean
          ladder_version: string
          last_synced_at: string | null
          name: string
          name_normalized: string | null
          notes: string | null
          org_id: string
          owner_user_id: string | null
          p1_after_days: number
          p2_after_days: number
          pause_reason: string | null
          paused_at: string | null
          paused_until: string | null
          send_window_closes: string | null
          send_window_days: string[] | null
          send_window_mode: string
          send_window_opens: string | null
          stop_note: string | null
          stop_reason: string | null
          tds_rate: number | null
          tds_section: string
          term_days: number
          terms_preset: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          chase_mode?: string
          created_at?: string
          default_currency?: string
          detail_version?: string
          id?: string
          is_msme?: boolean
          ladder_version?: string
          last_synced_at?: string | null
          name: string
          name_normalized?: string | null
          notes?: string | null
          org_id: string
          owner_user_id?: string | null
          p1_after_days?: number
          p2_after_days?: number
          pause_reason?: string | null
          paused_at?: string | null
          paused_until?: string | null
          send_window_closes?: string | null
          send_window_days?: string[] | null
          send_window_mode?: string
          send_window_opens?: string | null
          stop_note?: string | null
          stop_reason?: string | null
          tds_rate?: number | null
          tds_section?: string
          term_days?: number
          terms_preset?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          chase_mode?: string
          created_at?: string
          default_currency?: string
          detail_version?: string
          id?: string
          is_msme?: boolean
          ladder_version?: string
          last_synced_at?: string | null
          name?: string
          name_normalized?: string | null
          notes?: string | null
          org_id?: string
          owner_user_id?: string | null
          p1_after_days?: number
          p2_after_days?: number
          pause_reason?: string | null
          paused_at?: string | null
          paused_until?: string | null
          send_window_closes?: string | null
          send_window_days?: string[] | null
          send_window_mode?: string
          send_window_opens?: string | null
          stop_note?: string | null
          stop_reason?: string | null
          tds_rate?: number | null
          tds_section?: string
          term_days?: number
          terms_preset?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          account_id: string
          actor_user_id: string | null
          contact_id: string | null
          detail: string
          id: string
          invoice_id: string | null
          kind: string
          link_href: string | null
          link_label: string | null
          occurred_at: string
          org_id: string
          title: string
          tone: string
        }
        Insert: {
          account_id: string
          actor_user_id?: string | null
          contact_id?: string | null
          detail?: string
          id?: string
          invoice_id?: string | null
          kind: string
          link_href?: string | null
          link_label?: string | null
          occurred_at?: string
          org_id: string
          title: string
          tone?: string
        }
        Update: {
          account_id?: string
          actor_user_id?: string | null
          contact_id?: string | null
          detail?: string
          id?: string
          invoice_id?: string | null
          kind?: string
          link_href?: string | null
          link_label?: string | null
          occurred_at?: string
          org_id?: string
          title?: string
          tone?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_account_fk"
            columns: ["account_id", "org_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "activity_log_account_fk"
            columns: ["account_id", "org_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id", "org_id"]
          },
          {
            foreignKeyName: "activity_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          actor_id: string | null
          after: Json | null
          before: Json | null
          id: number
          occurred_at: string
          op: string
          org_id: string | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: never
          occurred_at?: string
          op: string
          org_id?: string | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: never
          occurred_at?: string
          op?: string
          org_id?: string | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      audit_log_202607: {
        Row: {
          actor_id: string | null
          after: Json | null
          before: Json | null
          id: number
          occurred_at: string
          op: string
          org_id: string | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: never
          occurred_at?: string
          op: string
          org_id?: string | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: never
          occurred_at?: string
          op?: string
          org_id?: string | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      audit_log_202608: {
        Row: {
          actor_id: string | null
          after: Json | null
          before: Json | null
          id: number
          occurred_at: string
          op: string
          org_id: string | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: never
          occurred_at?: string
          op: string
          org_id?: string | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: never
          occurred_at?: string
          op?: string
          org_id?: string | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      audit_log_202609: {
        Row: {
          actor_id: string | null
          after: Json | null
          before: Json | null
          id: number
          occurred_at: string
          op: string
          org_id: string | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: never
          occurred_at?: string
          op: string
          org_id?: string | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: never
          occurred_at?: string
          op?: string
          org_id?: string | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      audit_log_202610: {
        Row: {
          actor_id: string | null
          after: Json | null
          before: Json | null
          id: number
          occurred_at: string
          op: string
          org_id: string | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: never
          occurred_at?: string
          op: string
          org_id?: string | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: never
          occurred_at?: string
          op?: string
          org_id?: string | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      audit_log_202611: {
        Row: {
          actor_id: string | null
          after: Json | null
          before: Json | null
          id: number
          occurred_at: string
          op: string
          org_id: string | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: never
          occurred_at?: string
          op: string
          org_id?: string | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: never
          occurred_at?: string
          op?: string
          org_id?: string | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      audit_log_202612: {
        Row: {
          actor_id: string | null
          after: Json | null
          before: Json | null
          id: number
          occurred_at: string
          op: string
          org_id: string | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: never
          occurred_at?: string
          op: string
          org_id?: string | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: never
          occurred_at?: string
          op?: string
          org_id?: string | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      audit_log_202701: {
        Row: {
          actor_id: string | null
          after: Json | null
          before: Json | null
          id: number
          occurred_at: string
          op: string
          org_id: string | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: never
          occurred_at?: string
          op: string
          org_id?: string | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: never
          occurred_at?: string
          op?: string
          org_id?: string | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      audit_log_202702: {
        Row: {
          actor_id: string | null
          after: Json | null
          before: Json | null
          id: number
          occurred_at: string
          op: string
          org_id: string | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: never
          occurred_at?: string
          op: string
          org_id?: string | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: never
          occurred_at?: string
          op?: string
          org_id?: string | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      audit_log_202703: {
        Row: {
          actor_id: string | null
          after: Json | null
          before: Json | null
          id: number
          occurred_at: string
          op: string
          org_id: string | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: never
          occurred_at?: string
          op: string
          org_id?: string | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: never
          occurred_at?: string
          op?: string
          org_id?: string | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      audit_log_202704: {
        Row: {
          actor_id: string | null
          after: Json | null
          before: Json | null
          id: number
          occurred_at: string
          op: string
          org_id: string | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: never
          occurred_at?: string
          op: string
          org_id?: string | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: never
          occurred_at?: string
          op?: string
          org_id?: string | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      audit_log_202705: {
        Row: {
          actor_id: string | null
          after: Json | null
          before: Json | null
          id: number
          occurred_at: string
          op: string
          org_id: string | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: never
          occurred_at?: string
          op: string
          org_id?: string | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: never
          occurred_at?: string
          op?: string
          org_id?: string | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      audit_log_202706: {
        Row: {
          actor_id: string | null
          after: Json | null
          before: Json | null
          id: number
          occurred_at: string
          op: string
          org_id: string | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: never
          occurred_at?: string
          op: string
          org_id?: string | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: never
          occurred_at?: string
          op?: string
          org_id?: string | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      audit_log_202707: {
        Row: {
          actor_id: string | null
          after: Json | null
          before: Json | null
          id: number
          occurred_at: string
          op: string
          org_id: string | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: never
          occurred_at?: string
          op: string
          org_id?: string | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: never
          occurred_at?: string
          op?: string
          org_id?: string | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      audit_log_202708: {
        Row: {
          actor_id: string | null
          after: Json | null
          before: Json | null
          id: number
          occurred_at: string
          op: string
          org_id: string | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: never
          occurred_at?: string
          op: string
          org_id?: string | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: never
          occurred_at?: string
          op?: string
          org_id?: string | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      audit_log_default: {
        Row: {
          actor_id: string | null
          after: Json | null
          before: Json | null
          id: number
          occurred_at: string
          op: string
          org_id: string | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: never
          occurred_at?: string
          op: string
          org_id?: string | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: never
          occurred_at?: string
          op?: string
          org_id?: string | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      chase_requests: {
        Row: {
          id: string
          invoice_id: string
          org_id: string
          requested_at: string
          requested_by: string
        }
        Insert: {
          id?: string
          invoice_id: string
          org_id: string
          requested_at?: string
          requested_by: string
        }
        Update: {
          id?: string
          invoice_id?: string
          org_id?: string
          requested_at?: string
          requested_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "chase_requests_invoice_fk"
            columns: ["invoice_id", "org_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "chase_requests_invoice_fk"
            columns: ["invoice_id", "org_id"]
            isOneToOne: false
            referencedRelation: "v_invoice_aging"
            referencedColumns: ["invoice_id", "org_id"]
          },
          {
            foreignKeyName: "chase_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          account_id: string
          always_cc: boolean
          channel_email: boolean
          channel_sms: boolean
          channel_whatsapp: boolean
          created_at: string
          delivery_state: Database["public"]["Enums"]["delivery_state"]
          designation: string | null
          dnc_reason: string | null
          do_not_contact: boolean
          email: string | null
          id: string
          is_active: boolean
          language: string
          last_bounced_at: string | null
          last_contacted_at: string | null
          name: string
          org_id: string
          phone: string | null
          preferred_channel:
            | Database["public"]["Enums"]["contact_channel"]
            | null
          priority: Database["public"]["Enums"]["contact_priority"]
          sort_order: number
          updated_at: string
        }
        Insert: {
          account_id: string
          always_cc?: boolean
          channel_email?: boolean
          channel_sms?: boolean
          channel_whatsapp?: boolean
          created_at?: string
          delivery_state?: Database["public"]["Enums"]["delivery_state"]
          designation?: string | null
          dnc_reason?: string | null
          do_not_contact?: boolean
          email?: string | null
          id?: string
          is_active?: boolean
          language?: string
          last_bounced_at?: string | null
          last_contacted_at?: string | null
          name: string
          org_id: string
          phone?: string | null
          preferred_channel?:
            | Database["public"]["Enums"]["contact_channel"]
            | null
          priority?: Database["public"]["Enums"]["contact_priority"]
          sort_order?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          always_cc?: boolean
          channel_email?: boolean
          channel_sms?: boolean
          channel_whatsapp?: boolean
          created_at?: string
          delivery_state?: Database["public"]["Enums"]["delivery_state"]
          designation?: string | null
          dnc_reason?: string | null
          do_not_contact?: boolean
          email?: string | null
          id?: string
          is_active?: boolean
          language?: string
          last_bounced_at?: string | null
          last_contacted_at?: string | null
          name?: string
          org_id?: string
          phone?: string | null
          preferred_channel?:
            | Database["public"]["Enums"]["contact_channel"]
            | null
          priority?: Database["public"]["Enums"]["contact_priority"]
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_account_fk"
            columns: ["account_id", "org_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "contacts_account_fk"
            columns: ["account_id", "org_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id", "org_id"]
          },
          {
            foreignKeyName: "contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          account_id: string
          amount: number
          created_at: string
          currency: string
          disputed_at: string | null
          due_date: string
          external_ref: string | null
          id: string
          invoice_number: string
          invoice_number_normalized: string | null
          issue_date: string
          last_promise_broken_at: string | null
          org_id: string
          promise_broken_count: number
          promised_at: string | null
          promised_date: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          updated_at: string
        }
        Insert: {
          account_id: string
          amount: number
          created_at?: string
          currency?: string
          disputed_at?: string | null
          due_date: string
          external_ref?: string | null
          id?: string
          invoice_number: string
          invoice_number_normalized?: string | null
          issue_date?: string
          last_promise_broken_at?: string | null
          org_id: string
          promise_broken_count?: number
          promised_at?: string | null
          promised_date?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
        }
        Update: {
          account_id?: string
          amount?: number
          created_at?: string
          currency?: string
          disputed_at?: string | null
          due_date?: string
          external_ref?: string | null
          id?: string
          invoice_number?: string
          invoice_number_normalized?: string | null
          issue_date?: string
          last_promise_broken_at?: string | null
          org_id?: string
          promise_broken_count?: number
          promised_at?: string | null
          promised_date?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_account_fk"
            columns: ["account_id", "org_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "invoices_account_fk"
            columns: ["account_id", "org_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id", "org_id"]
          },
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          org_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          invoice_id: string
          method: string | null
          org_id: string
          paid_on: string
          reference: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency: string
          id?: string
          invoice_id: string
          method?: string | null
          org_id: string
          paid_on?: string
          reference?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          invoice_id?: string
          method?: string | null
          org_id?: string
          paid_on?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_fk"
            columns: ["invoice_id", "org_id", "currency"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "org_id", "currency"]
          },
          {
            foreignKeyName: "payments_invoice_fk"
            columns: ["invoice_id", "org_id", "currency"]
            isOneToOne: false
            referencedRelation: "v_invoice_aging"
            referencedColumns: ["invoice_id", "org_id", "currency"]
          },
          {
            foreignKeyName: "payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      reminder_events: {
        Row: {
          detail: Json | null
          id: string
          invoice_id: string
          kind: string
          occurred_at: string
          org_id: string
          reminder_id: string | null
        }
        Insert: {
          detail?: Json | null
          id?: string
          invoice_id: string
          kind: string
          occurred_at?: string
          org_id: string
          reminder_id?: string | null
        }
        Update: {
          detail?: Json | null
          id?: string
          invoice_id?: string
          kind?: string
          occurred_at?: string
          org_id?: string
          reminder_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reminder_events_invoice_fk"
            columns: ["invoice_id", "org_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "reminder_events_invoice_fk"
            columns: ["invoice_id", "org_id"]
            isOneToOne: false
            referencedRelation: "v_invoice_aging"
            referencedColumns: ["invoice_id", "org_id"]
          },
          {
            foreignKeyName: "reminder_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_events_reminder_id_fkey"
            columns: ["reminder_id"]
            isOneToOne: false
            referencedRelation: "reminders"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_recipients: {
        Row: {
          contact_id: string
          reminder_id: string
        }
        Insert: {
          contact_id: string
          reminder_id: string
        }
        Update: {
          contact_id?: string
          reminder_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_recipients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_recipients_reminder_id_fkey"
            columns: ["reminder_id"]
            isOneToOne: false
            referencedRelation: "reminders"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders: {
        Row: {
          channel: Database["public"]["Enums"]["contact_channel"]
          created_at: string
          id: string
          invoice_id: string
          org_id: string
          scheduled_for: string
          sent_at: string | null
          status: Database["public"]["Enums"]["reminder_status"]
          step: number
          tone: Database["public"]["Enums"]["reminder_tone"]
        }
        Insert: {
          channel: Database["public"]["Enums"]["contact_channel"]
          created_at?: string
          id?: string
          invoice_id: string
          org_id: string
          scheduled_for: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["reminder_status"]
          step: number
          tone: Database["public"]["Enums"]["reminder_tone"]
        }
        Update: {
          channel?: Database["public"]["Enums"]["contact_channel"]
          created_at?: string
          id?: string
          invoice_id?: string
          org_id?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["reminder_status"]
          step?: number
          tone?: Database["public"]["Enums"]["reminder_tone"]
        }
        Relationships: [
          {
            foreignKeyName: "reminders_invoice_fk"
            columns: ["invoice_id", "org_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "reminders_invoice_fk"
            columns: ["invoice_id", "org_id"]
            isOneToOne: false
            referencedRelation: "v_invoice_aging"
            referencedColumns: ["invoice_id", "org_id"]
          },
          {
            foreignKeyName: "reminders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          created_at: string
          email: string
          email_normalized: string | null
          id: string
          source: string | null
        }
        Insert: {
          created_at?: string
          email: string
          email_normalized?: string | null
          id?: string
          source?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          email_normalized?: string | null
          id?: string
          source?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      v_account_balances: {
        Row: {
          account_id: string | null
          account_name: string | null
          currency: string | null
          max_days_overdue: number | null
          org_id: string | null
          outstanding_amount: number | null
          outstanding_count: number | null
          overdue_amount: number | null
          overdue_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      v_invoice_aging: {
        Row: {
          account_id: string | null
          amount: number | null
          amount_paid: number | null
          balance: number | null
          currency: string | null
          days_overdue: number | null
          due_date: string | null
          invoice_id: string | null
          invoice_number: string | null
          is_overdue: boolean | null
          issue_date: string | null
          org_id: string | null
          status: Database["public"]["Enums"]["invoice_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_account_fk"
            columns: ["account_id", "org_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "invoices_account_fk"
            columns: ["account_id", "org_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id", "org_id"]
          },
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      account_archive: {
        Args: { p_account: string; p_confirm_name: string; p_if_match: string }
        Returns: undefined
      }
      account_contact_create: {
        Args: { p_account: string; p_body: Json; p_if_match: string }
        Returns: undefined
      }
      account_contact_delete: {
        Args: { p_account: string; p_contact: string; p_if_match: string }
        Returns: undefined
      }
      account_contact_update: {
        Args: {
          p_account: string
          p_body: Json
          p_contact: string
          p_if_match: string
        }
        Returns: undefined
      }
      account_pause: {
        Args: {
          p_account: string
          p_if_match: string
          p_reason: string
          p_until: string
        }
        Returns: undefined
      }
      account_restore: {
        Args: { p_account: string; p_if_match: string }
        Returns: undefined
      }
      account_resume: {
        Args: { p_account: string; p_if_match: string }
        Returns: undefined
      }
      account_update_chasing_settings: {
        Args: { p_account: string; p_body: Json; p_if_match: string }
        Returns: undefined
      }
      account_update_escalation: {
        Args: {
          p_account: string
          p_if_match: string
          p_p1_after_days: number
          p_p2_after_days: number
        }
        Returns: undefined
      }
      create_org: {
        Args: { p_name: string }
        Returns: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          timezone: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orgs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reconcile_broken_promises: { Args: { p_org: string }; Returns: number }
      schedule_reminder: {
        Args: {
          p_channel: Database["public"]["Enums"]["contact_channel"]
          p_invoice_id: string
          p_scheduled_for?: string
          p_tone: Database["public"]["Enums"]["reminder_tone"]
        }
        Returns: {
          channel: Database["public"]["Enums"]["contact_channel"]
          created_at: string
          id: string
          invoice_id: string
          org_id: string
          scheduled_for: string
          sent_at: string | null
          status: Database["public"]["Enums"]["reminder_status"]
          step: number
          tone: Database["public"]["Enums"]["reminder_tone"]
        }
        SetofOptions: {
          from: "*"
          to: "reminders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      contact_channel: "email" | "whatsapp" | "sms"
      contact_priority: "P0" | "P1" | "P2"
      delivery_state: "verified" | "unverified" | "bounced"
      invoice_status:
        | "draft"
        | "open"
        | "partially_paid"
        | "paid"
        | "void"
        | "written_off"
      org_role: "owner" | "admin" | "member"
      reminder_status: "scheduled" | "sent" | "failed" | "cancelled"
      reminder_tone: "gentle" | "standard" | "firm"
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
      contact_channel: ["email", "whatsapp", "sms"],
      contact_priority: ["P0", "P1", "P2"],
      delivery_state: ["verified", "unverified", "bounced"],
      invoice_status: [
        "draft",
        "open",
        "partially_paid",
        "paid",
        "void",
        "written_off",
      ],
      org_role: ["owner", "admin", "member"],
      reminder_status: ["scheduled", "sent", "failed", "cancelled"],
      reminder_tone: ["gentle", "standard", "firm"],
    },
  },
} as const
