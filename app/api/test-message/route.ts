import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
    }
    
    // Get a page and conversation to test with
    const { data: page } = await supabaseAdmin
      .from('pages')
      .select('*')
      .single()
    
    if (!page) {
      return NextResponse.json({ error: 'No page found' }, { status: 404 })
    }
    
    const { data: conversation } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('page_id', page.id)
      .single()
    
    if (!conversation) {
      return NextResponse.json({ error: 'No conversation found for this page' }, { status: 404 })
    }
    
    // Try to send a test message
    const testMessage = 'Test message from MyAim My Dream API'
    
    const response = await fetch(
      `https://graph.facebook.com/v19.0/me/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: { id: conversation.participant_id },
          message: { text: testMessage },
          messaging_type: 'RESPONSE',
          access_token: page.access_token
        })
      }
    )
    
    const result = await response.json()
    
    return NextResponse.json({
      page: page.name,
      recipient: conversation.participant_name,
      recipient_id: conversation.participant_id,
      result,
      success: !result.error,
      test_message: testMessage
    })
    
  } catch (error: any) {
    console.error('Error in test message endpoint:', error)
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 })
  }
}
