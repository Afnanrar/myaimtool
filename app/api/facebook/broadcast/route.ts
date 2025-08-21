import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { pageId, message, messageTag, useSpintax, audience } = await req.json()
    
    if (!pageId || !message || !messageTag) {
      return NextResponse.json({ 
        error: 'Missing required fields: pageId, message, and messageTag are required' 
      }, { status: 400 })
    }
    
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
    }
    
    // Get page details
    const { data: page } = await supabaseAdmin!
      .from('pages')
      .select('*')
      .eq('id', pageId)
      .single()
    
    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 })
    }
    
    // Get all conversations for this page
    const { data: conversations } = await supabaseAdmin!
      .from('conversations')
      .select('participant_id, last_message_time')
      .eq('page_id', pageId)
    
    if (!conversations || conversations.length === 0) {
      return NextResponse.json({ error: 'No conversations found for this page' }, { status: 400 })
    }
    
    const now = new Date()
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    
    let sent24h = 0
    let sentWithTag = 0
    let failed = 0
    let excluded = 0
    
    // Process each conversation
    for (const conversation of conversations) {
      try {
        const lastMessage = new Date(conversation.last_message_time)
        const isWithin24h = lastMessage > twentyFourHoursAgo
        
        // Prepare message payload
        const messagePayload: any = {
          recipient: { id: conversation.participant_id },
          message: { text: message }
        }
        
        // Add message tag for messages after 24h
        if (!isWithin24h && messageTag) {
          messagePayload.tag = messageTag
        }
        
        // Send message via Facebook Graph API
        const response = await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${page.access_token}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(messagePayload)
        })
        
        const result = await response.json()
        
        if (response.ok && result.message_id) {
          // Message sent successfully
          if (isWithin24h) {
            sent24h++
          } else {
            sentWithTag++
          }
          
          // Save broadcast record to database
          await supabaseAdmin!
            .from('broadcasts')
            .insert({
              page_id: pageId,
              message_text: message,
              message_tag: messageTag,
              recipient_id: conversation.participant_id,
              facebook_message_id: result.message_id,
              sent_at: new Date().toISOString(),
              status: 'sent'
            })
          
          console.log(`Broadcast sent to ${conversation.participant_id}: ${result.message_id}`)
        } else {
          // Message failed
          failed++
          console.error(`Failed to send broadcast to ${conversation.participant_id}:`, result)
          
          // Save failed broadcast record
          await supabaseAdmin!
            .from('broadcasts')
            .insert({
              page_id: pageId,
              message_text: message,
              message_tag: messageTag,
              recipient_id: conversation.participant_id,
              status: 'failed',
              error_message: result.error?.message || 'Unknown error'
            })
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100))
        
      } catch (error) {
        failed++
        console.error(`Error sending broadcast to ${conversation.participant_id}:`, error)
        
        // Save error record
        await supabaseAdmin!
          .from('broadcasts')
          .insert({
            page_id: pageId,
            message_text: message,
            message_tag: messageTag,
            recipient_id: conversation.participant_id,
            status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error'
          })
      }
    }
    
    const totalLeads = conversations.length
    const broadcastId = `broadcast_${Date.now()}_${pageId}`
    
    return NextResponse.json({
      success: true,
      totalLeads,
      sent24h,
      sentWithTag,
      failed,
      excluded,
      broadcastId
    })
    
  } catch (error) {
    console.error('Broadcast error:', error)
    return NextResponse.json({ 
      error: 'Failed to send broadcast: ' + (error instanceof Error ? error.message : 'Unknown error')
    }, { status: 500 })
  }
}
