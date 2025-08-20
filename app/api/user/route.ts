import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import jwt from 'jsonwebtoken'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const cookieStore = cookies()
  const token = cookieStore.get('auth-token')
  
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  
  try {
    // Verify JWT token
    const decoded = jwt.verify(
      token.value,
      process.env.JWT_SECRET || 'your-secret-key-change-this'
    ) as any
    
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }
    
    // Get user info from database
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
    }
    
    let user = null
    
    // Try to find user by database ID first
    if (decoded.userId && decoded.userId !== decoded.facebookId) {
      const { data: dbUser } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('id', decoded.userId)
        .single()
      
      if (dbUser) {
        user = dbUser
      }
    }
    
    // If no database user found, try by Facebook ID
    if (!user && decoded.facebookId) {
      const { data: fbUser } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('facebook_id', decoded.facebookId)
        .single()
      
      if (fbUser) {
        user = fbUser
      }
    }
    
    // If still no user found, create a basic user object from JWT
    if (!user) {
      user = {
        id: decoded.userId || decoded.facebookId,
        facebook_id: decoded.facebookId,
        name: decoded.name,
        email: decoded.email
      }
    }
    
    return NextResponse.json({
      id: user.id,
      facebook_id: user.facebook_id,
      name: user.name,
      email: user.email,
      accessToken: decoded.accessToken
    })
    
  } catch (error) {
    console.error('Error in user API:', error)
    return NextResponse.json({ 
      error: 'Failed to get user info',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
