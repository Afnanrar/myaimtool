import { NextRequest, NextResponse } from 'next/server'
import { FacebookAPI } from '@/lib/facebook'
import { supabaseAdmin } from '@/lib/supabase'

// Webhook verification
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')
  
  if (mode === 'subscribe' && token === process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 })
  }
  
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// Webhook events
export async function POST(req: NextRequest) {
  const signature = req.headers.get('x-hub-signature-256')
  const body = await req.text()
  
  // Verify signature
  if (!FacebookAPI.verifyWebhookSignature(body, signature!)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }
  
  const data = JSON.parse(body)
  
  // Process messaging events
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
  
  return NextResponse.json({ received: true })
}

async function processMessagingEvent(pageId: string, event: any) {
  // Find page in database
  const { data: page } = await supabaseAdmin
    .from('pages')
    .select('id')
    .eq('facebook_page_id', pageId)
    .single()
  
  if (!page) return
  
  // Handle new message
  if (event.message && !event.message.is_echo) {
    // Find or create conversation
    const { data: conversation } = await supabaseAdmin
      .from('conversations')
      .upsert({
        page_id: page.id,
        facebook_conversation_id: `${event.sender.id}_${pageId}`,
        participant_id: event.sender.id,
        last_message_time: new Date().toISOString(),
        unread_count: 1
      })
      .select()
      .single()
    
    // Store message
    await supabaseAdmin
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        facebook_message_id: event.message.mid,
        sender_id: event.sender.id,
        message_text: event.message.text,
        attachments: event.message.attachments,
        is_from_page: false
      })
    
    // You can emit real-time updates here using Supabase Realtime or WebSockets
  }
}
