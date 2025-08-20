'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Users, MessageSquare, Send, TrendingUp } from 'lucide-react'

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalPages: 0,
    totalConversations: 0,
    totalBroadcasts: 0,
    recentMessages: 0
  })
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    loadStats()
  }, [])
  
  const loadStats = async () => {
    if (!supabase) {
      setLoading(false)
      return
    }
    
    try {
      // Get user ID from auth
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) return
      
      // Fetch statistics
      const [pages, conversations, broadcasts, messages] = await Promise.all([
        supabase.from('pages').select('id', { count: 'exact' }).eq('user_id', user.id),
        supabase.from('conversations').select('id', { count: 'exact' }),
        supabase.from('broadcasts').select('id', { count: 'exact' }),
        supabase.from('messages')
          .select('id', { count: 'exact' })
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      ])
      
      setStats({
        totalPages: pages.count || 0,
        totalConversations: conversations.count || 0,
        totalBroadcasts: broadcasts.count || 0,
        recentMessages: messages.count || 0
      })
    } catch (error) {
      console.error('Failed to load stats:', error)
    } finally {
      setLoading(false)
    }
  }
  
  const statCards = [
    {
      title: 'Connected Pages',
      value: stats.totalPages,
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100'
    },
    {
      title: 'Total Conversations',
      value: stats.totalConversations,
      icon: MessageSquare,
      color: 'text-green-600',
      bgColor: 'bg-green-100'
    },
    {
      title: 'Broadcasts Sent',
      value: stats.totalBroadcasts,
      icon: Send,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100'
    },
    {
      title: 'Messages (24h)',
      value: stats.recentMessages,
      icon: TrendingUp,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100'
    }
  ]
  
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-2">Manage your Facebook Page conversations</p>
      </div>
      
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow p-6">
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                <div className="h-8 bg-gray-200 rounded w-3/4"></div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((stat, index) => (
            <div key={index} className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                  <p className="text-2xl font-bold mt-2">{stat.value}</p>
                </div>
                <div className={`p-3 rounded-full ${stat.bgColor}`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      <div className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
          <div className="space-y-4">
            <a
              href="/dashboard/inbox"
              className="flex items-center p-4 border rounded-lg hover:bg-gray-50 transition"
            >
              <MessageSquare className="h-5 w-5 text-blue-600 mr-3" />
              <div>
                <p className="font-medium">View Inbox</p>
                <p className="text-sm text-gray-600">Manage conversations and reply to messages</p>
              </div>
            </a>
            
            <a
              href="/dashboard/broadcast"
              className="flex items-center p-4 border rounded-lg hover:bg-gray-50 transition"
            >
              <Send className="h-5 w-5 text-purple-600 mr-3" />
              <div>
                <p className="font-medium">Send Broadcast</p>
                <p className="text-sm text-gray-600">Send bulk messages to your audience</p>
              </div>
            </a>
            
            <a
              href="/dashboard/settings"
              className="flex items-center p-4 border rounded-lg hover:bg-gray-50 transition"
            >
              <Users className="h-5 w-5 text-green-600 mr-3" />
              <div>
                <p className="font-medium">Manage Pages</p>
                <p className="text-sm text-gray-600">Connect or disconnect Facebook pages</p>
              </div>
            </a>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
          <RecentActivity />
        </div>
      </div>
    </div>
  )
}

interface Activity {
  id: string
  message_text: string
  created_at: string
  is_from_page: boolean
  conversation?: {
    participant_name: string
  }
}

function RecentActivity() {
  const [activities, setActivities] = useState<Activity[]>([])
  
  useEffect(() => {
    loadRecentActivity()
  }, [])
  
  const loadRecentActivity = async () => {
    if (!supabase) return
    
    const { data } = await supabase
      .from('messages')
      .select(`
        id,
        message_text,
        created_at,
        is_from_page
      `)
      .order('created_at', { ascending: false })
      .limit(5)
    
    if (data) {
      const formattedData = data.map(item => ({
        id: item.id,
        message_text: item.message_text,
        created_at: item.created_at,
        is_from_page: item.is_from_page,
        conversation: {
          participant_name: 'User'
        }
      }))
      setActivities(formattedData)
    } else {
      setActivities([])
    }
  }
  
  return (
    <div className="space-y-4">
      {activities.length === 0 ? (
        <p className="text-gray-500 text-center py-4">No recent activity</p>
      ) : (
        activities.map((activity) => (
          <div key={activity.id} className="flex items-start space-x-3">
            <div className={`w-2 h-2 rounded-full mt-2 ${
              activity.is_from_page ? 'bg-blue-500' : 'bg-green-500'
            }`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">
                {activity.is_from_page ? 'You sent' : `${activity.conversation?.participant_name || 'User'} sent`}
              </p>
              <p className="text-sm text-gray-600 truncate">{activity.message_text}</p>
              <p className="text-xs text-gray-400 mt-1">
                {new Date(activity.created_at).toLocaleString()}
              </p>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
