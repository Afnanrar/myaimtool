import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const pageId = searchParams.get('pageId')
  
  if (!pageId) {
    return NextResponse.json({ error: 'Page ID required' }, { status: 400 })
  }
  
  try {
    // Get all conversations for this page
    const { data: conversations } = await supabaseAdmin
      .from('conversations')
      .select('participant_id, last_message_time')
      .eq('page_id', pageId)
    
    const now = new Date()
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    
    let within24h = 0
    let after24h = 0
    
    if (conversations) {
      conversations.forEach(conv => {
        const lastMessage = new Date(conv.last_message_time)
        if (lastMessage > twentyFourHoursAgo) {
          within24h++
        } else {
          after24h++
        }
      })
    }
    
    const stats = {
      totalLeads: conversations?.length || 0,
      within24h,
      after24h,
      optedOut: 0, // You'd track this in your database
      blocked: 0, // You'd track this in your database
      eligible: conversations?.length || 0
    }
    
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
