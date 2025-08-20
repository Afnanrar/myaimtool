import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const pageId = searchParams.get('pageId')
  const forceRefresh = searchParams.get('refresh') === 'true'
  
  if (!pageId) {
    return NextResponse.json({ error: 'Page ID is required' }, { status: 400 })
  }
  
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
    }

    // Get page from database
    let page = null
    const { data: pageById } = await supabaseAdmin
      .from('pages')
      .select('*')
      .eq('id', pageId)
      .single()
    
    if (pageById) {
      page = pageById
    } else {
      const { data: pageByFbId } = await supabaseAdmin
        .from('pages')
        .select('*')
        .eq('facebook_page_id', pageId)
        .single()
      page = pageByFbId
    }
    
    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 })
    }
    
    // First, try to load from database cache (instant)
    if (!forceRefresh) {
      const { data: cachedConversations } = await supabaseAdmin
        .from('conversations')
        .select('*')
        .eq('page_id', page.id)
        .order('last_message_time', { ascending: false })
        .limit(50)
      
      if (cachedConversations && cachedConversations.length > 0) {
        // Return cached data immediately
        return NextResponse.json({ 
          conversations: cachedConversations,
          source: 'cache',
          message: 'Showing cached conversations. Click refresh for latest.'
        })
      }
    }
    
    // Fetch fresh data from Facebook
    console.log('Fetching fresh conversations from Facebook...')
    
    const conversationsUrl = `https://graph.facebook.com/v19.0/${page.facebook_page_id}/conversations?fields=participants,senders,updated_time,unread_count&limit=25&access_token=${page.access_token}`
    
    const response = await fetch(conversationsUrl)
    const data = await response.json()
    
    if (data.error) {
      console.error('Facebook API Error:', data.error)
      
      // Still return cached data if available
      const { data: fallbackConversations } = await supabaseAdmin
        .from('conversations')
        .select('*')
        .eq('page_id', page.id)
        .order('last_message_time', { ascending: false })
      
      return NextResponse.json({ 
        conversations: fallbackConversations || [],
        error: `Facebook API: ${data.error.message}`,
        source: 'cache_fallback'
      })
    }
    
    // Process and save conversations
    const conversations = []
    
    if (data.data && data.data.length > 0) {
      // Use Promise.all for parallel processing
      const savePromises = data.data.map(async (conv: any) => {
        const participant = conv.participants?.data?.find((p: any) => p.id !== page.facebook_page_id)
        
        if (participant) {
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
          
          return savedConv
        }
        return null
      })
      
      const results = await Promise.all(savePromises)
      conversations.push(...results.filter(Boolean))
    }
    
    return NextResponse.json({ 
      conversations,
      totalFound: conversations.length,
      source: 'facebook',
      message: 'Fresh data loaded'
    })
    
  } catch (error) {
    console.error('Error in conversations API:', error)
    
    // Return cached data on error
    const { data: cachedConversations } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('page_id', page.id)
      .order('last_message_time', { ascending: false })
    
    return NextResponse.json({ 
      conversations: cachedConversations || [],
      error: 'Failed to fetch new conversations',
      source: 'cache_on_error'
    })
  }
}
