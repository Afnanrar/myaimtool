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
  const router = useRouter()
  
  useEffect(() => {
    loadPages()
  }, [])
  
  const loadPages = async () => {
    try {
      console.log('Loading pages from API...')
      const response = await fetch('/api/facebook/pages')
      if (!response.ok) {
        if (response.status === 401) {
          console.log('Unauthorized, redirecting to login')
          router.push('/login')
          return
        }
        throw new Error('Failed to load pages')
      }
      const data = await response.json()
      console.log('Pages loaded:', data)
      setPages(data.pages || [])
    } catch (error) {
      console.error('Error loading pages:', error)
      setMessage('Failed to load pages')
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
    } catch (error) {
      console.error('Error connecting pages:', error)
      setMessage('Failed to connect pages. Please try again.')
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Settings - Manage Pages</h1>
      
      {message && (
        <div className={`p-4 rounded mb-4 ${
          message.includes('Success') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {message}
        </div>
      )}
      
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Connected Pages</h2>
        
        {pages.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 mb-4">No pages connected yet</p>
            <button
              onClick={connectPages}
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Connecting...' : 'Connect Facebook Pages'}
            </button>
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
        <h3 className="font-semibold text-yellow-800 mb-2">Important Notes:</h3>
        <ul className="text-sm text-yellow-700 space-y-1">
          <li>• You must be an admin of the Facebook Page to connect it</li>
          <li>• Pages need to have messaging enabled</li>
          <li>• Make sure your Facebook App has the necessary permissions</li>
          <li>• In development mode, only test users can use the app</li>
        </ul>
      </div>
    </div>
  )
}
