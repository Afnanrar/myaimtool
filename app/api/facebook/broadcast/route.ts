import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { pageId, message, messageTag, useSpintax, audience, sendToAllLeads } = await req.json()
    
    if (!pageId || !message) {
      return NextResponse.json({ 
        error: 'Missing required fields: pageId and message are required' 
      }, { status: 400 })
    }
    
    // If sending to all leads, messageTag is required
    if (sendToAllLeads && !messageTag) {
      return NextResponse.json({ 
        error: 'Message tag is required when sending to all leads (including outside 24h window)' 
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
    
    // Get all conversations for this page with proper validation
    const { data: conversations } = await supabaseAdmin!
      .from('conversations')
      .select('participant_id, last_message_time, participant_name')
      .eq('page_id', pageId)
      .not('participant_id', 'is', null)
      .not('participant_id', 'eq', '')
    
    if (!conversations || conversations.length === 0) {
      return NextResponse.json({ error: 'No conversations found for this page' }, { status: 400 })
    }
    
    const now = new Date()
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    
    let sent24h = 0
    let sentWithTag = 0
    let failed = 0
    let excluded = 0
    let invalidUsers = 0
    let outsideWindow = 0
    
    // Filter and categorize conversations
    const eligibleConversations = conversations.filter(conv => {
      // Skip conversations without valid participant IDs
      if (!conv.participant_id || conv.participant_id === 'undefined' || conv.participant_id === 'null') {
        invalidUsers++
        return false
      }
      
      // If sending to all leads, include everyone (they'll get message tag if needed)
      if (sendToAllLeads) {
        return true
      }
      
      // Check if user has messaged within 24 hours
      if (conv.last_message_time) {
        const lastMessage = new Date(conv.last_message_time)
        if (lastMessage > twentyFourHoursAgo) {
          return true // Eligible for standard message
        } else {
          // Check if we have a valid message tag for 24h+ messaging
          if (messageTag && messageTag.trim() !== '') {
            return true // Eligible with message tag
          } else {
            outsideWindow++
            return false // Not eligible
          }
        }
      } else {
        // No last message time, exclude
        outsideWindow++
        return false
      }
    })
    
    console.log(`Broadcast eligibility: ${conversations.length} total, ${eligibleConversations.length} eligible, ${invalidUsers} invalid, ${outsideWindow} outside window`)
    
    if (eligibleConversations.length === 0) {
      return NextResponse.json({ 
        error: 'No eligible recipients found. All users are either invalid or outside the 24-hour messaging window without a proper message tag. Try enabling "Send to ALL leads" with a message tag.' 
      }, { status: 400 })
    }
    
    // Process each eligible conversation
    for (const conversation of eligibleConversations) {
      try {
        const lastMessage = new Date(conversation.last_message_time)
        const isWithin24h = lastMessage > twentyFourHoursAgo
        
        // Prepare message payload
        const messagePayload: any = {
          recipient: { id: conversation.participant_id },
          message: { text: message }
        }
        
        // Add message tag for messages after 24h or when sending to all leads
        if ((!isWithin24h && messageTag) || sendToAllLeads) {
          messagePayload.tag = messageTag
        }
        
        // Validate user ID format (Facebook user IDs are numeric)
        if (!/^\d+$/.test(conversation.participant_id)) {
          console.log(`Skipping invalid user ID format: ${conversation.participant_id}`)
          invalidUsers++
          continue
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
          if (sendToAllLeads) {
            // When sending to all leads, categorize by time but all get message tag
            if (isWithin24h) {
              sent24h++
            } else {
              sentWithTag++
            }
          } else {
            // Normal mode - categorize by time
            if (isWithin24h) {
              sent24h++
            } else {
              sentWithTag++
            }
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
          // Message failed - categorize the error
          failed++
          const errorMessage = result.error?.message || 'Unknown error'
          const errorCode = result.error?.code || 0
          
          console.error(`Failed to send broadcast to ${conversation.participant_id}:`, result)
          
          // Categorize failures
          if (errorCode === 100) {
            invalidUsers++
            console.log(`User ${conversation.participant_id} not found, marking as invalid`)
          } else if (errorCode === 10) {
            outsideWindow++
            console.log(`User ${conversation.participant_id} outside messaging window`)
          }
          
          // Save failed broadcast record
          await supabaseAdmin!
            .from('broadcasts')
            .insert({
              page_id: pageId,
              message_text: message,
              message_tag: messageTag,
              recipient_id: conversation.participant_id,
              status: 'failed',
              error_message: errorMessage,
              error_code: errorCode
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
    
    // Calculate success rate
    const totalAttempted = sent24h + sentWithTag + failed
    const successRate = totalAttempted > 0 ? Math.round(((sent24h + sentWithTag) / totalAttempted) * 100) : 0
    
    return NextResponse.json({
      success: true,
      totalLeads,
      eligibleRecipients: eligibleConversations.length,
      sent24h,
      sentWithTag,
      failed,
      excluded,
      invalidUsers,
      outsideWindow,
      successRate,
      broadcastId,
      summary: {
        total: totalLeads,
        eligible: eligibleConversations.length,
        successful: sent24h + sentWithTag,
        failed: failed,
        successRate: `${successRate}%`
      }
    })
    
  } catch (error) {
    console.error('Broadcast error:', error)
    return NextResponse.json({ 
      error: 'Failed to send broadcast: ' + (error instanceof Error ? error.message : 'Unknown error')
    }, { status: 500 })
  }
}
