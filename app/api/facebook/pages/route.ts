import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import jwt from 'jsonwebtoken'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  console.log('Facebook Pages API called')
  
  const cookieStore = cookies()
  const token = cookieStore.get('auth-token')
  
  if (!token) {
    console.log('No auth token found')
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  
  try {
    console.log('Verifying JWT token...')
    const decoded = jwt.verify(
      token.value,
      process.env.JWT_SECRET || 'your-secret-key-change-this'
    ) as any
    
    console.log('Token decoded:', { userId: decoded.userId, hasAccessToken: !!decoded.accessToken })
    
    // Fetch pages from Facebook
    console.log('Fetching pages from Facebook Graph API...')
    const response = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,picture`,
      {
        headers: { Authorization: `Bearer ${decoded.accessToken}` }
      }
    )
    
    const data = await response.json()
    console.log('Facebook API response:', data)
    
    if (data.error) {
      console.error('Facebook API error:', data.error)
      return NextResponse.json({ error: 'Failed to fetch pages' }, { status: 400 })
    }
    
    if (!supabaseAdmin) {
      console.log('Database not configured')
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
    }
    
    // Save pages to database
    console.log('Saving pages to database...')
    const pages = []
    for (const page of data.data || []) {
      console.log('Processing page:', { id: page.id, name: page.name })
      
      const { data: savedPage, error: saveError } = await supabaseAdmin
        .from('pages')
        .upsert({
          user_id: decoded.userId,
          facebook_page_id: page.id,
          name: page.name,
          access_token: page.access_token
        })
        .select()
        .single()
      
      if (saveError) {
        console.error('Error saving page:', saveError)
      } else {
        pages.push(savedPage)
        console.log('Page saved successfully:', savedPage.id)
      }
    }
    
    console.log(`Successfully processed ${pages.length} pages`)
    return NextResponse.json({ pages })
  } catch (error) {
    console.error('Error fetching pages:', error)
    return NextResponse.json({ error: 'Failed to fetch pages' }, { status: 500 })
  }
}
