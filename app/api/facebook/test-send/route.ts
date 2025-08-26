import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { conversationId, pageId } = await req.json()
    
    if (!conversationId || !pageId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
    }
    
    // Get conversation and page details
    const { data: conversation } = await supabaseAdmin
      .from('conversations')
      .select(`
        *,
        pages!inner(
          access_token,
          facebook_page_id
        )
      `)
      .eq('id', conversationId)
      .single()
    
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }
    
    // Test Facebook API configuration
    const testData = {
      conversation: {
        id: conversation.id,
        participant_id: conversation.participant_id,
        participant_name: conversation.participant_name,
        facebook_conversation_id: conversation.facebook_conversation_id
      },
      page: {
        id: conversation.pages.facebook_page_id,
        access_token: conversation.pages.access_token ? 'Present' : 'Missing'
      },
      environment: {
        FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET ? 'Set' : 'Missing',
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Set' : 'Missing',
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'Missing'
      }
    }
    
    // Test Facebook API call
    try {
      const testMessage = 'Test message from MyAim My Dream'
      const response = await fetch(
        `https://graph.facebook.com/v19.0/me/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${conversation.pages.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            recipient: { id: conversation.participant_id },
            message: { text: testMessage },
            messaging_type: 'RESPONSE'
          })
        }
      )
      
      const result = await response.json()
      
      return NextResponse.json({
        success: true,
        testData,
        facebookApiTest: {
          status: response.status,
          statusText: response.statusText,
          result
        }
      })
      
    } catch (facebookError: any) {
      return NextResponse.json({
        success: false,
        testData,
        facebookApiError: facebookError.message
      })
    }
    
  } catch (error: any) {
    console.error('Error in test endpoint:', error)
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 })
  }
}
