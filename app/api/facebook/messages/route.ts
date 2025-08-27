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
      
      // Handle specific Facebook error codes
      let errorMessage = 'Failed to send message'
      if (data.error.code === 100) {
        errorMessage = 'User not found or not eligible for messaging'
      } else if (data.error.code === 10) {
        errorMessage = 'Message sent outside allowed window (24h limit)'
      } else if (data.error.code === 190) {
        errorMessage = 'Invalid access token - please reconnect your Facebook page'
      } else {
        errorMessage = `Facebook API Error: ${data.error.message}`
      }
      
      return NextResponse.json({ 
        success: false,
        error: errorMessage,
        details: data.error
      }, { status: 400 })
    }
    
    // Return 200 immediately after Facebook API success - don't block on DB operations
    console.log('Facebook API success, returning immediately with message_id:', data.message_id)
    
    // Fire-and-forget database operations (don't block response)
    Promise.all([
      // Save message to database with proper structure
      supabaseAdmin!.from('messages').upsert({
        id: data.message_id, // Use Facebook message ID as primary key
        conversation_id: conversationId,
        facebook_message_id: data.message_id,
        sender_id: conversation.page.facebook_page_id,
        page_id: conversation.page.id,
        message_text: message,
        is_from_page: true,
        direction: 'outgoing',
        created_at: new Date().toISOString(),
        event_time: new Date().toISOString()
      }, {
        onConflict: 'id' // Upsert by Facebook message ID
      }),
      
      // Update conversation last message time
      supabaseAdmin!.from('conversations').update({ 
        last_message_time: new Date().toISOString(),
        unread_count: 0 
      }).eq('id', conversationId)
    ]).catch(error => {
      console.error('Background DB operations failed:', error)
      // Don't fail the request - these are background operations
    })
    
    return NextResponse.json({ 
      success: true,
      message_id: data.message_id,
      // Don't return saved message - it will come via webhook echo
      timestamp: new Date().toISOString()
    })
    
  } catch (error: any) {
    console.error('Error sending message:', error)
    
    // Return error with proper structure
    const errorResponse = {
      success: false,
      error: 'Failed to send message',
      details: error.message || 'Unknown error'
    }
    
    console.log('Returning error response:', errorResponse)
    
    return NextResponse.json(errorResponse, { status: 500 })
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
        .order('event_time', { ascending: true }) // Sort by Facebook event timestamp (oldest first, newest last)
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
    const messagesUrl = `https://graph.facebook.com/v19.0/${conversation.facebook_conversation_id}/messages?fields=id,message,from,created_time&limit=100&access_token=${page.access_token}`
    
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
        const messageData = {
          id: msg.id, // Use Facebook message ID as primary key
          conversation_id: conversationId,
          facebook_message_id: msg.id,
          sender_id: msg.from.id,
          page_id: conversation.page_id,
          message_text: msg.message || '[Media or attachment]',
          is_from_page: msg.from.id === page.facebook_page_id,
          direction: msg.from.id === page.facebook_page_id ? 'outgoing' : 'incoming',
          created_at: msg.created_time,
          event_time: msg.created_time // Use Facebook timestamp for proper ordering
        }
        
        const { data: savedMsg } = await supabaseAdmin!
          .from('messages')
          .upsert(messageData, {
            onConflict: 'id' // Upsert by Facebook message ID
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
