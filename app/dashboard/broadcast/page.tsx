'use client'

import { useState, useEffect } from 'react'
import { Send, AlertCircle, ChevronDown, CheckCircle, Users, Info } from 'lucide-react'

interface Page {
  id: string
  name: string
  access_token: string
  facebook_page_id: string
}

interface BroadcastResult {
  success: boolean
  recipientCount: number
  broadcastId: string
}

export default function BroadcastPage() {
  const [selectedPage, setSelectedPage] = useState<Page | null>(null)
  const [pages, setPages] = useState<Page[]>([])
  const [message, setMessage] = useState('')
  const [useSpintax, setUseSpintax] = useState(false)
  const [sending, setSending] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [eligibleCount, setEligibleCount] = useState(0)
  const [broadcastResult, setBroadcastResult] = useState<BroadcastResult | null>(null)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState('')
  const [loadingPages, setLoadingPages] = useState(true)

  useEffect(() => {
    loadPages()
  }, [])

  useEffect(() => {
    if (selectedPage) {
      checkEligibleRecipients()
    }
  }, [selectedPage])

  useEffect(() => {
    if (message && useSpintax) {
      generatePreview()
    } else {
      setPreview(message)
    }
  }, [message, useSpintax])

  const loadPages = async () => {
    setLoadingPages(true)
    try {
      const response = await fetch('/api/facebook/pages')
      const data = await response.json()
      
      if (data.pages && data.pages.length > 0) {
        setPages(data.pages)
        setSelectedPage(data.pages[0])
      }
    } catch (error) {
      console.error('Error loading pages:', error)
      setError('Failed to load pages')
    } finally {
      setLoadingPages(false)
    }
  }

  const checkEligibleRecipients = async () => {
    if (!selectedPage) return
    
    try {
      const response = await fetch(`/api/facebook/eligible-recipients?pageId=${selectedPage.id}`)
      const data = await response.json()
      
      if (data.count !== undefined) {
        setEligibleCount(data.count)
      }
    } catch (error) {
      console.error('Error checking recipients:', error)
    }
  }

  const generatePreview = () => {
    if (!message) return
    
    const processed = message.replace(/\{([^}]+)\}/g, (match, group) => {
      const options = group.split('|')
      return options[Math.floor(Math.random() * options.length)]
    })
    setPreview(processed)
  }

  const sendBroadcast = async () => {
    if (!message.trim() || !selectedPage) {
      setError('Please select a page and enter a message')
      return
    }

    setSending(true)
    setError('')
    setBroadcastResult(null)

    try {
      const response = await fetch('/api/facebook/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId: selectedPage.id,
          message,
          useSpintax
        })
      })

      const data = await response.json()

      if (response.ok) {
        setBroadcastResult({
          success: true,
          recipientCount: data.recipientCount,
          broadcastId: data.broadcastId
        })
        setMessage('')
        setPreview('')
      } else {
        setError(data.error || 'Failed to send broadcast')
      }
    } catch (error: any) {
      setError('Failed to send broadcast: ' + (error.message || 'Unknown error'))
    } finally {
      setSending(false)
    }
  }

  if (loadingPages) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Broadcast Messages</h1>
          <p className="text-gray-600 mt-2">Send messages to multiple recipients at once</p>
        </div>

        {/* Main Content Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Send Broadcast Message</h2>

            {/* Page Selector */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Page
              </label>
              <div className="relative">
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-300 rounded-lg hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                  disabled={pages.length === 0}
                >
                  <div className="flex items-center">
                    {selectedPage ? (
                      <>
                        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm mr-3">
                          {selectedPage.name?.charAt(0) || 'P'}
                        </div>
                        <span className="text-gray-900 font-medium">{selectedPage.name}</span>
                      </>
                    ) : (
                      <span className="text-gray-500">
                        {pages.length === 0 ? 'No pages available' : 'Select a page'}
                      </span>
                    )}
                  </div>
                  <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {dropdownOpen && pages.length > 0 && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
                      {pages.map((page) => (
                        <button
                          key={page.id}
                          onClick={() => {
                            setSelectedPage(page)
                            setDropdownOpen(false)
                          }}
                          className={`w-full flex items-center px-4 py-2 hover:bg-gray-50 transition-colors ${
                            selectedPage?.id === page.id ? 'bg-blue-50' : ''
                          }`}
                        >
                          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm mr-3">
                            {page.name?.charAt(0) || 'P'}
                          </div>
                          <span className="text-gray-900">{page.name}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Important Notice */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
              <div className="flex items-start">
                <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 mr-3 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-900">Important:</p>
                  <p className="text-sm text-amber-800 mt-1">
                    Messages can only be sent to users who have messaged your page within the last 24 hours due to Facebook's messaging policy.
                  </p>
                </div>
              </div>
            </div>

            {/* Message Input */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Message Content
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Enter your message here..."
                className="w-full h-32 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none text-gray-900 placeholder-gray-400"
                disabled={sending}
              />
              <div className="flex justify-between mt-2">
                <p className="text-xs text-gray-500">{message.length} characters</p>
                {eligibleCount > 0 && (
                  <p className="text-xs text-gray-500">
                    {eligibleCount} eligible recipients
                  </p>
                )}
              </div>
            </div>

            {/* Spintax Option */}
            <div className="mb-6">
              <div className="flex items-center p-3 bg-gray-50 rounded-lg">
                <input
                  type="checkbox"
                  id="spintax"
                  checked={useSpintax}
                  onChange={(e) => setUseSpintax(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="spintax" className="ml-3 text-sm font-medium text-gray-700 cursor-pointer">
                  Enable Spintax (message variations)
                </label>
                <Info className="h-4 w-4 text-gray-400 ml-2" />
              </div>
              
              {useSpintax && (
                <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm text-blue-900">
                    <span className="font-semibold">How to use:</span> {`{option1|option2|option3}`}
                  </p>
                  <p className="text-xs text-blue-700 mt-1">
                    Example: "Hi {`{there|friend}`}! Check our {`{amazing|great}`} deals!"
                  </p>
                </div>
              )}
            </div>

            {/* Preview */}
            {message && (
              <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-700">Message Preview</label>
                  {useSpintax && (
                    <button
                      onClick={generatePreview}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Generate New Preview
                    </button>
                  )}
                </div>
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="whitespace-pre-wrap text-gray-800">{preview || message}</p>
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <div className="flex items-center">
                  <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              </div>
            )}

            {/* Success Message */}
            {broadcastResult && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <div className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
                  <p className="text-sm text-green-800">
                    Broadcast sent successfully to {broadcastResult.recipientCount} recipients!
                  </p>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setMessage('')
                  setPreview('')
                  setBroadcastResult(null)
                  setError('')
                }}
                className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                disabled={sending}
              >
                Clear
              </button>
              <button
                onClick={sendBroadcast}
                disabled={sending || !message.trim() || !selectedPage}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors flex items-center"
              >
                {sending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send Broadcast
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
