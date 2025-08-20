import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { conversationId } = await req.json()

    if (!conversationId) {
      return NextResponse.json({ error: 'Conversation ID is required' }, { status: 400 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
    }

    // Mark all customer messages in this conversation as read
    const { error: updateError } = await supabaseAdmin
      .from('messages')
      .update({ is_read: true })
      .eq('conversation_id', conversationId)
      .eq('is_from_page', false) // Only mark customer messages as read

    if (updateError) {
      console.error('Error marking messages as read:', updateError)
      return NextResponse.json({ error: 'Failed to mark messages as read' }, { status: 500 })
    }

    console.log('Messages marked as read for conversation:', conversationId)

    return NextResponse.json({ 
      success: true, 
      message: 'Messages marked as read',
      conversationId 
    })

  } catch (error) {
    console.error('Error in mark-read API:', error)
    return NextResponse.json({
      error: 'Failed to mark messages as read',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
