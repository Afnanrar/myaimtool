import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST() {
  const cookieStore = cookies()
  
  // Clear the auth token
  cookieStore.delete('auth-token')
  
  return NextResponse.json({ message: 'Logged out successfully' })
}

export async function GET() {
  const cookieStore = cookies()
  
  // Clear the auth token
  cookieStore.delete('auth-token')
  
  // Redirect to login page
  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login`)
}
