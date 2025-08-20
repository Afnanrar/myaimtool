import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    console.log('Facebook webhook received:', JSON.stringify(body, null, 2))

    // Handle different types of webhook events
    if (body.object === 'page') {
      for (const entry of body.entry) {
        const pageId = entry.id
        const time = entry.time

        for (const event of entry.messaging || []) {
          await handleMessagingEvent(event, pageId)
        }

        for (const event of entry.deliveries || []) {
          await handleDeliveryEvent(event, pageId)
        }
      }
    }

    return NextResponse.json({ status: 'ok' })
  } catch (error) {
    console.error('Error processing Facebook webhook:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  // Facebook webhook verification
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN) {
    console.log('Facebook webhook verified successfully')
    return new Response(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

async function handleMessagingEvent(event: any, pageId: string) {
  try {
    const { sender, recipient, message, timestamp } = event

    if (!message || !message.text) {
      console.log('Skipping non-text message:', event)
      return
    }

    console.log('Processing message event:', {
      senderId: sender.id,
      recipientId: recipient.id,
      messageText: message.text,
      timestamp
    })

    // Find or create conversation
    const conversation = await findOrCreateConversation(sender.id, pageId)
    if (!conversation) {
      console.error('Failed to find or create conversation')
      return
    }

    // Save message to database
    if (!supabaseAdmin) {
      console.error('Supabase admin not available')
      return
    }

    const { data: savedMessage, error: saveError } = await supabaseAdmin
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        facebook_message_id: `webhook_${Date.now()}_${Math.random()}`,
        sender_id: sender.id,
        message_text: message.text,
        is_from_page: false, // This is from customer
        is_read: false, // Mark as unread
        created_at: new Date(timestamp * 1000).toISOString()
      })
      .select()
      .single()

    if (saveError) {
      console.error('Error saving message:', saveError)
      return
    }

    // Update conversation last message time
    await supabaseAdmin
      .from('conversations')
      .update({
        last_message_time: new Date(timestamp * 1000).toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', conversation.id)

    console.log('Message saved successfully:', savedMessage)

  } catch (error) {
    console.error('Error handling messaging event:', error)
  }
}

async function handleDeliveryEvent(event: any, pageId: string) {
  try {
    const { sender, recipient, delivery } = event

    // Mark messages as delivered
    if (delivery && delivery.mids && supabaseAdmin) {
      for (const mid of delivery.mids) {
        await supabaseAdmin
          .from('messages')
          .update({
            delivered_at: new Date().toISOString()
          })
          .eq('facebook_message_id', mid)
      }
    }
  } catch (error) {
    console.error('Error handling delivery event:', error)
  }
}

async function findOrCreateConversation(senderId: string, pageId: string) {
  try {
    // First try to find existing conversation
    if (!supabaseAdmin) {
      console.error('Supabase admin not available')
      return null
    }

    const { data: existingConv } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('participant_id', senderId)
      .eq('page_id', pageId)
      .single()

    if (existingConv) {
      return existingConv
    }

    // Create new conversation if none exists
    const { data: newConv, error: createError } = await supabaseAdmin
      .from('conversations')
      .insert({
        facebook_conversation_id: `conv_${senderId}_${pageId}`,
        participant_id: senderId,
        page_id: pageId,
        participant_name: `User ${senderId.slice(-4)}`, // Generate a name
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (createError) {
      console.error('Error creating conversation:', createError)
      return null
    }

    return newConv
  } catch (error) {
    console.error('Error finding/creating conversation:', error)
    return null
  }
}
