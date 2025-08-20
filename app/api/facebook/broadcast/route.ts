import { NextRequest, NextResponse } from 'next/server'
import { FacebookAPI } from '@/lib/facebook'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyAuth } from '@/lib/auth'

export async function POST(req: NextRequest) {
  // Check if required environment variables are set
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Service not configured' }, { status: 500 })
  }
  
  const auth = await verifyAuth(req)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  const { pageId, message, useSpintax } = await req.json()
  
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }
  
  // Get page and recent conversations
  const { data: page } = await supabaseAdmin
    .from('pages')
    .select('*')
    .eq('id', pageId)
    .eq('user_id', auth.userId)
    .single()
  
  // Get recipients (users who messaged in last 24 hours)
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  
  const { data: conversations } = await supabaseAdmin
    .from('conversations')
    .select('participant_id')
    .eq('page_id', pageId)
    .gte('last_message_time', twentyFourHoursAgo)
  
  if (!conversations || conversations.length === 0) {
    return NextResponse.json({ 
      error: 'No eligible recipients (must have messaged within 24 hours)' 
    }, { status: 400 })
  }
  
  // Create broadcast record
  const { data: broadcast } = await supabaseAdmin
    .from('broadcasts')
    .insert({
      page_id: pageId,
      message_text: message,
      recipient_count: conversations.length,
      status: 'sending'
    })
    .select()
    .single()
  
  // Process message with spintax if enabled
  const processMessage = (text: string) => {
    if (!useSpintax) return text
    
    // Simple spintax: {option1|option2|option3}
    return text.replace(/\{([^}]+)\}/g, (match, group) => {
      const options = group.split('|')
      return options[Math.floor(Math.random() * options.length)]
    })
  }
  
  // Send messages in background
  const fb = new FacebookAPI(page.access_token)
  const recipients = conversations.map(c => c.participant_id)
  
  // Start async broadcast
  sendBroadcastAsync(broadcast.id, recipients, processMessage(message), page.access_token)
  
  return NextResponse.json({ 
    success: true, 
    broadcastId: broadcast.id,
    recipientCount: recipients.length 
  })
}

async function sendBroadcastAsync(
  broadcastId: string,
  recipients: string[],
  message: string,
  pageAccessToken: string
) {
  const fb = new FacebookAPI(pageAccessToken)
  let sentCount = 0
  let failedCount = 0
  
  for (const recipientId of recipients) {
    try {
      await fb.sendMessage(recipientId, message, pageAccessToken)
      sentCount++
      
      await supabaseAdmin
        .from('broadcast_recipients')
        .insert({
          broadcast_id: broadcastId,
          recipient_id: recipientId,
          status: 'sent',
          sent_at: new Date().toISOString()
        })
    } catch (error) {
      failedCount++
      
      await supabaseAdmin
        .from('broadcast_recipients')
        .insert({
          broadcast_id: broadcastId,
          recipient_id: recipientId,
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error'
        })
    }
    
    // Update broadcast progress
    await supabaseAdmin
      .from('broadcasts')
      .update({
        sent_count: sentCount,
        failed_count: failedCount,
        status: sentCount + failedCount === recipients.length ? 'completed' : 'sending',
        completed_at: sentCount + failedCount === recipients.length ? new Date().toISOString() : null
      })
      .eq('id', broadcastId)
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}
