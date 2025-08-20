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
    const decoded = jwt.verify(
      token.value,
      process.env.JWT_SECRET || 'your-secret-key-change-this'
    ) as any
    
    console.log('Decoded token:', { userId: decoded.userId, facebookId: decoded.facebookId })
    
    // Fetch pages from Facebook
    const response = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,picture,fan_count`,
      {
        headers: { Authorization: `Bearer ${decoded.accessToken}` }
      }
    )
    
    const data = await response.json()
    console.log('Facebook API Response:', data)
    
    if (data.error) {
      return NextResponse.json({ 
        error: data.error.message
      }, { status: 400 })
    }
    
    if (!data.data || data.data.length === 0) {
      return NextResponse.json({ 
        error: 'No pages found'
      }, { status: 404 })
    }
    
    if (!supabaseAdmin) {
      console.log('Database not configured')
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
    }
    
    // First, try to find the user by facebook_id
    let dbUserId = decoded.userId
    
    // Check if userId is a UUID or Facebook ID
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dbUserId)
    
    if (!isUUID) {
      console.log('UserId is not a UUID, looking up database user...')
      // It's a Facebook ID, find the actual database user
      const { data: dbUser } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('facebook_id', decoded.facebookId)
        .single()
      
      if (dbUser) {
        dbUserId = dbUser.id
        console.log('Found database user:', dbUserId)
      } else {
        console.log('Creating new database user...')
        // Create user if doesn't exist
        const { data: newUser } = await supabaseAdmin
          .from('users')
          .insert({
            facebook_id: decoded.facebookId,
            name: decoded.name,
            email: decoded.email || null
          })
          .select()
          .single()
        
        if (newUser) {
          dbUserId = newUser.id
          console.log('New user created:', dbUserId)
        }
      }
    } else {
      console.log('UserId is already a UUID:', dbUserId)
    }
    
    // Save pages to database
    const pages = []
    for (const page of data.data) {
      try {
        const { data: savedPage, error: saveError } = await supabaseAdmin
          .from('pages')
          .upsert({
            user_id: dbUserId,
            facebook_page_id: page.id,
            name: page.name,
            access_token: page.access_token
          }, {
            onConflict: 'facebook_page_id'
          })
          .select()
          .single()
        
        if (!saveError && savedPage) {
          pages.push(savedPage)
          console.log('Page saved successfully:', page.name)
        } else if (saveError) {
          console.error('Error saving page:', saveError)
        }
      } catch (err) {
        console.error('Error saving page:', err)
      }
    }
    
    return NextResponse.json({ 
      pages,
      rawPages: data.data,
      message: pages.length > 0 ? 'Pages connected successfully!' : 'Pages found but not saved'
    })
  } catch (error) {
    console.error('Error fetching pages:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch pages',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
