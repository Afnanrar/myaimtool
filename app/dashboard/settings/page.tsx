'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Page {
  id: string
  name: string
  facebook_page_id: string
  access_token: string
  created_at: string
}

export default function SettingsPage() {
  const [pages, setPages] = useState<Page[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [debugInfo, setDebugInfo] = useState<any>(null)
  const router = useRouter()
  
  useEffect(() => {
    loadPages()
  }, [])
  
  const loadPages = async () => {
    setLoading(true)
    try {
      console.log('Loading pages from API...')
      const response = await fetch('/api/facebook/pages')
      const data = await response.json()
      
      console.log('Pages API Response:', data)
      
      if (!response.ok) {
        if (response.status === 401) {
          console.log('Unauthorized, redirecting to login')
          router.push('/login')
          return
        }
        
        setMessage(data.error || 'Failed to load pages')
        setDebugInfo(data)
        return
      }
      
      if (data.pages && data.pages.length > 0) {
        setPages(data.pages)
        setMessage(`Found ${data.pages.length} page(s)`)
      } else if (data.rawPages && data.rawPages.length > 0) {
        // Pages exist but couldn't be saved
        setMessage(`Found ${data.rawPages.length} page(s) but couldn't save to database`)
        setDebugInfo(data)
      } else {
        setMessage('No pages found. Check the debug info below.')
        setDebugInfo(data)
      }
    } catch (error: any) {
      console.error('Error loading pages:', error)
      setMessage('Failed to load pages: ' + error.message)
    } finally {
      setLoading(false)
    }
  }
  
  const connectPages = async () => {
    setLoading(true)
    setMessage('')
    
    try {
      console.log('Connecting to Facebook pages...')
      const response = await fetch('/api/facebook/pages')
      const data = await response.json()
      
      if (data.pages && data.pages.length > 0) {
        setPages(data.pages)
        setMessage(`Successfully connected ${data.pages.length} page(s)!`)
        console.log('Pages connected successfully:', data.pages)
      } else {
        setMessage('No pages found. Make sure you have admin access to at least one Facebook Page.')
        console.log('No pages found in response')
      }
    } catch (error: any) {
      console.error('Error connecting pages:', error)
      setMessage('Failed to connect pages. Please try again.')
    } finally {
      setLoading(false)
    }
  }
  
  const reauthorize = () => {
    // Force re-login with correct permissions
    window.location.href = '/api/auth/logout'
  }
  
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Settings - Manage Pages</h1>
      
      {message && (
        <div className={`p-4 rounded mb-4 ${
          message.includes('Found') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {message}
        </div>
      )}
      
      {debugInfo && (
        <div className="bg-gray-100 p-4 rounded mb-4">
          <h3 className="font-semibold mb-2">Debug Information:</h3>
          <pre className="text-xs overflow-auto">
            {JSON.stringify(debugInfo, null, 2)}
          </pre>
          
          {debugInfo.permissions && (
            <div className="mt-4">
              <h4 className="font-semibold">Current Permissions:</h4>
              <ul className="text-sm">
                {debugInfo.permissions.map((perm: any) => (
                  <li key={perm.permission}>
                    {perm.permission}: {perm.status}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Connected Pages</h2>
        
        {pages.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 mb-4">No pages connected yet</p>
            <div className="space-y-2">
              <button
                onClick={loadPages}
                disabled={loading}
                className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 mr-2"
              >
                {loading ? 'Loading...' : 'Retry Loading Pages'}
              </button>
              <button
                onClick={reauthorize}
                className="px-6 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Re-authorize with Facebook
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {pages.map((page) => (
              <div key={page.id} className="flex items-center justify-between p-4 border rounded">
                <div>
                  <h3 className="font-medium">{page.name}</h3>
                  <p className="text-sm text-gray-500">ID: {page.facebook_page_id}</p>
                </div>
                <span className="px-3 py-1 bg-green-100 text-green-800 rounded text-sm">
                  Connected
                </span>
              </div>
            ))}
            
            <button
              onClick={connectPages}
              disabled={loading}
              className="mt-4 px-4 py-2 border rounded hover:bg-gray-50"
            >
              Refresh Pages
            </button>
          </div>
        )}
      </div>
      
      <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded">
        <h3 className="font-semibold text-yellow-800 mb-2">Troubleshooting:</h3>
        <ul className="text-sm text-yellow-700 space-y-1">
          <li>• Make sure you're logged in with the Facebook account that owns the page</li>
          <li>• Your app needs 'pages_messaging' permission (currently in development)</li>
          <li>• Try clicking "Re-authorize with Facebook" to request permissions again</li>
          <li>• In development mode, only test users and app admins can use the app</li>
        </ul>
      </div>
    </div>
  )
}
