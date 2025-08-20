import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import jwt from 'jsonwebtoken'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const pageId = searchParams.get('pageId')
  
  const cookieStore = cookies()
  const token = cookieStore.get('auth-token')
  
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  
  try {
    const decoded = jwt.verify(
      token.value,
      process.env.JWT_SECRET || 'your-secret-key-change-this'
    ) as any
    
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
    }
    
    // Get page details from database
    const { data: page } = await supabaseAdmin
      .from('pages')
      .select('*')
      .eq('id', pageId)
      .single()
    
    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 })
    }
    
    console.log('Fetching conversations for page:', page.name)
    
    // Fetch conversations from Facebook
    // Using the conversations endpoint
    const conversationsUrl = `https://graph.facebook.com/v19.0/${page.facebook_page_id}/conversations?fields=participants,updated_time,messages{message,from,created_time}&access_token=${page.access_token}`
    
    console.log('Fetching from URL:', conversationsUrl.replace(page.access_token, 'TOKEN'))
    
    const response = await fetch(conversationsUrl)
    const data = await response.json()
    
    console.log('Facebook Response:', data)
    
    if (data.error) {
      console.error('Facebook API Error:', data.error)
      
      // Try alternate method - fetch recent messages
      const messagesUrl = `https://graph.facebook.com/v19.0/${page.facebook_page_id}?fields=conversations{participants,updated_time,unread_count,messages{message,from,created_time,id}}&access_token=${page.access_token}`
      
      const altResponse = await fetch(messagesUrl)
      const altData = await altResponse.json()
      
      console.log('Alternative method response:', altData)
      
      if (altData.conversations) {
        // Process and save conversations
        const conversations = []
        for (const conv of altData.conversations.data || []) {
          const participant = conv.participants.data.find((p: any) => p.id !== page.facebook_page_id)
          
          if (participant) {
            const { data: savedConv } = await supabaseAdmin
              .from('conversations')
              .upsert({
                page_id: pageId,
                facebook_conversation_id: conv.id,
                participant_id: participant.id,
                participant_name: participant.name || 'Unknown User',
                last_message_time: conv.updated_time,
                unread_count: conv.unread_count || 0
              }, {
                onConflict: 'page_id,facebook_conversation_id'
              })
              .select()
              .single()
            
            if (savedConv) {
              conversations.push(savedConv)
            }
          }
        }
        
        return NextResponse.json({ conversations, source: 'alternate' })
      }
      
      return NextResponse.json({ 
        error: 'Failed to fetch conversations',
        details: data.error,
        suggestion: 'Make sure the page has messaging enabled and you have the correct permissions'
      }, { status: 400 })
    }
    
    // Process and save conversations
    const conversations = []
    for (const conv of data.data || []) {
      const participant = conv.participants.data.find((p: any) => p.id !== page.facebook_page_id)
      
      if (participant) {
        const { data: savedConv } = await supabaseAdmin
          .from('conversations')
          .upsert({
            page_id: pageId,
            facebook_conversation_id: conv.id,
            participant_id: participant.id,
            participant_name: participant.name || 'Unknown User',
            last_message_time: conv.updated_time,
            unread_count: 0
          }, {
            onConflict: 'page_id,facebook_conversation_id'
          })
          .select()
          .single()
        
        if (savedConv) {
          conversations.push(savedConv)
          
          // Save recent messages
          if (conv.messages && conv.messages.data) {
            for (const msg of conv.messages.data) {
              await supabaseAdmin
                .from('messages')
                .upsert({
                  conversation_id: savedConv.id,
                  facebook_message_id: msg.id,
                  sender_id: msg.from.id,
                  message_text: msg.message,
                  is_from_page: msg.from.id === page.facebook_page_id,
                  created_at: msg.created_time
                }, {
                  onConflict: 'facebook_message_id'
                })
            }
          }
        }
      }
    }
    
    return NextResponse.json({ 
      conversations,
      totalFound: data.data?.length || 0,
      pageName: page.name
    })
    
  } catch (error) {
    console.error('Error fetching conversations:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch conversations',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
