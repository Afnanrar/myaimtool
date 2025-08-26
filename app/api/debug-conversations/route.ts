import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }
  
  try {
    // Get all conversations to see what's in the database
    const { data: allConversations, error } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    // Group by page
    const byPage: any = {}
    allConversations?.forEach(conv => {
      if (!byPage[conv.page_id]) {
        byPage[conv.page_id] = []
      }
      byPage[conv.page_id].push({
        id: conv.id,
        participant_id: conv.participant_id,
        participant_name: conv.participant_name,
        facebook_conversation_id: conv.facebook_conversation_id,
        page_id: conv.page_id,
        last_message: conv.last_message_time,
        created_at: conv.created_at
      })
    })
    
    // Get unique participants per page
    const stats: any = {}
    Object.keys(byPage).forEach(pageId => {
      const convs = byPage[pageId]
      
      // Apply the same filtering logic as inbox
      const realConversations = convs.filter((conv: any) => {
        // Remove conversations with placeholder names
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
      })
      
      const unique = new Set(realConversations.map((c: any) => c.participant_id))
      
      stats[pageId] = {
        total_records: convs.length,
        filtered_records: realConversations.length,
        unique_participants: unique.size,
        participants: Array.from(unique),
        placeholder_names: convs.filter((c: any) => 
          c.participant_name === 'Facebook User' || 
          c.participant_name === 'Unknown User' ||
          c.participant_name === 'Test User'
        ).length,
        missing_participant_id: convs.filter((c: any) => !c.participant_id).length,
        missing_facebook_id: convs.filter((c: any) => !c.facebook_conversation_id).length
      }
    })
    
    // Get pages info
    const { data: pages } = await supabaseAdmin
      .from('pages')
      .select('id, facebook_page_id, name')
    
    return NextResponse.json({
      total_conversations: allConversations?.length || 0,
      pages: pages || [],
      by_page: byPage,
      stats,
      raw_data: allConversations?.slice(0, 10) // First 10 for debugging
    })
  } catch (error: any) {
    console.error('Error in debug endpoint:', error)
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 })
  }
}
