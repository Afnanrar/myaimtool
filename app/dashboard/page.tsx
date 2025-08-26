'use client'

import { useState, useEffect } from 'react'
import { Users, MessageSquare, Send, TrendingUp, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [stats, setStats] = useState({
    totalPages: 0,
    totalConversations: 0,
    totalBroadcasts: 0,
    recentMessages: 0
  })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [webhookStatus, setWebhookStatus] = useState('Checking...')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const router = useRouter()
  
  useEffect(() => {
    loadUserAndStats()
    checkWebhookStatus()
    
    // Note: Real-time subscriptions removed to prevent conflicts
    // Stats are updated via manual refresh and periodic polling
  }, [])

  // Periodic refresh as backup (every 30 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!refreshing) {
        console.log('Periodic stats refresh...')
        loadStats()
      }
    }, 30000) // 30 seconds

    return () => clearInterval(interval)
  }, [refreshing])
  
  const loadUserAndStats = async () => {
    try {
      // Get user info
      const response = await fetch('/api/user')
      if (!response.ok) {
        console.error('User API failed:', response.status, response.statusText)
        router.push('/login')
        return
      }
      const userData = await response.json()
      setUser(userData)
      
      // Load stats
      await loadStats()
    } catch (error) {
      console.error('Failed to load data:', error)
      // Don't redirect on network errors, just show empty state
    } finally {
      setLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      setRefreshing(true)
      
      // Get stats from the dedicated API endpoint
      const response = await fetch('/api/dashboard/stats')
      if (!response.ok) {
        console.error('Stats API failed:', response.status, response.statusText)
        // Keep existing stats if API fails
        return
      }
      
      const data = await response.json()
      
      if (data.stats) {
        setStats(data.stats)
        setLastUpdated(new Date())
        console.log('Stats updated:', data.stats)
      } else {
        console.error('Invalid stats response:', data)
      }
    } catch (error) {
      console.error('Failed to load stats:', error)
      // Keep existing stats if request fails
    } finally {
      setRefreshing(false)
    }
  }
  
  // Check webhook status
  const checkWebhookStatus = async () => {
    try {
      const response = await fetch('/api/webhook-test')
      const data = await response.json()
      
      // Check if we've received messages recently
      if (data.recent_messages_count > 0) {
        setWebhookStatus('Active')
      } else if (data.webhook_configured) {
        setWebhookStatus('Configured')
      } else {
        setWebhookStatus('Pending Setup')
      }
    } catch (error) {
      setWebhookStatus('Error')
      console.error('Webhook status check failed:', error)
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
    <div className="min-h-screen bg-gray-50">
      <div className="p-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-gray-600 mt-2">Welcome back, {user?.name || 'User'}</p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={loadStats}
                disabled={refreshing}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Updating...' : 'Refresh Stats'}
              </button>
              {lastUpdated && (
                <div className="text-sm text-gray-500">
                  Last updated: {lastUpdated.toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>
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
                    <div className="flex items-center mt-2">
                      <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                      {refreshing && (
                        <RefreshCw className="h-4 w-4 text-blue-500 ml-2 animate-spin" />
                      )}
                    </div>
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
            <h2 className="text-xl font-bold text-gray-900 mb-6">Quick Actions</h2>
            <div className="space-y-4">
              <a
                href="/dashboard/inbox"
                className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >
                <MessageSquare className="h-5 w-5 text-blue-600 mr-3" />
                <div>
                  <p className="font-medium text-gray-900">View Inbox</p>
                  <p className="text-sm text-gray-600">Manage conversations and reply to messages</p>
                </div>
              </a>
              
              <a
                href="/dashboard/broadcast"
                className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >
                <Send className="h-5 w-5 text-purple-600 mr-3" />
                <div>
                  <p className="font-medium text-gray-900">Send Broadcast</p>
                  <p className="text-sm text-gray-600">Send bulk messages to your audience</p>
                </div>
              </a>
              
              <a
                href="/dashboard/settings"
                className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >
                <Users className="h-5 w-5 text-green-600 mr-3" />
                <div>
                  <p className="font-medium text-gray-900">Manage Pages</p>
                  <p className="text-sm text-gray-600">Connect or disconnect Facebook pages</p>
                </div>
              </a>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">System Status</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-700">Facebook API</span>
                <span className="px-2 py-1 bg-green-100 text-green-800 text-sm rounded">Connected</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-700">Database</span>
                <span className="px-2 py-1 bg-green-100 text-green-800 text-sm rounded">Active</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-700">Webhook</span>
                <span className={`px-2 py-1 text-sm rounded ${
                  webhookStatus === 'Active' ? 'bg-green-100 text-green-800' : 
                  webhookStatus === 'Configured' ? 'bg-blue-100 text-blue-800' :
                  webhookStatus === 'Error' ? 'bg-red-100 text-red-800' :
                  'bg-yellow-100 text-yellow-800'
                }`}>
                  {webhookStatus}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-700">Stats Auto-Update</span>
                <span className="px-2 py-1 bg-green-100 text-green-800 text-sm rounded">Active</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
