import { NextRequest, NextResponse } from 'next/server'
import { FacebookAPI } from '@/lib/facebook'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyAuth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  // Check if required environment variables are set
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Service not configured' }, { status: 500 })
  }
  
  const { searchParams } = new URL(req.url)
  const pageId = searchParams.get('pageId')
  
  const auth = await verifyAuth(req)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }
  
  // Get page access token from database
  const { data: page } = await supabaseAdmin
    .from('pages')
    .select('access_token, facebook_page_id')
    .eq('id', pageId)
    .eq('user_id', auth.userId)
    .single()
  
  if (!page) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 })
  }
  
  const fb = new FacebookAPI(page.access_token)
  const conversations = await fb.getConversations(page.facebook_page_id, page.access_token)
  
  // Store conversations in database
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
  
  return NextResponse.json(conversations)
}
