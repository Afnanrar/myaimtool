import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { cookies } from 'next/headers'
import jwt from 'jsonwebtoken'

export async function GET(req: NextRequest) {
  console.log('Auth callback started')
  
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  
  if (error) {
    console.log('Facebook OAuth error:', error)
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login?error=${error}`)
  }
  
  if (!code) {
    console.log('No authorization code received')
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login?error=no_code`)
  }

  try {
    console.log('Starting OAuth flow...')
    
    // Exchange code for access token
    const tokenUrl = new URL('https://graph.facebook.com/v19.0/oauth/access_token')
    tokenUrl.searchParams.append('client_id', process.env.NEXT_PUBLIC_FACEBOOK_APP_ID!)
    tokenUrl.searchParams.append('redirect_uri', `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`)
    tokenUrl.searchParams.append('client_secret', process.env.FACEBOOK_APP_SECRET!)
    tokenUrl.searchParams.append('code', code)
    
    console.log('Token exchange URL:', tokenUrl.toString())
    
    const tokenResponse = await fetch(tokenUrl.toString())
    const tokenData = await tokenResponse.json()
    
    console.log('Token response:', tokenData)
    
    if (tokenData.error) {
      throw new Error(tokenData.error.message)
    }
    
    const { access_token } = tokenData
    
    // Get user info
    console.log('Fetching user info...')
    const userResponse = await fetch(
      `https://graph.facebook.com/v19.0/me?fields=id,name,email&access_token=${access_token}`
    )
    const userData = await userResponse.json()
    
    console.log('User data:', userData)
    
    if (!userData.id) {
      throw new Error('No user ID received from Facebook')
    }
    
    if (!supabaseAdmin) {
      throw new Error('Database not configured')
    }
    
    // Save or update user in database
    console.log('Saving user to database...')
    const { data: user, error: dbError } = await supabaseAdmin
      .from('users')
      .upsert({
        facebook_id: userData.id,
        name: userData.name,
        email: userData.email || null
      }, {
        onConflict: 'facebook_id'
      })
      .select()
      .single()
    
    if (dbError) {
      console.error('Database error:', dbError)
      // Continue with Facebook ID as user ID
      console.log('Using Facebook ID as fallback user ID')
      const token = jwt.sign(
        { 
          userId: userData.id, // Use Facebook ID as fallback
          facebookId: userData.id,
          name: userData.name,
          email: userData.email || '',
          accessToken: access_token
        },
        process.env.JWT_SECRET || 'your-secret-key-change-this',
        { expiresIn: '7d' }
      )
      
      cookies().set('auth-token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7
      })
      
      console.log('Fallback token created, redirecting to dashboard...')
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard`)
    }
    
    // Create JWT token with database user ID
    console.log('User saved successfully, creating JWT token...')
    const token = jwt.sign(
      { 
        userId: user.id, // Use database UUID
        facebookId: userData.id,
        name: userData.name,
        email: userData.email || '',
        accessToken: access_token
      },
      process.env.JWT_SECRET || 'your-secret-key-change-this',
      { expiresIn: '7d' }
    )
    
    console.log('JWT token created with database user ID:', user.id)
    
    cookies().set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7
    })
    
    console.log('Cookie set, redirecting to dashboard...')
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard`)
    
  } catch (error) {
    console.error('Auth error:', error)
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login?error=auth_failed`)
  }
}
