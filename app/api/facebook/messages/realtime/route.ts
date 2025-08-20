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
    // Get latest messages for the conversation
    const { data: messages } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
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
    // Save the new message
    const { data: savedMessage } = await supabaseAdmin
      .from('messages')
      .insert({
        conversation_id: conversationId,
        facebook_message_id: `msg_${Date.now()}`,
        sender_id: pageId,
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
      message: savedMessage 
    })
    
  } catch (error) {
    console.error('Error saving message:', error)
    return NextResponse.json({ 
      error: 'Failed to save message' 
    }, { status: 500 })
  }
}
