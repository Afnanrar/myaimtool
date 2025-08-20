import { NextResponse } from 'next/server'

export async function GET() {
  const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`
  
  if (!appId) {
    return NextResponse.json({ 
      error: 'Facebook App ID not configured'
    }, { status: 500 })
  }
  
  console.log('Login route - baseUrl:', process.env.NEXT_PUBLIC_APP_URL)
  console.log('Login route - redirect_uri:', redirectUri)
  
  // Request all necessary permissions
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    // Add all required permissions
    scope: [
      'email',
      'public_profile',
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_metadata',
      'pages_messaging', // This is crucial for messaging
      'pages_read_user_content'
    ].join(','),
    response_type: 'code',
    state: crypto.randomUUID()
  })

  const loginUrl = `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`
  console.log('Full OAuth URL:', loginUrl)
  
  return NextResponse.redirect(loginUrl)
}
