import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { conversationId, pageId } = await req.json()

    if (!conversationId || !pageId) {
      return NextResponse.json({ 
        error: 'Missing required fields: conversationId, pageId' 
      }, { status: 400 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
    }

    // Get conversation and page details
    const { data: conversation } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single()

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const { data: page } = await supabaseAdmin
      .from('pages')
      .select('*')
      .eq('id', pageId)
      .single()

    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 })
    }

    console.log('Syncing messages for conversation:', conversation.id, 'Page:', page.name)

    // Fetch messages from Facebook Graph API
    const messagesUrl = `https://graph.facebook.com/v19.0/${conversation.facebook_conversation_id}/messages?fields=id,message,from,created_time&access_token=${page.access_token}`

    const response = await fetch(messagesUrl)
    const data = await response.json()

    if (data.error) {
      console.error('Facebook API Error:', data.error)
      return NextResponse.json({
        error: `Facebook API: ${data.error.message}`,
        details: data.error
      }, { status: 400 })
    }

    // Process and save messages
    const newMessages = []
    const existingMessageIds = new Set()

    if (data.data && data.data.length > 0) {
      // Get existing message IDs to avoid duplicates
      const { data: existingMessages } = await supabaseAdmin
        .from('messages')
        .select('facebook_message_id')
        .eq('conversation_id', conversationId)

      existingMessageIds = new Set(existingMessages?.map(m => m.facebook_message_id) || [])

      for (const msg of data.data) {
        // Skip if message already exists
        if (existingMessageIds.has(msg.id)) {
          continue
        }

        // Determine if message is from page or customer
        const isFromPage = msg.from.id === page.facebook_page_id

        // Save message to database
        const { data: savedMsg, error: saveError } = await supabaseAdmin
          .from('messages')
          .insert({
            conversation_id: conversationId,
            facebook_message_id: msg.id,
            sender_id: msg.from.id,
            message_text: msg.message || '[Media or attachment]',
            is_from_page: isFromPage,
            is_read: isFromPage, // Page messages are considered "read"
            created_at: msg.created_time
          })
          .select()
          .single()

        if (savedMsg && !saveError) {
          newMessages.push(savedMsg)
        }
      }
    }

    // Update conversation last message time if new messages were added
    if (newMessages.length > 0) {
      const lastMessage = newMessages[newMessages.length - 1]
      await supabaseAdmin
        .from('conversations')
        .update({
          last_message_time: lastMessage.created_at,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId)
    }

    return NextResponse.json({
      success: true,
      newMessages: newMessages.length,
      totalMessages: data.data?.length || 0,
      conversationId: conversation.id
    })

  } catch (error) {
    console.error('Error in sync messages API:', error)
    return NextResponse.json({
      error: 'Failed to sync messages',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
