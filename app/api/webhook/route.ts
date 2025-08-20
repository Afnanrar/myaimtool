import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// Facebook webhook verification token (you'll set this in Facebook App settings)
const VERIFY_TOKEN = process.env.FACEBOOK_VERIFY_TOKEN || 'your_webhook_verify_token'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  // Facebook webhook verification
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified successfully')
    return new NextResponse(challenge, { status: 200 })
  }

  return new NextResponse('Forbidden', { status: 403 })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    console.log('Webhook received:', JSON.stringify(body, null, 2))

    // Handle different types of webhook events
    if (body.object === 'page') {
      for (const entry of body.entry) {
        const pageId = entry.id
        
        // Handle messaging events
        if (entry.messaging) {
          for (const messagingEvent of entry.messaging) {
            await handleMessagingEvent(messagingEvent, pageId)
          }
        }
        
        // Handle message delivery events
        if (entry.messaging_deliveries) {
          for (const deliveryEvent of entry.messaging_deliveries) {
            await handleDeliveryEvent(deliveryEvent, pageId)
          }
        }
        
        // Handle message read events
        if (entry.messaging_reads) {
          for (const readEvent of entry.messaging_reads) {
            await handleReadEvent(readEvent, pageId)
          }
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

async function handleMessagingEvent(event: any, pageId: string) {
  try {
    const { sender, recipient, message, timestamp } = event
    
    if (!message || !message.text) {
      console.log('Skipping non-text message:', event)
      return
    }

    console.log(`Processing message from ${sender.id} to page ${pageId}:`, message.text)

    // Get page details from database
    const { data: page } = await supabaseAdmin!
      .from('pages')
      .select('*')
      .eq('facebook_page_id', pageId)
      .single()

    if (!page) {
      console.log(`Page ${pageId} not found in database`)
      return
    }

    // Check if conversation exists
    const { data: existingConversation } = await supabaseAdmin!
      .from('conversations')
      .select('*')
      .eq('facebook_conversation_id', `${sender.id}_${pageId}`)
      .eq('page_id', page.id)
      .single()

    let conversationId: string

    if (existingConversation) {
      conversationId = existingConversation.id
      
      // Update conversation last message time
      await supabaseAdmin!
        .from('conversations')
        .update({ 
          last_message_time: new Date(timestamp).toISOString(),
          unread_count: (existingConversation.unread_count || 0) + 1
        })
        .eq('id', conversationId)
    } else {
      // Create new conversation
      const { data: newConversation } = await supabaseAdmin!
        .from('conversations')
        .insert({
          page_id: page.id,
          facebook_conversation_id: `${sender.id}_${pageId}`,
          participant_id: sender.id,
          participant_name: 'Facebook User', // Will be updated when we get user info
          last_message_time: new Date(timestamp).toISOString(),
          unread_count: 1
        })
        .select()
        .single()

      if (newConversation) {
        conversationId = newConversation.id
      } else {
        console.error('Failed to create conversation')
        return
      }
    }

    // Save the incoming message
    const { data: savedMessage } = await supabaseAdmin!
      .from('messages')
      .insert({
        conversation_id: conversationId,
        facebook_message_id: message.mid || `msg_${Date.now()}`,
        sender_id: sender.id,
        message_text: message.text,
        is_from_page: false,
        created_at: new Date(timestamp).toISOString()
      })
      .select()
      .single()

    if (savedMessage) {
      console.log(`Message saved successfully: ${savedMessage.id}`)
      
      // Try to get user info from Facebook
      try {
        const userInfoUrl = `https://graph.facebook.com/v19.0/${sender.id}?fields=name,email&access_token=${page.access_token}`
        const userResponse = await fetch(userInfoUrl)
        const userData = await userResponse.json()
        
        if (userData.name && !existingConversation) {
          // Update conversation with user name
          await supabaseAdmin!
            .from('conversations')
            .update({ participant_name: userData.name })
            .eq('id', conversationId)
        }
      } catch (error) {
        console.log('Could not fetch user info:', error)
      }
    }

  } catch (error) {
    console.error('Error handling messaging event:', error)
  }
}

async function handleDeliveryEvent(event: any, pageId: string) {
  try {
    const { sender, recipient, delivery } = event
    
    if (delivery.mids) {
      console.log(`Message delivery confirmed for page ${pageId}:`, delivery.mids)
      
      // Update message delivery status in database
      for (const messageId of delivery.mids) {
        await supabaseAdmin!
          .from('messages')
          .update({ 
            delivered_at: new Date().toISOString(),
            delivery_status: 'delivered'
          })
          .eq('facebook_message_id', messageId)
      }
    }
  } catch (error) {
    console.error('Error handling delivery event:', error)
  }
}

async function handleReadEvent(event: any, pageId: string) {
  try {
    const { sender, recipient, read } = event
    
    if (read.watermark) {
      console.log(`Message read confirmed for page ${pageId} at ${read.watermark}`)
      
      // Update conversation read status
      const { data: conversation } = await supabaseAdmin!
        .from('conversations')
        .select('*')
        .eq('facebook_conversation_id', `${sender.id}_${pageId}`)
        .eq('page_id', pageId)
        .single()

      if (conversation) {
        await supabaseAdmin!
          .from('conversations')
          .update({ 
            unread_count: 0,
            last_read_time: new Date(read.watermark * 1000).toISOString()
          })
          .eq('id', conversation.id)
      }
    }
  } catch (error) {
    console.error('Error handling read event:', error)
  }
}
