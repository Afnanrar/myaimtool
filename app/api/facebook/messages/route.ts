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
  
  const { conversationId, message } = await req.json()
  
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
    }
    
    // Get conversation and page details
    const { data: conversation } = await supabaseAdmin
      .from('conversations')
      .select(`
        *,
        pages!inner(
          access_token,
          facebook_page_id
        )
      `)
      .eq('id', conversationId)
      .single()
    
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }
    
    // Send message via Facebook API
    const fb = new FacebookAPI(conversation.pages.access_token)
    const result = await fb.sendMessage(
      conversation.participant_id,
      message,
      conversation.pages.access_token
    )
    
    // Store message in database
    await supabaseAdmin
      .from('messages')
      .insert({
        conversation_id: conversationId,
        facebook_message_id: result.message_id || `msg_${Date.now()}`,
        sender_id: conversation.pages.facebook_page_id,
        message_text: message,
        is_from_page: true
      })
    
    return NextResponse.json({ success: true, result })
  } catch (error) {
    console.error('Failed to send message:', error)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const conversationId = searchParams.get('conversationId')
  const forceRefresh = searchParams.get('refresh') === 'true'
  
  if (!conversationId) {
    return NextResponse.json({ error: 'Conversation ID is required' }, { status: 400 })
  }
  
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }
  
  try {
    // First, try to load from database cache (instant)
    if (!forceRefresh) {
      const { data: cachedMessages } = await supabaseAdmin
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(100) // Limit to prevent memory issues
      
      if (cachedMessages && cachedMessages.length > 0) {
        // Return cached data immediately
        return NextResponse.json({ 
          messages: cachedMessages,
          source: 'cache',
          message: 'Showing cached messages. Add ?refresh=true for latest.'
        })
      }
    }
    
    // Get the conversation details
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
    
    // Get the page details to fetch messages from Facebook
    const { data: page } = await supabaseAdmin
      .from('pages')
      .select('*')
      .eq('id', conversation.page_id)
      .single()
    
    if (!page) {
      return NextResponse.json({ 
        error: 'Page not found for this conversation',
        pageId: conversation.page_id 
      }, { status: 404 })
    }
    
    console.log('Fetching fresh messages from Facebook for conversation:', conversation.id)
    
    // Try to fetch messages from Facebook
    const messagesUrl = `https://graph.facebook.com/v19.0/${conversation.facebook_conversation_id}/messages?fields=id,message,from,created_time&limit=50&access_token=${page.access_token}`
    
    const response = await fetch(messagesUrl)
    const data = await response.json()
    
    if (data.error) {
      console.error('Facebook API Error:', data.error)
      
      // If Facebook API fails, return cached data if available
      const { data: fallbackMessages } = await supabaseAdmin
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
      
      return NextResponse.json({ 
        messages: fallbackMessages || [],
        error: `Facebook API: ${data.error.message}`,
        source: 'cache_fallback'
      })
    }
    
    // Process and save messages with parallel processing
    const messages = []
    
    if (data.data && data.data.length > 0) {
      // Use Promise.all for parallel processing
      const savePromises = data.data.map(async (msg: any) => {
        const { data: savedMsg } = await supabaseAdmin!
          .from('messages')
          .upsert({
            conversation_id: conversationId,
            facebook_message_id: msg.id,
            sender_id: msg.from.id,
            message_text: msg.message || '[Media or attachment]',
            is_from_page: msg.from.id === page.facebook_page_id,
            created_at: msg.created_time
          }, {
            onConflict: 'facebook_message_id'
          })
          .select()
          .single()
        
        return savedMsg
      })
      
      const results = await Promise.all(savePromises)
      messages.push(...results.filter(Boolean))
    }
    
    // If no messages from Facebook, check database
    if (messages.length === 0) {
      const { data: dbMessages } = await supabaseAdmin
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
      
      if (dbMessages && dbMessages.length > 0) {
        return NextResponse.json({ 
          messages: dbMessages,
          source: 'database',
          message: 'Showing cached messages'
        })
      }
    }
    
    return NextResponse.json({ 
      messages,
      totalFound: messages.length,
      conversationId: conversation.id,
      source: 'facebook'
    })
    
  } catch (error) {
    console.error('Error in messages API:', error)
    
    // Return cached data on error
    const { data: cachedMessages } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
              .order('created_at', { ascending: false })
    
    return NextResponse.json({ 
      messages: cachedMessages || [],
      error: 'Failed to fetch new messages',
      source: 'cache_on_error'
    })
  }
}
