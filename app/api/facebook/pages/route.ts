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
    
    console.log('Fetching pages with token:', decoded.accessToken ? 'Present' : 'Missing')
    
    // First, let's check what permissions we have
    const permissionsResponse = await fetch(
      `https://graph.facebook.com/v19.0/me/permissions`,
      {
        headers: { Authorization: `Bearer ${decoded.accessToken}` }
      }
    )
    
    const permissions = await permissionsResponse.json()
    console.log('Current permissions:', permissions)
    
    // Fetch pages from Facebook with more detailed fields
    const response = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,picture,tasks,category,fan_count`,
      {
        headers: { Authorization: `Bearer ${decoded.accessToken}` }
      }
    )
    
    const data = await response.json()
    console.log('Facebook API Response:', data)
    
    if (data.error) {
      console.error('Facebook API error:', data.error)
      return NextResponse.json({ 
        error: data.error.message,
        type: data.error.type,
        code: data.error.code,
        permissions: permissions.data
      }, { status: 400 })
    }
    
    if (!data.data || data.data.length === 0) {
      return NextResponse.json({ 
        error: 'No pages found',
        message: 'Make sure you have admin access to at least one Facebook Page and the app has pages_messaging permission',
        permissions: permissions.data,
        debug: {
          hasData: !!data.data,
          dataLength: data.data?.length || 0
        }
      }, { status: 404 })
    }
    
    if (!supabaseAdmin) {
      console.log('Database not configured')
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
    }
    
    // Save pages to database
    const pages = []
    for (const page of data.data) {
      try {
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
        
        if (!saveError && savedPage) {
          pages.push(savedPage)
        }
      } catch (err) {
        console.error('Error saving page:', err)
      }
    }
    
    return NextResponse.json({ 
      pages,
      permissions: permissions.data,
      rawPages: data.data // Include raw data for debugging
    })
  } catch (error) {
    console.error('Error fetching pages:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch pages',
      details: error.message 
    }, { status: 500 })
  }
}
