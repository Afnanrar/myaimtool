import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured' })
    }
    
    // Get the first page from database
    const { data: pages } = await supabaseAdmin
      .from('pages')
      .select('*')
      .limit(1)
    
    if (!pages || pages.length === 0) {
      return NextResponse.json({ error: 'No pages found' })
    }
    
    const page = pages[0]
    
    // Try to fetch conversations
    const url = `https://graph.facebook.com/v19.0/${page.facebook_page_id}/conversations?access_token=${page.access_token}`
    
    console.log('Testing conversations API for page:', page.name)
    console.log('Facebook Page ID:', page.facebook_page_id)
    console.log('Has access token:', !!page.access_token)
    
    const response = await fetch(url)
    const data = await response.json()
    
    console.log('Test conversations response:', data)
    
    return NextResponse.json({
      pageId: page.facebook_page_id,
      pageName: page.name,
      conversations: data,
      error: data.error,
      responseStatus: response.status,
      hasData: !!data.data,
      dataLength: data.data?.length || 0
    })
  } catch (error) {
    console.error('Test conversations error:', error)
    return NextResponse.json({ 
      error: 'Test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}
