import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { cookies } from 'next/headers'
import jwt from 'jsonwebtoken'

export async function POST(req: NextRequest) {
  try {
    const { conversationId, message } = await req.json()
    
    if (!conversationId || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    
    // Get auth token
    const cookieStore = cookies()
    const token = cookieStore.get('auth-token')
    
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    
    const decoded = jwt.verify(
      token.value,
      process.env.JWT_SECRET || 'your-secret-key-change-this'
    ) as any
    
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
    }
    
    // Get conversation details
    const { data: conversation } = await supabaseAdmin
      .from('conversations')
      .select('*, page:pages(*)')
      .eq('id', conversationId)
      .single()
    
    if (!conversation || !conversation.page) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }
    
    // Send message using page access token
    const response = await fetch(
      `https://graph.facebook.com/v19.0/me/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: { id: conversation.participant_id },
          message: { text: message },
          messaging_type: 'RESPONSE',
          access_token: conversation.page.access_token // Add token here instead of header
        })
      }
    )
    
    const data = await response.json()
    
    if (data.error) {
      console.error('Facebook API Error:', data.error)
      return NextResponse.json({ 
        error: `Failed to send message: ${data.error.message}`,
        details: data.error
      }, { status: 400 })
    }
    
    // Save message to database
    await supabaseAdmin!
      .from('messages')
      .insert({
        conversation_id: conversationId,
        facebook_message_id: data.message_id,
        sender_id: conversation.page.facebook_page_id,
        page_id: conversation.page.id, // Add page_id for proper indexing
        message_text: message,
        is_from_page: true,
        created_at: new Date().toISOString(),
        event_time: new Date().toISOString() // Use current time for sent messages
      })
    
    // Update conversation last message time
    await supabaseAdmin!
      .from('conversations')
      .update({ 
        last_message_time: new Date().toISOString(),
        unread_count: 0 
      })
      .eq('id', conversationId)
    
    return NextResponse.json({ 
      success: true,
      message_id: data.message_id 
    })
    
  } catch (error: any) {
    console.error('Error sending message:', error)
    return NextResponse.json({ 
      error: 'Failed to send message',
      details: error.message 
    }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const conversationId = searchParams.get('conversationId')
  const forceRefresh = searchParams.get('refresh') === 'true'
  const pageNum = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '30')
  
  if (!conversationId) {
    return NextResponse.json({ error: 'Conversation ID is required' }, { status: 400 })
  }
  
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }
  
  try {
    // Get total message count for pagination
    const { count: totalMessages } = await supabaseAdmin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
    
    // Calculate offset for pagination
    const offset = (pageNum - 1) * pageSize
    
    // First, try to load from database cache with pagination
    if (!forceRefresh) {
      const { data: cachedMessages } = await supabaseAdmin
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('event_time', { ascending: true }) // Sort by Facebook event timestamp (oldest first)
        .range(offset, offset + pageSize - 1)
      
      if (cachedMessages && cachedMessages.length > 0) {
        // Return cached data immediately with pagination info
        return NextResponse.json({ 
          messages: cachedMessages,
          total: totalMessages || 0,
          page: pageNum,
          pageSize: pageSize,
          hasMore: offset + pageSize < (totalMessages || 0),
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
        .order('event_time', { ascending: true }) // Sort by Facebook event timestamp (oldest first)
        .range(offset, offset + pageSize - 1)
      
      return NextResponse.json({ 
        messages: fallbackMessages || [],
        total: totalMessages || 0,
        page: pageNum,
        pageSize: pageSize,
        hasMore: offset + pageSize < (totalMessages || 0),
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
        .order('event_time', { ascending: true }) // Sort by Facebook event timestamp (oldest first)
        .range(offset, offset + pageSize - 1)
      
      if (dbMessages && dbMessages.length > 0) {
        return NextResponse.json({ 
          messages: dbMessages,
          total: totalMessages || 0,
          page: pageNum,
          pageSize: pageSize,
          hasMore: offset + pageSize < (totalMessages || 0),
          source: 'database',
          message: 'Showing cached messages'
        })
      }
    }
    
    return NextResponse.json({ 
      messages,
      total: totalMessages || 0,
      page: pageNum,
      pageSize: pageSize,
      hasMore: offset + pageSize < (totalMessages || 0),
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
      .order('event_time', { ascending: true }) // Sort by Facebook event timestamp (oldest first)
      .range(0, pageSize - 1)
    
    return NextResponse.json({ 
      messages: cachedMessages || [],
      total: 0,
      page: 1,
      pageSize: pageSize,
      hasMore: false,
      error: 'Failed to fetch new messages',
      source: 'cache_on_error'
    })
  }
}
