import { NextRequest, NextResponse } from 'next/server'
import { FacebookAPI } from '@/lib/facebook'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyAuth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  console.log('Conversations API called')
  
  // Check if required environment variables are set
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('Service not configured - missing env vars')
    return NextResponse.json({ error: 'Service not configured' }, { status: 500 })
  }
  
  const { searchParams } = new URL(req.url)
  const pageId = searchParams.get('pageId')
  console.log('Page ID requested:', pageId)
  
  try {
    const auth = await verifyAuth(req)
    console.log('Auth result:', auth)
    
    if (!auth) {
      console.log('Unauthorized request')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    if (!supabaseAdmin) {
      console.log('Database not configured')
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
    }
    
    // Get page access token from database
    console.log('Looking up page in database...')
    const { data: page, error: pageError } = await supabaseAdmin
      .from('pages')
      .select('access_token, facebook_page_id')
      .eq('id', pageId)
      .eq('user_id', auth.userId)
      .single()
    
    if (pageError) {
      console.error('Page lookup error:', pageError)
      return NextResponse.json({ error: 'Page lookup failed' }, { status: 500 })
    }
    
    if (!page) {
      console.log('Page not found')
      return NextResponse.json({ error: 'Page not found' }, { status: 404 })
    }
    
    console.log('Page found:', { facebook_page_id: page.facebook_page_id, has_token: !!page.access_token })
    
    const fb = new FacebookAPI(page.access_token)
    console.log('Fetching conversations from Facebook...')
    const conversations = await fb.getConversations(page.facebook_page_id, page.access_token)
    
    console.log('Facebook conversations response:', conversations)
    
    // Store conversations in database
    if (conversations.data && conversations.data.length > 0) {
      console.log('Storing conversations in database...')
      for (const conv of conversations.data) {
        await supabaseAdmin
          .from('conversations')
          .upsert({
            page_id: pageId,
            facebook_conversation_id: conv.id,
            participant_id: conv.participants.data[0].id,
            participant_name: conv.participants.data[0].name,
            last_message_time: conv.updated_time
          })
      }
    }
    
    return NextResponse.json(conversations)
  } catch (error) {
    console.error('Conversations API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
