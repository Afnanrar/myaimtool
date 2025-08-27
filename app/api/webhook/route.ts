import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import crypto from 'crypto'

// Webhook verification
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')
  
  if (mode === 'subscribe' && token === process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { 
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    })
  }
  
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// Handle incoming webhooks
export async function POST(req: NextRequest) {
  const signature = req.headers.get('x-hub-signature-256')
  const body = await req.text()
  
  // Verify signature
  const expectedSignature = crypto
    .createHmac('sha256', process.env.FACEBOOK_APP_SECRET!)
    .update(body)
    .digest('hex')
  
  if (signature !== `sha256=${expectedSignature}`) {
    console.error('Invalid webhook signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }
  
  const data = JSON.parse(body)
  console.log('Webhook received:', JSON.stringify(data, null, 2))
  
  if (data.object === 'page') {
    for (const entry of data.entry) {
      const pageId = entry.id
      
      if (entry.messaging) {
        for (const event of entry.messaging) {
          await processMessagingEvent(pageId, event)
        }
      }
    }
  }
  
  // Always return 200 immediately
  return NextResponse.json({ received: true }, { status: 200 })
}

async function processMessagingEvent(facebookPageId: string, event: any) {
  try {
    if (!supabaseAdmin) {
      console.error('Supabase admin not configured')
      return
    }
    
    // Get the page from database
    const { data: page } = await supabaseAdmin
      .from('pages')
      .select('id')
      .eq('facebook_page_id', facebookPageId)
      .single()
    
    if (!page) {
      console.error('Page not found:', facebookPageId)
      return
    }
    
    // Handle message echo (messages sent by the page)
    if (event.message && event.message.is_echo) {
      console.log('Processing echo message')
      
      // Find the conversation
      const { data: conversation } = await supabaseAdmin
        .from('conversations')
        .select('id')
        .eq('page_id', page.id)
        .eq('participant_id', event.recipient.id)
        .single()
      
      if (conversation) {
        // Save the echo message
        await supabaseAdmin
          .from('messages')
          .upsert({
            conversation_id: conversation.id,
            facebook_message_id: event.message.mid,
            sender_id: facebookPageId,
            message_text: event.message.text,
            is_from_page: true,
            created_at: new Date(event.timestamp).toISOString()
          }, {
            onConflict: 'facebook_message_id',
            ignoreDuplicates: true
          })
        
        console.log('Echo message saved')
      }
    }
    
    // Handle incoming message from user
    else if (event.message && !event.message.is_echo) {
      console.log('Processing user message')
      
      // Find or create conversation
      const { data: conversation } = await supabaseAdmin
        .from('conversations')
        .upsert({
          page_id: page.id,
          facebook_conversation_id: `${event.sender.id}_${facebookPageId}`,
          participant_id: event.sender.id,
          participant_name: 'Facebook User',
          last_message_time: new Date().toISOString(),
          unread_count: 1
        }, {
          onConflict: 'page_id,facebook_conversation_id'
        })
        .select()
        .single()
      
      if (conversation) {
        // Save the message
        await supabaseAdmin
          .from('messages')
          .upsert({
            conversation_id: conversation.id,
            facebook_message_id: event.message.mid,
            sender_id: event.sender.id,
            message_text: event.message.text,
            attachments: event.message.attachments || null,
            is_from_page: false,
            created_at: new Date(event.timestamp).toISOString()
          }, {
            onConflict: 'facebook_message_id',
            ignoreDuplicates: true
          })
        
        console.log('User message saved')
      }
    }
    
    // Handle delivery confirmation
    else if (event.delivery) {
      console.log('Message delivered:', event.delivery.mids)
    }
    
    // Handle read confirmation
    else if (event.read) {
      console.log('Message read at:', new Date(event.read.watermark))
    }
    
  } catch (error) {
    console.error('Error processing webhook:', error)
  }
}
