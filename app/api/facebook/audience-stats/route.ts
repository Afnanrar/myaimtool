import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const pageId = searchParams.get('pageId')
  
  if (!pageId) {
    return NextResponse.json({ error: 'Page ID required' }, { status: 400 })
  }
  
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }
  
  try {
    // Get conversations exactly as the inbox does - only real user conversations
    const { data: conversations, error } = await supabaseAdmin
      .from('conversations')
      .select('participant_id, participant_name, last_message_time, facebook_conversation_id, page_id')
      .eq('page_id', pageId)
      .not('participant_name', 'is', null) // Exclude system/null conversations
      .not('participant_id', 'eq', pageId) // Exclude page itself
      .order('last_message_time', { ascending: false })
    
    if (error) {
      console.error('Database error:', error)
      throw error
    }
    
    // Apply the EXACT same filtering logic as the inbox
    const realConversations = conversations?.filter((conv: any) => {
      // Remove conversations with placeholder names (exactly as inbox does)
      if (conv.participant_name === 'Facebook User' || 
          conv.participant_name === 'Unknown User' ||
          conv.participant_name === 'Test User') {
        return false
      }
      
      // Remove conversations without proper participant information
      if (!conv.participant_id || !conv.facebook_conversation_id) {
        return false
      }
      
      // Ensure conversation belongs to the current page
      if (conv.page_id !== pageId) {
        return false
      }
      
      return true
    }) || []
    
    // Get unique participants only (in case there are still duplicates)
    const uniqueParticipants = new Map()
    realConversations.forEach(conv => {
      if (!uniqueParticipants.has(conv.participant_id)) {
        uniqueParticipants.set(conv.participant_id, conv)
      }
    })
    
    const uniqueConversations = Array.from(uniqueParticipants.values())
    
    // Log for debugging
    console.log('Raw conversations from DB:', conversations?.length)
    console.log('After filtering (real conversations):', realConversations.length)
    console.log('Unique participants:', uniqueConversations.length)
    console.log('Participants found:', uniqueConversations.map(c => ({
      name: c.participant_name,
      id: c.participant_id
    })))
    
    // Calculate time-based splits
    const now = new Date()
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    
    let within24h = 0
    let after24h = 0
    
    uniqueConversations.forEach(conv => {
      if (conv.last_message_time) {
        const lastMessage = new Date(conv.last_message_time)
        if (lastMessage > twentyFourHoursAgo) {
          within24h++
        } else {
          after24h++
        }
      } else {
        after24h++ // If no timestamp, consider it old
      }
    })
    
    const stats = {
      totalLeads: uniqueConversations.length, // Should match inbox count exactly
      within24h,
      after24h,
      optedOut: 0,
      blocked: 0,
      eligible: uniqueConversations.length
    }
    
    console.log('Final audience stats:', stats)
    
    return NextResponse.json({ stats })
  } catch (error: any) {
    console.error('Error loading audience stats:', error)
    return NextResponse.json({ 
      stats: {
        totalLeads: 0,
        within24h: 0,
        after24h: 0,
        optedOut: 0,
        blocked: 0,
        eligible: 0
      },
      error: error.message
    })
  }
}
