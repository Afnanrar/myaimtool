import { NextRequest, NextResponse } from 'next/server'
import { FacebookAPI } from '@/lib/facebook'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyAuth } from '@/lib/auth'

export async function POST(req: NextRequest) {
  // Check if required environment variables are set
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Service not configured' }, { status: 500 })
  }
  
  const auth = await verifyAuth(req)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  const { conversationId, message } = await req.json()
  
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
    }
    
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
    
    // Send message via Facebook API
    const fb = new FacebookAPI(conversation.pages.access_token)
    const result = await fb.sendMessage(
      conversation.participant_id,
      message,
      conversation.pages.access_token
    )
    
    // Store message in database
    await supabaseAdmin
      .from('messages')
      .insert({
        conversation_id: conversationId,
        facebook_message_id: result.message_id || `msg_${Date.now()}`,
        sender_id: conversation.pages.facebook_page_id,
        message_text: message,
        is_from_page: true
      })
    
    return NextResponse.json({ success: true, result })
  } catch (error) {
    console.error('Failed to send message:', error)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}
