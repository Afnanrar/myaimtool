import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { RateLimiterWorkerSupabase } from '@/lib/rate-limiter-worker-supabase'

export async function POST(req: NextRequest) {
  try {
    const { pageId, message, messageTag, useSpintax, audience, sendToAllLeads } = await req.json()
    
    console.log(`Rate-limited broadcast request: sendToAllLeads=${sendToAllLeads}, messageTag=${messageTag}`)
    
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
      .select('participant_id, last_message_time, participant_name')
      .eq('page_id', pageId)
      .not('participant_id', 'is', null)
      .not('participant_id', 'eq', '')
    
    if (!conversations || conversations.length === 0) {
      return NextResponse.json({ error: 'No conversations found for this page' }, { status: 400 })
    }
    
    const now = new Date()
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    
    let queued24h = 0
    let queuedWithTag = 0
    let invalidUsers = 0
    let outsideWindow = 0
    
    // Filter and categorize conversations
    const eligibleConversations = conversations.filter(conv => {
      // Skip conversations without valid participant IDs
      if (!conv.participant_id || conv.participant_id === 'undefined' || conv.participant_id === 'null') {
        invalidUsers++
        return false
      }
      
      // If sending to all leads, include everyone
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
      outsideWindow = 0
      console.log(`Send to ALL leads enabled: All ${conversations.length} leads are eligible`)
    }
    
    console.log(`Broadcast eligibility: ${conversations.length} total, ${eligibleConversations.length} eligible, ${invalidUsers} invalid, ${outsideWindow} outside window`)
    
    if (eligibleConversations.length === 0) {
      return NextResponse.json({ 
        error: 'No eligible recipients found. All users are either invalid or outside the 24-hour messaging window without a proper message tag. Try enabling "Send to ALL leads" with a message tag.' 
      }, { status: 400 })
    }
    
    // Queue messages in the rate limiter system instead of sending immediately
    const queuedMessages: string[] = []
    
    for (const conversation of eligibleConversations) {
      try {
        const lastMessage = new Date(conversation.last_message_time)
        const isWithin24h = lastMessage > twentyFourHoursAgo
        
        // Create unique idempotency key
        const idempotencyKey = `broadcast_${pageId}_${conversation.participant_id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        
                 // Add message to the rate limiter queue
         const { data: queuedMessage, error: queueError } = await supabaseAdmin!
           .from('message_queue')
           .insert({
             page_id: pageId,
             recipient_id: conversation.participant_id,
             message_text: message,
             message_tag: sendToAllLeads ? messageTag : (isWithin24h ? null : messageTag),
             priority: 0,
             idempotency_key: idempotencyKey,
             status: 'queued'
           })
           .select()
           .single()
        
        if (queueError) {
          console.error(`Failed to queue message for ${conversation.participant_id}:`, queueError)
          continue
        }
        
        queuedMessages.push(queuedMessage.id)
        
        // Categorize by time and tag usage
        if (sendToAllLeads) {
          // When sending to all leads, categorize by time but all get message tag
          if (isWithin24h) {
            queued24h++
          } else {
            queuedWithTag++
          }
        } else {
          // Normal mode - categorize by time
          if (isWithin24h) {
            queued24h++
          } else {
            queuedWithTag++
          }
        }
        
        console.log(`✅ Message queued for ${conversation.participant_id} (${isWithin24h ? '≤24h' : '24h+'})`)
        
      } catch (error) {
        console.error(`Error queuing message for ${conversation.participant_id}:`, error)
      }
    }
    
    // Start the rate limiter worker if it's not already running
    try {
      const workerResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/rate-limiter/start`, {
        method: 'POST'
      })
      
      if (workerResponse.ok) {
        console.log('✅ Rate limiter worker started successfully')
      } else {
        console.log('⚠️ Rate limiter worker may already be running')
      }
    } catch (error) {
      console.log('⚠️ Could not start rate limiter worker (may already be running):', error)
    }
    
    const totalLeads = conversations.length
    const broadcastId = `rate_limited_broadcast_${Date.now()}_${pageId}`
    
    // Calculate queued rate
    const totalQueued = queued24h + queuedWithTag
    const queuedRate = totalQueued > 0 ? Math.round((totalQueued / eligibleConversations.length) * 100) : 0
    
    return NextResponse.json({
      success: true,
      message: 'Messages queued successfully in rate limiter system',
      totalLeads,
      eligibleRecipients: eligibleConversations.length,
      queued24h,
      queuedWithTag,
      queuedMessages: queuedMessages.length,
      invalidUsers,
      outsideWindow,
      queuedRate: `${queuedRate}%`,
      broadcastId,
      summary: {
        total: totalLeads,
        eligible: eligibleConversations.length,
        queued: totalQueued,
        invalid: invalidUsers,
        outsideWindow: outsideWindow,
        queuedRate: `${queuedRate}%`
      },
      nextSteps: [
        'Messages are now queued in the rate limiter system',
        'The rate limiter worker will process them automatically',
        'Messages will be sent at optimal rates to avoid Facebook API limits',
        'Monitor progress at /rate-limiter-test',
        'Expected delivery time: 2-5 minutes for all messages'
      ]
    })
    
  } catch (error) {
    console.error('Rate-limited broadcast error:', error)
    return NextResponse.json({ 
      error: 'Failed to queue broadcast: ' + (error instanceof Error ? error.message : 'Unknown error')
    }, { status: 500 })
  }
}
