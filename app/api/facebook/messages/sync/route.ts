import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const conversationId = searchParams.get('conversationId')
  const pageId = searchParams.get('pageId')
  
  if (!conversationId || !pageId) {
    return NextResponse.json({ error: 'Conversation ID and Page ID are required' }, { status: 400 })
  }
  
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }
  
  try {
    // Get conversation and page details
    const { data: conversation } = await supabaseAdmin
      .from('conversations')
      .select(`
        *,
        pages!inner(
          access_token,
          facebook_page_id
        )
      `)
      .eq('id', conversationId)
      .single()
    
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }
    
    // Fetch latest messages from Facebook
    const messagesUrl = `https://graph.facebook.com/v19.0/${conversation.facebook_conversation_id}/messages?fields=id,message,from,created_time&limit=50&access_token=${conversation.pages.access_token}`
    
    const response = await fetch(messagesUrl)
    const data = await response.json()
    
    if (data.error) {
      console.error('Facebook API Error:', data.error)
      return NextResponse.json({ 
        error: `Facebook API: ${data.error.message}`,
        messages: []
      })
    }
    
    // Get existing messages from database to compare
    const { data: existingMessages } = await supabaseAdmin
      .from('messages')
      .select('facebook_message_id')
      .eq('conversation_id', conversationId)
    
    const existingMessageIds = new Set(existingMessages?.map(m => m.facebook_message_id) || [])
    
    // Process and save new messages
    const newMessages = []
    
    if (data.data && data.data.length > 0) {
      // Use Promise.all for parallel processing
      const savePromises = data.data.map(async (msg: any) => {
        // Skip if message already exists
        if (existingMessageIds.has(msg.id)) {
          return null
        }
        
        // Save new message to database
        const { data: savedMsg } = await supabaseAdmin!
          .from('messages')
          .insert({
            conversation_id: conversationId,
            facebook_message_id: msg.id,
            sender_id: msg.from.id,
            message_text: msg.message || '[Media or attachment]',
            is_from_page: msg.from.id === conversation.pages.facebook_page_id,
            created_at: msg.created_time
          })
          .select()
          .single()
        
        return savedMsg
      })
      
      const results = await Promise.all(savePromises)
      newMessages.push(...results.filter(Boolean))
    }
    
    // Update conversation last message time if new messages were found
    if (newMessages.length > 0) {
      await supabaseAdmin
        .from('conversations')
        .update({ last_message_time: new Date().toISOString() })
        .eq('id', conversationId)
    }
    
    return NextResponse.json({ 
      success: true,
      newMessages,
      totalNew: newMessages.length,
      conversationId: conversation.id,
      source: 'facebook_sync'
    })
    
  } catch (error) {
    console.error('Error syncing messages:', error)
    return NextResponse.json({ 
      error: 'Failed to sync messages: ' + (error instanceof Error ? error.message : 'Unknown error'),
      messages: []
    }, { status: 500 })
  }
}
