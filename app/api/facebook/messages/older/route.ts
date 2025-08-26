import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const conversationId = searchParams.get('conversationId')
  const oldestEventTime = searchParams.get('oldestEventTime')
  const pageSize = parseInt(searchParams.get('pageSize') || '30')
  
  if (!conversationId || !oldestEventTime) {
    return NextResponse.json({ error: 'Conversation ID and oldest event time are required' }, { status: 400 })
  }
  
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }
  
  try {
    // Load older messages (before the oldest currently loaded message)
    const { data: olderMessages, error } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .lt('event_time', oldestEventTime) // Get messages older than the oldest loaded
      .order('event_time', { ascending: true }) // Oldest first for proper prepending
      .limit(pageSize)
    
    if (error) {
      console.error('Error loading older messages:', error)
      return NextResponse.json({ error: 'Failed to load older messages' }, { status: 500 })
    }
    
    // Check if there are more messages to load
    const { count: totalOlder } = await supabaseAdmin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .lt('event_time', oldestEventTime)
    
    const hasMore = totalOlder > pageSize
    
    return NextResponse.json({
      messages: olderMessages || [],
      hasMore,
      totalOlder: totalOlder || 0,
      pageSize
    })
    
  } catch (error) {
    console.error('Error in older messages API:', error)
    return NextResponse.json({ 
      error: 'Failed to load older messages',
      messages: [],
      hasMore: false
    }, { status: 500 })
  }
}
