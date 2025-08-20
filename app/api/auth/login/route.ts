import { NextResponse } from 'next/server'

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  
  console.log('Login route - baseUrl:', baseUrl)
  console.log('Login route - redirect_uri:', `${baseUrl}/api/auth/callback`)
  
  const params = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_FACEBOOK_APP_ID!,
    redirect_uri: `${baseUrl}/api/auth/callback`,
    scope: 'pages_show_list,pages_messaging,pages_read_engagement,pages_manage_metadata',
    response_type: 'code',
    state: crypto.randomUUID()
  })

  return NextResponse.redirect(
    `https://www.facebook.com/v19.0/dialog/oauth?${params}`
  )
}
