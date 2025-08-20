import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { cookies } from 'next/headers'
import jwt from 'jsonwebtoken'

export async function GET(req: NextRequest) {
  // Check if required environment variables are set
  if (!process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || !process.env.FACEBOOK_APP_SECRET || !process.env.JWT_SECRET) {
    return NextResponse.redirect('/login?error=service_not_configured')
  }
  
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  
  if (!code) {
    return NextResponse.redirect('/login?error=no_code')
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?` +
      `client_id=${process.env.NEXT_PUBLIC_FACEBOOK_APP_ID}` +
      `&redirect_uri=${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback` +
      `&client_secret=${process.env.FACEBOOK_APP_SECRET}` +
      `&code=${code}`
    )
    
    const { access_token } = await tokenResponse.json()
    
    // Get user info
    const userResponse = await fetch(
      `https://graph.facebook.com/v19.0/me?fields=id,name,email&access_token=${access_token}`
    )
    const userData = await userResponse.json()
    
    // Save user to database
    if (!supabaseAdmin) {
      throw new Error('Database not configured')
    }
    
    const { data: user } = await supabaseAdmin
      .from('users')
      .upsert({
        facebook_id: userData.id,
        name: userData.name,
        email: userData.email
      })
      .select()
      .single()
    
    // Create JWT token
    const token = jwt.sign(
      { 
        userId: user.id,
        facebookId: userData.id,
        accessToken: access_token
      },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    )
    
    // Set cookie
    cookies().set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7 // 7 days
    })
    
    return NextResponse.redirect('/dashboard')
  } catch (error) {
    console.error('Auth error:', error)
    return NextResponse.redirect('/login?error=auth_failed')
  }
}
