import { NextRequest, NextResponse } from 'next/server'
import { FacebookAPI } from '@/lib/facebook'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyAuth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  // Check if required environment variables are set
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Service not configured' }, { status: 500 })
  }
  
  const auth = await verifyAuth(req)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const fb = new FacebookAPI(auth.accessToken)
    const pagesData = await fb.getPages()
    
    // Store pages in database
    for (const page of pagesData.data) {
      await supabaseAdmin
        .from('pages')
        .upsert({
          user_id: auth.userId,
          facebook_page_id: page.id,
          name: page.name,
          access_token: page.access_token
        })
    }
    
    // Get stored pages
    const { data: pages } = await supabaseAdmin
      .from('pages')
      .select('*')
      .eq('user_id', auth.userId)
    
    return NextResponse.json({ pages: pages || [] })
  } catch (error) {
    console.error('Failed to fetch pages:', error)
    return NextResponse.json({ error: 'Failed to fetch pages' }, { status: 500 })
  }
}
