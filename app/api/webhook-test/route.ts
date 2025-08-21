import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  try {
    // Check if webhook is properly configured
    const { data: recentMessages } = await supabaseAdmin!
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5)
    
    const { data: pages } = await supabaseAdmin!
      .from('pages')
      .select('*')
    
    const { data: conversations } = await supabaseAdmin!
      .from('conversations')
      .select('*')
      .order('last_message_time', { ascending: false })
      .limit(5)
    
    return NextResponse.json({
      webhook_configured: !!process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN,
      verify_token_set: !!process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN,
      app_secret_set: !!process.env.FACEBOOK_APP_SECRET,
      recent_messages_count: recentMessages?.length || 0,
      pages_connected: pages?.length || 0,
      conversations_count: conversations?.length || 0,
      last_message: recentMessages?.[0] || null,
      last_conversation: conversations?.[0] || null,
      environment: {
        node_env: process.env.NODE_ENV,
        vercel_url: process.env.VERCEL_URL,
        has_supabase: !!supabaseAdmin
      }
    })
  } catch (error) {
    console.error('Webhook test error:', error)
    return NextResponse.json({
      error: 'Failed to check webhook status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
