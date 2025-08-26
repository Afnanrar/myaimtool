import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { cookies } from 'next/headers'
import jwt from 'jsonwebtoken'

export async function GET(req: NextRequest) {
  try {
    // Get auth token
    const cookieStore = cookies()
    const token = cookieStore.get('auth-token')
    
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Verify JWT token
    const decoded = jwt.verify(
      token.value,
      process.env.JWT_SECRET || 'your-secret-key-change-this'
    ) as any

    if (!decoded.userId) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Get user's pages first
    const { data: userPages, error: pagesError } = await supabaseAdmin!
      .from('pages')
      .select('id, facebook_page_id')
      .eq('user_id', decoded.userId)

    if (pagesError) {
      console.error('Error fetching user pages:', pagesError)
      return NextResponse.json({ error: 'Failed to fetch pages' }, { status: 500 })
    }

    const pageIds = userPages?.map(p => p.id) || []

    if (pageIds.length === 0) {
      // User has no pages, return zero stats
      return NextResponse.json({
        stats: {
          totalPages: 0,
          totalConversations: 0,
          totalBroadcasts: 0,
          recentMessages: 0
        }
      })
    }

    // Get conversations for user's pages
    const { data: conversations, error: convError } = await supabaseAdmin!
      .from('conversations')
      .select('id, participant_name, participant_id, facebook_conversation_id')
      .in('page_id', pageIds)
      .not('participant_name', 'is', null)
      .not('participant_id', 'eq', '')
      .not('participant_id', 'is', null)

    if (convError) {
      console.error('Error fetching conversations:', convError)
      return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 })
    }

    // Filter out placeholder conversations
    const realConversations = conversations?.filter(conv => {
      if (conv.participant_name === 'Facebook User' || 
          conv.participant_name === 'Unknown User' ||
          conv.participant_name === 'Test User') {
        return false
      }
      
      if (!conv.participant_id || !conv.facebook_conversation_id) {
        return false
      }
      
      return true
    }) || []

    // Get broadcasts for user's pages
    const { data: broadcasts, error: broadcastError } = await supabaseAdmin!
      .from('broadcasts')
      .select('id')
      .in('page_id', pageIds)

    if (broadcastError) {
      console.error('Error fetching broadcasts:', broadcastError)
      return NextResponse.json({ error: 'Failed to fetch broadcasts' }, { status: 500 })
    }

    // Get recent messages (last 24 hours) for user's pages
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: recentMessages, error: messagesError } = await supabaseAdmin!
      .from('messages')
      .select('id')
      .in('page_id', pageIds)
      .gte('created_at', twentyFourHoursAgo)

    if (messagesError) {
      console.error('Error fetching recent messages:', messagesError)
      return NextResponse.json({ error: 'Failed to fetch recent messages' }, { status: 500 })
    }

    const stats = {
      totalPages: userPages?.length || 0,
      totalConversations: realConversations.length,
      totalBroadcasts: broadcasts?.length || 0,
      recentMessages: recentMessages?.length || 0
    }

    console.log('Dashboard stats calculated:', stats)

    return NextResponse.json({ stats })

  } catch (error) {
    console.error('Error in dashboard stats API:', error)
    return NextResponse.json({ 
      error: 'Failed to load dashboard stats',
      stats: {
        totalPages: 0,
        totalConversations: 0,
        totalBroadcasts: 0,
        recentMessages: 0
      }
    }, { status: 500 })
  }
}
