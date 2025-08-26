import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const signature = req.headers.get('x-hub-signature-256')
    
    // Verify webhook signature
    if (signature) {
      const expectedSignature = 'sha256=' + crypto
        .createHmac('sha256', process.env.FACEBOOK_APP_SECRET || '')
        .update(body)
        .digest('hex')
      
      if (signature !== expectedSignature) {
        console.error('Webhook signature verification failed')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }
    
    const data = JSON.parse(body)
    console.log('Webhook received:', data)
    
    // Handle different webhook events
    if (data.object === 'page') {
      for (const entry of data.entry) {
        for (const event of entry.messaging) {
          await handleMessageEvent(event, entry.id)
        }
      }
    }
    
    return NextResponse.json({ status: 'ok' })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

async function handleMessageEvent(event: any, pageId: string) {
  try {
    console.log('Processing message event:', event)
    
    // Get or create conversation
    const { data: conversation, error: convError } = await supabaseAdmin!
      .from('conversations')
      .select('*')
      .eq('facebook_conversation_id', event.sender.id)
      .eq('page_id', pageId)
      .single()
    
    if (convError || !conversation) {
      console.log('Creating new conversation for sender:', event.sender.id)
      
      // Create new conversation
      const { data: newConversation, error: createError } = await supabaseAdmin!
        .from('conversations')
        .insert({
          facebook_conversation_id: event.sender.id,
          participant_id: event.sender.id,
          participant_name: event.sender.name || 'Unknown User',
          page_id: pageId,
          last_message_time: new Date().toISOString(),
          unread_count: 1
        })
        .select()
        .single()
      
      if (createError) {
        console.error('Error creating conversation:', createError)
        return
      }
      
      // Trigger real-time update for new conversation
      await triggerRealtimeUpdate('conversations', 'INSERT', newConversation)
    } else {
      // Update existing conversation
      const { error: updateError } = await supabaseAdmin!
        .from('conversations')
        .update({
          last_message_time: new Date().toISOString(),
          unread_count: (conversation.unread_count || 0) + 1
        })
        .eq('id', conversation.id)
      
      if (updateError) {
        console.error('Error updating conversation:', updateError)
        return
      }
      
      // Trigger real-time update for conversation update
      await triggerRealtimeUpdate('conversations', 'UPDATE', { ...conversation, unread_count: (conversation.unread_count || 0) + 1 })
    }
    
          // Save message to database
      if (event.message && event.message.text) {
        const { data: savedMessage, error: msgError } = await supabaseAdmin!
          .from('messages')
          .insert({
            conversation_id: conversation?.id || (await getConversationId(event.sender.id, pageId)),
            facebook_message_id: event.message.mid,
            sender_id: event.sender.id,
            message_text: event.message.text,
            is_from_page: false,
            created_at: new Date().toISOString(), // Database creation time
            event_time: new Date(parseInt(event.timestamp)).toISOString() // Facebook event timestamp (UTC)
          })
          .select()
          .single()
        
        if (msgError) {
          console.error('Error saving message:', msgError)
          return
        }
        
        // Trigger real-time update for new message
        await triggerRealtimeUpdate('messages', 'INSERT', savedMessage)
        
        console.log('Message saved and real-time update triggered:', savedMessage)
      }
    
  } catch (error) {
    console.error('Error handling message event:', error)
  }
}

async function getConversationId(senderId: string, pageId: string): Promise<string> {
  const { data: conversation } = await supabaseAdmin!
    .from('conversations')
    .select('id')
    .eq('facebook_conversation_id', senderId)
    .eq('page_id', pageId)
    .single()
  
  return conversation?.id || ''
}

async function triggerRealtimeUpdate(table: string, event: string, data: any) {
  try {
    // Use Supabase real-time to broadcast the update
    const { error } = await supabaseAdmin!
      .from(table)
      .insert({
        // This is a special record to trigger real-time updates
        _realtime_event: event,
        _realtime_data: data,
        _realtime_timestamp: new Date().toISOString()
      })
    
    if (error) {
      console.error('Error triggering real-time update:', error)
    }
  } catch (error) {
    console.error('Error in triggerRealtimeUpdate:', error)
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')
  
  if (mode === 'subscribe' && token === process.env.FACEBOOK_VERIFY_TOKEN) {
    console.log('Webhook verified successfully')
    return new Response(challenge, { status: 200 })
  }
  
  return NextResponse.json({ error: 'Invalid verification token' }, { status: 403 })
}
