'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, AlertCircle, CheckCircle } from 'lucide-react'

export default function SettingsPage() {
  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [debugInfo, setDebugInfo] = useState(null)
  const router = useRouter()
  
  useEffect(() => {
    loadPages()
  }, [])
  
  const loadPages = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/facebook/pages')
      const data = await response.json()
      
      if (!response.ok) {
        if (response.status === 401) {
          router.push('/login')
          return
        }
        setMessage(data.error || 'Failed to load pages')
        setDebugInfo(data)
        return
      }
      
      if (data.pages && data.pages.length > 0) {
        setPages(data.pages)
        setMessage(`Successfully connected ${data.pages.length} page(s)`)
      } else {
        setMessage('No pages found. Make sure you have admin access to at least one Facebook Page.')
        setDebugInfo(data)
      }
    } catch (error) {
      setMessage('Failed to load pages: ' + error.message)
    } finally {
      setLoading(false)
    }
  }
  
  const connectPages = async () => {
    setLoading(true)
    setMessage('')
    
    try {
      const response = await fetch('/api/facebook/pages')
      const data = await response.json()
      
      if (data.pages && data.pages.length > 0) {
        setPages(data.pages)
        setMessage(`Successfully connected ${data.pages.length} page(s)!`)
      } else {
        setMessage('No pages found. Make sure you have admin access to at least one Facebook Page.')
      }
    } catch (error) {
      setMessage('Failed to connect pages. Please try again.')
    } finally {
      setLoading(false)
    }
  }
  
  const reauthorize = () => {
    window.location.href = '/api/auth/logout'
  }
  
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Settings</h1>
        <p className="text-gray-600 mb-8">Manage your Facebook Pages and connections</p>
        
        {message && (
          <div className={`p-4 rounded-lg mb-6 ${
            message.includes('Success') || message.includes('success') 
              ? 'bg-green-50 border border-green-200' 
              : 'bg-red-50 border border-red-200'
          }`}>
            <div className="flex items-center">
              {message.includes('Success') || message.includes('success') ? (
                <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
              )}
              <p className={`text-sm ${
                message.includes('Success') || message.includes('success')
                  ? 'text-green-800'
                  : 'text-red-800'
              }`}>
                {message}
              </p>
            </div>
          </div>
        )}
        
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Connected Pages</h2>
            <p className="text-sm text-gray-600 mt-1">Manage your Facebook Page connections</p>
          </div>
          
          <div className="p-6">
            {pages.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-600 mb-4">No pages connected yet</p>
                <button
                  onClick={connectPages}
                  disabled={loading}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors inline-flex items-center"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="animate-spin h-4 w-4 mr-2" />
                      Connecting...
                    </>
                  ) : (
                    'Connect Facebook Pages'
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {pages.map((page) => (
                  <div key={page.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                    <div>
                      <h3 className="font-medium text-gray-900">{page.name}</h3>
                      <p className="text-sm text-gray-600">ID: {page.facebook_page_id}</p>
                    </div>
                    <span className="px-3 py-1 bg-green-100 text-green-800 text-sm rounded-full">
                      Connected
                    </span>
                  </div>
                ))}
                
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={connectPages}
                    disabled={loading}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    Refresh Pages
                  </button>
                  <button
                    onClick={reauthorize}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Re-authorize with Facebook
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        
        <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h3 className="font-semibold text-yellow-900 mb-2">Troubleshooting</h3>
          <ul className="text-sm text-yellow-800 space-y-1">
            <li>• Make sure you're logged in with the Facebook account that owns the page</li>
            <li>• Your app needs 'pages_messaging' permission (currently in development)</li>
            <li>• Try clicking "Re-authorize with Facebook" to request permissions again</li>
            <li>• In development mode, only test users and app admins can use the app</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
