import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const pageId = searchParams.get('pageId')
  const forceRefresh = searchParams.get('refresh') === 'true'
  
  if (!pageId) {
    return NextResponse.json({ error: 'Page ID is required' }, { status: 400 })
  }
  
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  // Get page from database
  let page: any = null
  
  try {
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
      const { data: cachedConversations } = await supabaseAdmin!
        .from('conversations')
        .select('*')
        .eq('page_id', page.id)
        .order('last_message_time', { ascending: false })
        // Remove limit to show all conversations
      
      if (cachedConversations && cachedConversations.length > 0) {
        // Return cached data immediately
        return NextResponse.json({ 
          conversations: cachedConversations,
          source: 'cache',
          message: `Showing ${cachedConversations.length} cached conversations. Click refresh for latest.`
        })
      }
    }
    
    // Fetch fresh data from Facebook with pagination
    console.log('Fetching fresh conversations from Facebook...')
    
    let allConversations = []
    let nextUrl = `https://graph.facebook.com/v19.0/${page.facebook_page_id}/conversations?fields=participants,senders,updated_time,unread_count&limit=100&access_token=${page.access_token}`
    let pageCount = 0
    let totalFetched = 0
    
    // Fetch all conversations using pagination
    while (nextUrl) {
      pageCount++
      console.log(`Fetching page ${pageCount} from Facebook...`)
      
      const response = await fetch(nextUrl)
      const data = await response.json()
      
      if (data.error) {
        console.error('Facebook API Error:', data.error)
        break
      }
      
      if (data.data && data.data.length > 0) {
        allConversations.push(...data.data)
        totalFetched += data.data.length
        console.log(`Page ${pageCount}: Fetched ${data.data.length} conversations, total so far: ${totalFetched}`)
      }
      
      // Check for next page
      nextUrl = data.paging?.next || null
      
      // Add small delay to avoid rate limiting
      if (nextUrl) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
    
    console.log(`Pagination complete: ${pageCount} pages, ${totalFetched} total conversations fetched from Facebook`)
    
    // Process and save conversations
    const conversations = []
    
    if (allConversations && allConversations.length > 0) {
      // Use Promise.all for parallel processing
      const savePromises = allConversations.map(async (conv: any) => {
        const participant = conv.participants?.data?.find((p: any) => p.id !== page.facebook_page_id)
        
        if (participant) {
          const { data: savedConv } = await supabaseAdmin!
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
      message: `Fresh data loaded: ${conversations.length} conversations from Facebook`,
      paginationInfo: {
        pagesFetched: pageCount,
        totalConversationsFetched: totalFetched,
        finalCount: conversations.length
      }
    })
    
  } catch (error) {
    console.error('Error in conversations API:', error)
    
    // Return cached data on error
    const { data: cachedConversations } = await supabaseAdmin!
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
