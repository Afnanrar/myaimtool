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
    // Get all conversations for this page
    const { data: conversations } = await supabaseAdmin!
      .from('conversations')
      .select('participant_id, last_message_time, page_id')
      .eq('page_id', pageId)
    
    if (!conversations) {
      return NextResponse.json({ 
        stats: {
          totalLeads: 0,
          within24h: 0,
          after24h: 0,
          optedOut: 0,
          blocked: 0,
          eligible: 0
        }
      })
    }
    
    const now = new Date()
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    
    let within24h = 0
    let after24h = 0
    
    conversations.forEach(conv => {
      if (conv.last_message_time) {
        const lastMessage = new Date(conv.last_message_time)
        if (lastMessage > twentyFourHoursAgo) {
          within24h++
        } else {
          after24h++
        }
      } else {
        // If no last message time, count as after 24h
        after24h++
      }
    })
    
    const stats = {
      totalLeads: conversations.length,
      within24h,
      after24h,
      optedOut: 0, // You'd track this in your database
      blocked: 0, // You'd track this in your database
      eligible: conversations.length
    }
    
    console.log(`Audience stats for page ${pageId}:`, stats)
    
    return NextResponse.json({ stats })
  } catch (error) {
    console.error('Error loading audience stats:', error)
    return NextResponse.json({ 
      stats: {
        totalLeads: 0,
        within24h: 0,
        after24h: 0,
        optedOut: 0,
        blocked: 0,
        eligible: 0
      }
    })
  }
}
