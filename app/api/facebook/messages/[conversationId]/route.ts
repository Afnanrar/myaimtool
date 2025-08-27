import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(
  req: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  try {
    if (!supabaseAdmin) {
      console.error('Supabase admin client not available')
      return NextResponse.json({ messages: [] }, { status: 500 })
    }

    const { data: messages } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('conversation_id', params.conversationId)
      .order('created_at', { ascending: true })
    
    return NextResponse.json({ messages: messages || [] })
  } catch (error) {
    console.error('Error fetching messages:', error)
    return NextResponse.json({ messages: [] }, { status: 500 })
  }
}
