import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import crypto from 'crypto'

// Webhook verification (for Facebook to verify your endpoint)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')
  
  console.log('Webhook Verification Request:', { mode, token, challenge })
  
  // Check if this is a subscription verification request
  if (mode === 'subscribe' && token === process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN) {
    console.log('Webhook verified successfully!')
    // Return the challenge to verify the webhook
    return new NextResponse(challenge, { 
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    })
  } else {
    console.error('Webhook verification failed')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
}

// Handle incoming messages
export async function POST(req: NextRequest) {
  const signature = req.headers.get('x-hub-signature-256')
  const body = await req.text()
  
  // Verify the request came from Facebook
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
  
  // Process the webhook data
  if (data.object === 'page') {
    for (const entry of data.entry) {
      const pageId = entry.id
      const timeOfEvent = entry.time
      
      // Handle messages
      if (entry.messaging) {
        for (const event of entry.messaging) {
          await processMessagingEvent(pageId, event)
        }
      }
    }
  }
  
  // Always return 200 OK to Facebook
  return NextResponse.json({ received: true }, { status: 200 })
}

async function processMessagingEvent(facebookPageId: string, event: any) {
  try {
    // Find the page in database
    const { data: page } = await supabaseAdmin!
      .from('pages')
      .select('id')
      .eq('facebook_page_id', facebookPageId)
      .single()
    
    if (!page) {
      console.error('Page not found:', facebookPageId)
      return
    }
    
    // Handle different event types
    if (event.message && !event.message.is_echo) {
      // Incoming message from user
      console.log('New message from user:', event.sender.id)
      
      // Find or create conversation
      const { data: conversation } = await supabaseAdmin!
        .from('conversations')
        .upsert({
          page_id: page.id,
          facebook_conversation_id: `${event.sender.id}_${facebookPageId}`,
          participant_id: event.sender.id,
          participant_name: event.sender.name || 'Facebook User',
          last_message_time: new Date().toISOString(),
          unread_count: 1
        }, {
          onConflict: 'page_id,facebook_conversation_id'
        })
        .select()
        .single()
      
      if (conversation) {
        // Store the message
        await supabaseAdmin!
          .from('messages')
          .insert({
            conversation_id: conversation.id,
            facebook_message_id: event.message.mid,
            sender_id: event.sender.id,
            message_text: event.message.text,
            attachments: event.message.attachments || null,
            is_from_page: false,
            created_at: new Date(event.timestamp || Date.now()).toISOString()
          })
        
        console.log('Message saved to database')
      }
    } else if (event.message && event.message.is_echo) {
      // Echo of message sent by page
      console.log('Echo message (sent by page)')
    } else if (event.delivery) {
      // Message delivery confirmation
      console.log('Message delivered')
    } else if (event.read) {
      // Message read confirmation
      console.log('Message read')
    }
  } catch (error) {
    console.error('Error processing webhook event:', error)
  }
}
