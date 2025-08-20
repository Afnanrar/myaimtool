import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { cookies } from 'next/headers'
import jwt from 'jsonwebtoken'

export async function GET(req: NextRequest) {
  console.log('Auth callback started')
  console.log('Environment variables check:')
  console.log('FACEBOOK_APP_ID:', !!process.env.NEXT_PUBLIC_FACEBOOK_APP_ID)
  console.log('FACEBOOK_APP_SECRET:', !!process.env.FACEBOOK_APP_SECRET)
  console.log('JWT_SECRET:', !!process.env.JWT_SECRET)
  console.log('SUPABASE_URL:', !!process.env.NEXT_PUBLIC_SUPABASE_URL)
  console.log('SUPABASE_SERVICE_KEY:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)
  
  // Check if required environment variables are set
  if (!process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || !process.env.FACEBOOK_APP_SECRET || !process.env.JWT_SECRET) {
    console.log('Missing required environment variables')
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    return NextResponse.redirect(`${baseUrl}/login?error=service_not_configured`)
  }
  
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  
  if (!code) {
    console.log('No authorization code received')
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    return NextResponse.redirect(`${baseUrl}/login?error=no_code`)
  }

  try {
    console.log('Starting OAuth flow...')
    
    // Exchange code for access token
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    console.log('Callback route - baseUrl:', baseUrl)
    console.log('Callback route - redirect_uri:', `${baseUrl}/api/auth/callback`)
    
    const tokenResponse = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?` +
      `client_id=${process.env.NEXT_PUBLIC_FACEBOOK_APP_ID}` +
      `&redirect_uri=${baseUrl}/api/auth/callback` +
      `&client_secret=${process.env.FACEBOOK_APP_SECRET}` +
      `&code=${code}`
    )
    
    console.log('Token response status:', tokenResponse.status)
    const tokenData = await tokenResponse.json()
    console.log('Token response data:', tokenData)
    
    if (!tokenData.access_token) {
      throw new Error(`No access token received: ${JSON.stringify(tokenData)}`)
    }
    
    const { access_token } = tokenData
    
    // Get user info
    console.log('Fetching user info...')
    const userResponse = await fetch(
      `https://graph.facebook.com/v19.0/me?fields=id,name,email&access_token=${access_token}`
    )
    
    console.log('User response status:', userResponse.status)
    const userData = await userResponse.json()
    console.log('User data:', userData)
    
    if (!userData.id) {
      throw new Error(`No user ID received: ${JSON.stringify(userData)}`)
    }
    
    // Save user to database
    if (!supabaseAdmin) {
      throw new Error('Database not configured')
    }
    
    console.log('Saving user to database...')
    const { data: user, error: dbError } = await supabaseAdmin
      .from('users')
      .upsert({
        facebook_id: userData.id,
        name: userData.name,
        email: userData.email
      })
      .select()
      .single()
    
    if (dbError) {
      console.error('Database error:', dbError)
      throw new Error(`Database error: ${dbError.message}`)
    }
    
    console.log('User saved to database:', user)
    
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
    
    console.log('JWT token created')
    
    // Set cookie
    cookies().set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7 // 7 days
    })
    
    console.log('Cookie set, redirecting to dashboard...')
    return NextResponse.redirect(`${baseUrl}/dashboard`)
  } catch (error) {
    console.error('Auth error:', error)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    return NextResponse.redirect(`${baseUrl}/login?error=auth_failed`)
  }
}
