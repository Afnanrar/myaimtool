import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  let pageId = searchParams.get('pageId')
  
  if (!pageId) {
    return NextResponse.json({ error: 'Page ID is required' }, { status: 400 })
  }
  
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  try {
    // First, check if this is a database ID or Facebook page ID
    let page = null
    
    // Try to find by database ID first
    const { data: pageById } = await supabaseAdmin
      .from('pages')
      .select('*')
      .eq('id', pageId)
      .single()
    
    if (pageById) {
      page = pageById
    } else {
      // Try to find by Facebook page ID
      const { data: pageByFbId } = await supabaseAdmin
        .from('pages')
        .select('*')
        .eq('facebook_page_id', pageId)
        .single()
      
      page = pageByFbId
    }
    
    if (!page) {
      return NextResponse.json({ 
        error: 'Page not found in database',
        pageId: pageId 
      }, { status: 404 })
    }
    
    console.log('Found page:', page.name, 'FB ID:', page.facebook_page_id)
    
    // Try to fetch conversations from Facebook
    const conversationsUrl = `https://graph.facebook.com/v19.0/${page.facebook_page_id}/conversations?fields=participants,senders,can_reply,is_subscribed,unread_count,updated_time&access_token=${page.access_token}`
    
    console.log('Fetching conversations from Facebook...')
    
    const response = await fetch(conversationsUrl)
    const data = await response.json()
    
    console.log('Facebook response:', JSON.stringify(data, null, 2))
    
    if (data.error) {
      console.error('Facebook API Error:', data.error)
      
      // Return empty array with error message
      return NextResponse.json({ 
        conversations: [],
        error: `Facebook API: ${data.error.message}`,
        suggestion: 'Make sure your page has the correct permissions and has received messages recently.',
        debug: {
          pageId: page.facebook_page_id,
          pageName: page.name,
          errorCode: data.error.code,
          errorType: data.error.type
        }
      })
    }
    
    // Process conversations
    const conversations = []
    
    if (data.data && data.data.length > 0) {
      for (const conv of data.data) {
        // Find the participant who is not the page
        const participant = conv.participants?.data?.find((p: any) => p.id !== page.facebook_page_id)
        
        if (participant) {
          // Save to database
          const { data: savedConv } = await supabaseAdmin
            .from('conversations')
            .upsert({
              page_id: page.id,
              facebook_conversation_id: conv.id,
              participant_id: participant.id,
              participant_name: participant.name || participant.email || 'Facebook User',
              last_message_time: conv.updated_time || new Date().toISOString(),
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
    }
    
    // If no conversations from Facebook, check database
    if (conversations.length === 0) {
      const { data: dbConversations } = await supabaseAdmin
        .from('conversations')
        .select('*')
        .eq('page_id', page.id)
        .order('last_message_time', { ascending: false })
      
      if (dbConversations && dbConversations.length > 0) {
        return NextResponse.json({ 
          conversations: dbConversations,
          source: 'database',
          message: 'Showing cached conversations'
        })
      }
    }
    
    return NextResponse.json({ 
      conversations,
      totalFound: conversations.length,
      pageName: page.name,
      source: 'facebook'
    })
    
  } catch (error) {
    console.error('Error in conversations API:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch conversations',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
