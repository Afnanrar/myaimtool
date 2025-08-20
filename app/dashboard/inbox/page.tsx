'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import ConversationList from '@/components/dashboard/ConversationList'
import MessageThread from '@/components/dashboard/MessageThread'
import PageSelector from '@/components/dashboard/PageSelector'

interface Page {
  id: string
  name: string
  access_token: string
}

interface Conversation {
  id: string
  participant_name: string
  last_message_time: string
  unread_count: number
  messages: { count: number }
}

export default function InboxPage() {
  const [selectedPage, setSelectedPage] = useState<Page | null>(null)
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(false)
  
  useEffect(() => {
    if (selectedPage) {
      loadConversations()
    }
  }, [selectedPage])
  
  const loadConversations = async () => {
    if (!selectedPage) return
    
    setLoading(true)
    try {
      const response = await fetch(`/api/facebook/conversations?pageId=${selectedPage.id}`)
      const data = await response.json()
      
      // Also load from database
      const { data: dbConversations } = await supabase
        .from('conversations')
        .select(`
          *,
          messages(count)
        `)
        .eq('page_id', selectedPage.id)
        .order('last_message_time', { ascending: false })
      
      setConversations(dbConversations || [])
    } catch (error) {
      console.error('Failed to load conversations:', error)
    } finally {
      setLoading(false)
    }
  }
  
  const markAsRead = async (conversationId: string) => {
    await supabase
      .from('conversations')
      .update({ unread_count: 0 })
      .eq('id', conversationId)
  }
  
  return (
    <div className="flex h-full">
      {/* Sidebar with conversations */}
      <div className="w-80 border-r bg-white">
        <div className="p-4 border-b">
          <PageSelector
            onPageSelect={setSelectedPage}
            selectedPage={selectedPage}
          />
        </div>
        
        {selectedPage ? (
          <ConversationList
            conversations={conversations}
            selectedConversation={selectedConversation}
            onConversationSelect={(conv) => {
              setSelectedConversation(conv)
              markAsRead(conv.id)
            }}
            loading={loading}
          />
        ) : (
          <div className="p-8 text-center text-gray-500">
            Select a page to view conversations
          </div>
        )}
      </div>
      
      {/* Message thread */}
      <div className="flex-1 bg-white">
        {selectedConversation ? (
          <MessageThread
            conversationId={selectedConversation.id}
            pageAccessToken={selectedPage?.access_token}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            Select a conversation to start messaging
          </div>
        )}
      </div>
    </div>
  )
}
