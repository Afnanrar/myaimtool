import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { pageId, message, messageTag, useSpintax, audience, sendToAllLeads } = await req.json()
    
    console.log(`Broadcast request: sendToAllLeads=${sendToAllLeads}, messageTag=${messageTag}`)
    
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
    
    // Validate message tag format
    const validMessageTags = [
      'CONFIRMED_EVENT_UPDATE',
      'POST_PURCHASE_UPDATE', 
      'ACCOUNT_UPDATE',
      'HUMAN_AGENT',
      'CUSTOMER_FEEDBACK',
      'CONVERSATION_STARTER'
    ]
    
    if (sendToAllLeads && !validMessageTags.includes(messageTag)) {
      return NextResponse.json({ 
        error: `Invalid message tag "${messageTag}". Valid tags are: ${validMessageTags.join(', ')}` 
      }, { status: 400 })
    }
    
    console.log(`Message tag validation: "${messageTag}" is ${validMessageTags.includes(messageTag) ? 'valid' : 'invalid'}`)
    
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
    
    // If sending to all leads, reset counters since everyone is eligible
    if (sendToAllLeads) {
      outsideWindow = 0 // Reset since all leads are eligible
      console.log(`Send to ALL leads enabled: All ${conversations.length} leads are eligible`)
    }
    
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
        
        // Smart message tag strategy for "Send to ALL leads"
        if (sendToAllLeads) {
          // Always add message tag when sending to all leads
          messagePayload.tag = messageTag
          console.log(`Adding message tag "${messageTag}" for user ${conversation.participant_id} (sendToAllLeads: ${sendToAllLeads})`)
        } else if (!isWithin24h && messageTag) {
          // Normal mode: add message tag only for users outside 24h
          messagePayload.tag = messageTag
          console.log(`Adding message tag "${messageTag}" for user ${conversation.participant_id} (outside 24h)`)
        }
        
        // Validate user ID format (Facebook user IDs are numeric)
        if (!/^\d+$/.test(conversation.participant_id)) {
          console.log(`Skipping invalid user ID format: ${conversation.participant_id}`)
          invalidUsers++
          continue
        }
        
        // Log the message payload being sent
        console.log(`Sending message to ${conversation.participant_id}:`, JSON.stringify(messagePayload, null, 2))
        
        // Smart sending strategy with retry for "Send to ALL leads"
        let response: any
        let result: any
        let success = false
        
        // First attempt: Try with message tag
        if (sendToAllLeads) {
          console.log(`🔄 Attempt 1: Sending with message tag "${messageTag}" to ${conversation.participant_id}`)
          
          const apiUrl = `https://graph.facebook.com/v19.0/${page.facebook_page_id}/messages?access_token=${page.access_token}`
          console.log(`Sending to Facebook API: ${apiUrl}`)
          console.log(`Full message payload:`, JSON.stringify(messagePayload, null, 2))
          
          response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(messagePayload)
          })
          
          console.log(`Facebook API response status: ${response.status}`)
          result = await response.json()
          console.log(`Facebook API response:`, JSON.stringify(result, null, 2))
          
          if (response.ok && result.message_id) {
            success = true
            console.log(`✅ Success with message tag on first attempt`)
          } else if (result.error?.code === 10) {
            // Error 10: Outside messaging window - try without message tag as fallback
            console.log(`⚠️ First attempt failed with error 10, trying fallback without message tag...`)
            
            const fallbackPayload = {
              recipient: { id: conversation.participant_id },
              message: { text: message }
            }
            
            console.log(`🔄 Attempt 2: Fallback without message tag`)
            console.log(`Fallback payload:`, JSON.stringify(fallbackPayload, null, 2))
            
            const fallbackResponse = await fetch(apiUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(fallbackPayload)
            })
            
            const fallbackResult = await fallbackResponse.json()
            console.log(`Fallback response:`, JSON.stringify(fallbackResult, null, 2))
            
            if (fallbackResponse.ok && fallbackResult.message_id) {
              success = true
              response = fallbackResponse
              result = fallbackResult
              console.log(`✅ Success with fallback (no message tag)`)
            } else {
              console.log(`❌ Fallback also failed:`, fallbackResult)
            }
          }
        } else {
          // Normal mode: Single attempt
          const apiUrl = `https://graph.facebook.com/v19.0/${page.facebook_page_id}/messages?access_token=${page.access_token}`
          console.log(`Sending to Facebook API: ${apiUrl}`)
          console.log(`Full message payload:`, JSON.stringify(messagePayload, null, 2))
          
          response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(messagePayload)
          })
          
          console.log(`Facebook API response status: ${response.status}`)
          result = await response.json()
          console.log(`Facebook API response:`, JSON.stringify(result, null, 2))
          
          if (response.ok && result.message_id) {
            success = true
          }
        }
        
        if (success) {
          // Message sent successfully (either with message tag or fallback)
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
        } else if (!success) {
          // Message failed - categorize the error
          failed++
          const errorMessage = result.error?.message || 'Unknown error'
          const errorCode = result.error?.code || 0
          
          console.error(`Failed to send broadcast to ${conversation.participant_id}:`, result)
          
          // Categorize failures with detailed logging
          console.log(`Error details for ${conversation.participant_id}: Code=${errorCode}, Message="${errorMessage}"`)
          
          if (errorCode === 100) {
            invalidUsers++
            console.log(`User ${conversation.participant_id} not found, marking as invalid`)
          } else if (errorCode === 10) {
            if (sendToAllLeads) {
              // When sending to all leads, this error shouldn't happen since we use message tags
              console.log(`⚠️ CRITICAL: User ${conversation.participant_id} failed with error 10 despite message tag "${messageTag}"`)
              console.log(`This suggests the message tag "${messageTag}" may be invalid or not properly applied`)
            } else {
              outsideWindow++
              console.log(`User ${conversation.participant_id} outside messaging window`)
            }
          } else {
            console.log(`Unknown error code ${errorCode} for user ${conversation.participant_id}`)
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
