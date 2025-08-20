'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Users, Trash2, RefreshCw } from 'lucide-react'

interface Page {
  id: string
  name: string
  access_token: string
  created_at: string
}

export default function SettingsPage() {
  const [pages, setPages] = useState<Page[]>([])
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    loadPages()
  }, [])
  
  const loadPages = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      
      const { data } = await supabase
        .from('pages')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      
      setPages(data || [])
    } catch (error) {
      console.error('Failed to load pages:', error)
    } finally {
      setLoading(false)
    }
  }
  
  const disconnectPage = async (pageId: string) => {
    try {
      await supabase
        .from('pages')
        .delete()
        .eq('id', pageId)
      
      setPages(pages.filter(p => p.id !== pageId))
    } catch (error) {
      console.error('Failed to disconnect page:', error)
    }
  }
  
  const refreshPages = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/facebook/pages')
      if (response.ok) {
        await loadPages()
      }
    } catch (error) {
      console.error('Failed to refresh pages:', error)
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-2">Manage your connected pages and account settings</p>
      </div>
      
      <div className="max-w-4xl">
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Connected Facebook Pages</h2>
            <button
              onClick={refreshPages}
              disabled={loading}
              className="flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh Pages
            </button>
          </div>
          
          {loading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-16 bg-gray-200 rounded-lg"></div>
                </div>
              ))}
            </div>
          ) : pages.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Users className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No pages connected yet</p>
              <a
                href="/api/auth/login"
                className="inline-block mt-2 px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                Connect Your First Page
              </a>
            </div>
          ) : (
            <div className="space-y-4">
              {pages.map((page) => (
                <div key={page.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center">
                    <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold mr-3">
                      {page.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium">{page.name}</p>
                      <p className="text-sm text-gray-500">Connected {new Date(page.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => disconnectPage(page.id)}
                    className="flex items-center px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Disconnect
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Account Information</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                App URL
              </label>
              <p className="text-sm text-gray-900 bg-gray-50 p-3 rounded-lg">
                {process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Webhook URL
              </label>
              <p className="text-sm text-gray-900 bg-gray-50 p-3 rounded-lg">
                {process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/webhook
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Use this URL in your Facebook App settings to receive real-time messages
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
