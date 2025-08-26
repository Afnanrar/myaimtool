import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { FacebookAPI } from '@/lib/facebook'

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
    // Get latest messages for the conversation
    const { data: messages } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(100)
    
    // Get conversation details
    const { data: conversation } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single()
    
    return NextResponse.json({ 
      messages: messages || [],
      conversation,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('Error in realtime messages API:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch messages',
      messages: []
    }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { conversationId, message, pageId } = await req.json()
  
  if (!conversationId || !message || !pageId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }
  
  try {
    // First, get the conversation and page details to send via Facebook
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
    
    // Send message via Facebook API
    const fb = new FacebookAPI(conversation.pages.access_token)
    const result = await fb.sendMessage(
      conversation.participant_id,
      message,
      conversation.pages.access_token
    )
    
    if (!result || !result.message_id) {
      throw new Error('Failed to send message via Facebook API')
    }
    
    // Save the sent message to database
    const { data: savedMessage } = await supabaseAdmin
      .from('messages')
      .insert({
        conversation_id: conversationId,
        facebook_message_id: result.message_id,
        sender_id: conversation.pages.facebook_page_id,
        message_text: message,
        is_from_page: true,
        created_at: new Date().toISOString()
      })
      .select()
      .single()
    
    // Update conversation last message time
    await supabaseAdmin
      .from('conversations')
      .update({ last_message_time: new Date().toISOString() })
      .eq('id', conversationId)
    
    return NextResponse.json({ 
      success: true, 
      message: savedMessage,
      facebookMessageId: result.message_id
    })
    
  } catch (error) {
    console.error('Error sending message:', error)
    return NextResponse.json({ 
      error: 'Failed to send message: ' + (error instanceof Error ? error.message : 'Unknown error')
    }, { status: 500 })
  }
}
