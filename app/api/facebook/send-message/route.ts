import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { conversationId, messageText, pageId } = await req.json()
    
    if (!conversationId || !messageText || !pageId) {
      return NextResponse.json({ 
        error: 'Missing required fields: conversationId, messageText, pageId' 
      }, { status: 400 })
    }
    
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
    }
    
    // Get conversation details
    const { data: conversation, error: convError } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single()
    
    if (convError || !conversation) {
      return NextResponse.json({ 
        error: 'Conversation not found',
        conversationId: conversationId 
      }, { status: 404 })
    }
    
    // Get page details
    const { data: page, error: pageError } = await supabaseAdmin
      .from('pages')
      .select('*')
      .eq('id', pageId)
      .single()
    
    if (pageError || !page) {
      return NextResponse.json({ 
        error: 'Page not found',
        pageId: pageId 
      }, { status: 404 })
    }
    
    console.log('Sending message to conversation:', conversation.id, 'Page:', page.name)
    
    // Send message to Facebook
    const sendMessageUrl = `https://graph.facebook.com/v19.0/me/messages`
    
    const messageData = {
      recipient: { id: conversation.participant_id },
      message: { text: messageText },
      access_token: page.access_token
    }
    
    console.log('Sending message to Facebook...')
    
    const response = await fetch(sendMessageUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messageData)
    })
    
    const data = await response.json()
    
    console.log('Facebook send message response:', JSON.stringify(data, null, 2))
    
    if (data.error) {
      console.error('Facebook API Error:', data.error)
      return NextResponse.json({ 
        error: `Facebook API: ${data.error.message}`,
        details: data.error,
        suggestion: 'Make sure your page has the correct permissions and can send messages.'
      }, { status: 400 })
    }
    
    // Save message to database
    const { data: savedMessage, error: saveError } = await supabaseAdmin
      .from('messages')
      .insert({
        conversation_id: conversationId,
        facebook_message_id: data.message_id,
        sender_id: page.facebook_page_id,
        message_text: messageText,
        is_from_page: true,
        created_at: new Date().toISOString()
      })
      .select()
      .single()
    
    if (saveError) {
      console.error('Error saving message to database:', saveError)
      // Message was sent to Facebook but couldn't be saved to database
      return NextResponse.json({ 
        message: 'Message sent successfully to Facebook but could not be saved to database',
        facebookMessageId: data.message_id,
        warning: 'Message may not appear in your inbox history'
      })
    }
    
    // Update conversation last message time
    await supabaseAdmin
      .from('conversations')
      .update({ 
        last_message_time: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', conversationId)
    
    return NextResponse.json({ 
      success: true,
      message: 'Message sent successfully',
      messageId: savedMessage.id,
      facebookMessageId: data.message_id
    })
    
  } catch (error) {
    console.error('Error in send message API:', error)
    return NextResponse.json({ 
      error: 'Failed to send message',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
