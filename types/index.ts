export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          facebook_id: string
          name: string
          email: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          facebook_id: string
          name: string
          email: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          facebook_id?: string
          name?: string
          email?: string
          created_at?: string
          updated_at?: string
        }
      }
      pages: {
        Row: {
          id: string
          user_id: string
          facebook_page_id: string
          name: string
          access_token: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          facebook_page_id: string
          name: string
          access_token: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          facebook_page_id?: string
          name?: string
          access_token?: string
          created_at?: string
          updated_at?: string
        }
      }
      conversations: {
        Row: {
          id: string
          page_id: string
          facebook_conversation_id: string
          participant_id: string
          participant_name: string
          last_message_time: string
          unread_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          page_id: string
          facebook_conversation_id: string
          participant_id: string
          participant_name: string
          last_message_time: string
          unread_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          page_id?: string
          facebook_conversation_id?: string
          participant_id?: string
          participant_name?: string
          last_message_time?: string
          unread_count?: number
          created_at?: string
          updated_at?: string
        }
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          facebook_message_id: string
          sender_id: string
          message_text: string
          attachments: any
          is_from_page: boolean
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          facebook_message_id: string
          sender_id: string
          message_text: string
          attachments?: any
          is_from_page: boolean
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          facebook_message_id?: string
          sender_id?: string
          message_text?: string
          attachments?: any
          is_from_page?: boolean
          created_at?: string
        }
      }
      broadcasts: {
        Row: {
          id: string
          page_id: string
          message_text: string
          recipient_count: number
          sent_count: number
          failed_count: number
          status: 'sending' | 'completed' | 'failed'
          created_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          page_id: string
          message_text: string
          recipient_count: number
          sent_count?: number
          failed_count?: number
          status?: 'sending' | 'completed' | 'failed'
          created_at?: string
          completed_at?: string | null
        }
        Update: {
          id?: string
          page_id?: string
          message_text?: string
          recipient_count?: number
          sent_count?: number
          failed_count?: number
          status?: 'sending' | 'completed' | 'failed'
          created_at?: string
          completed_at?: string | null
        }
      }
      broadcast_recipients: {
        Row: {
          id: string
          broadcast_id: string
          recipient_id: string
          status: 'sent' | 'failed'
          sent_at: string | null
          error_message: string | null
        }
        Insert: {
          id?: string
          broadcast_id: string
          recipient_id: string
          status: 'sent' | 'failed'
          sent_at?: string | null
          error_message?: string | null
        }
        Update: {
          id?: string
          broadcast_id?: string
          recipient_id?: string
          status?: 'sent' | 'failed'
          sent_at?: string | null
          error_message?: string | null
        }
      }
    }
  }
}

export interface FacebookPage {
  id: string
  name: string
  access_token: string
  tasks: string[]
}

export interface FacebookConversation {
  id: string
  participants: {
    data: Array<{
      id: string
      name: string
    }>
  }
  updated_time: string
  messages: {
    data: Array<{
      id: string
      message: string
      from: {
        id: string
        name: string
      }
      created_time: string
    }>
  }
}

export interface FacebookMessage {
  id: string
  message: string
  from: {
    id: string
    name: string
  }
  created_time: string
  attachments?: any
}

export interface AuthUser {
  userId: string
  facebookId: string
  accessToken: string
}
