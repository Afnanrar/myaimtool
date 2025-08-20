'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, MessageSquare, Search, RefreshCw, User } from 'lucide-react'

export default function InboxPage() {
  const [selectedPage, setSelectedPage] = useState<any>(null)
  const [pages, setPages] = useState<any[]>([])
  const [conversations, setConversations] = useState<any[]>([])
  const [selectedConversation, setSelectedConversation] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sendingMessage, setSendingMessage] = useState(false)
  const [newMessageText, setNewMessageText] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [error, setError] = useState('')
  const [loadingPages, setLoadingPages] = useState(true)

  useEffect(() => {
    loadPages()
  }, [])

  useEffect(() => {
    if (selectedPage) {
      loadConversations()
    }
  }, [selectedPage])

  const loadPages = async () => {
    setLoadingPages(true)
    try {
      // Load pages from the API that already works in settings
      const response = await fetch('/api/facebook/pages')
      const data = await response.json()
      
      console.log('Pages loaded:', data)
      
      if (data.pages && data.pages.length > 0) {
        setPages(data.pages)
        // Auto-select first page
        if (!selectedPage) {
          setSelectedPage(data.pages[0])
        }
      } else if (data.rawPages && data.rawPages.length > 0) {
        // If pages exist but aren't in database, still show them
        const tempPages = data.rawPages.map((p: any) => ({
          id: p.id,
          name: p.name,
          facebook_page_id: p.id,
          access_token: p.access_token
        }))
        setPages(tempPages)
        if (!selectedPage) {
          setSelectedPage(tempPages[0])
        }
      }
    } catch (error) {
      console.error('Error loading pages:', error)
      setError('Failed to load pages')
    } finally {
      setLoadingPages(false)
    }
  }

  const loadConversations = async () => {
    if (!selectedPage) return
    
    setLoading(true)
    setError('')
    
    try {
      // Use the page's ID to fetch conversations
      const pageId = selectedPage.id || selectedPage.facebook_page_id
      const response = await fetch(`/api/facebook/conversations?pageId=${pageId}`)
      const data = await response.json()
      
      console.log('Conversations response:', data)
      
      if (!response.ok) {
        setError(data.error || 'Failed to load conversations')
        
        // Show more details about the error
        if (data.details) {
          console.error('Error details:', data.details)
        }
        
        setConversations([])
        return
      }
      
      if (data.conversations && data.conversations.length > 0) {
        setConversations(data.conversations)
        setError('')
      } else {
        setConversations([])
        setError('No conversations found. Messages will appear here when customers message your page.')
      }
    } catch (error: any) {
      console.error('Error loading conversations:', error)
      setError('Failed to load conversations: ' + (error.message || 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  const loadMessages = async (conversation: any) => {
    if (!conversation || !selectedPage) return
    
    setLoadingMessages(true)
    setError('')
    
    try {
      // Load messages for the selected conversation
      const response = await fetch(`/api/facebook/messages?conversationId=${conversation.id}`)
      const data = await response.json()
      
      console.log('Messages response:', data)
      
      if (!response.ok) {
        setError(data.error || 'Failed to load messages')
        setMessages([])
        return
      }
      
      if (data.messages && data.messages.length > 0) {
        setMessages(data.messages)
        setError('')
      } else {
        setMessages([])
        setError('No messages found in this conversation.')
      }
    } catch (error: any) {
      console.error('Error loading messages:', error)
      setError('Failed to load messages: ' + (error.message || 'Unknown error'))
      setMessages([])
    } finally {
      setLoadingMessages(false)
    }
  }

  const sendMessage = async () => {
    if (!selectedConversation || !selectedPage || !newMessageText.trim()) return
    
    setSendingMessage(true)
    setError('')
    
    try {
      const response = await fetch('/api/facebook/send-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId: selectedConversation.id,
          messageText: newMessageText.trim(),
          pageId: selectedPage.id || selectedPage.facebook_page_id
        })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        setError(data.error || 'Failed to send message')
        return
      }
      
      // Message sent successfully
      setNewMessageText('')
      
      // Reload messages to show the new message
      await loadMessages(selectedConversation)
      
      // Show success message briefly
      setError('')
      setSuccessMessage('Message sent successfully!')
      setTimeout(() => setSuccessMessage(''), 3000) // Hide after 3 seconds
      
    } catch (error: any) {
      console.error('Error sending message:', error)
      setError('Failed to send message: ' + (error.message || 'Unknown error'))
    } finally {
      setSendingMessage(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const filteredConversations = conversations.filter(conv =>
    conv.participant_name?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loadingPages) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading pages...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar with conversations */}
      <div className="w-96 bg-white border-r flex flex-col">
        {/* Page Selector */}
        <div className="p-4 border-b">
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 border rounded-lg hover:bg-gray-100 transition-colors"
              disabled={pages.length === 0}
            >
              <div className="flex items-center">
                {selectedPage ? (
                  <>
                    <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold mr-3">
                      {selectedPage.name?.charAt(0) || '?'}
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-gray-900">{selectedPage.name}</p>
                      <p className="text-xs text-gray-500">
                        {pages.length > 1 ? 'Click to change' : 'Selected'}
                      </p>
                    </div>
                  </>
                ) : (
                  <span className="text-gray-500">
                    {pages.length === 0 ? 'No pages connected' : 'Select a page'}
                  </span>
                )}
              </div>
              {pages.length > 1 && (
                <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              )}
            </button>
            
            {dropdownOpen && pages.length > 0 && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto">
                  {pages.map((page) => (
                    <button
                      key={page.id || page.facebook_page_id}
                      onClick={() => {
                        setSelectedPage(page)
                        setDropdownOpen(false)
                        setConversations([]) // Clear conversations when switching pages
                        setSelectedConversation(null) // Clear selected conversation
                        setMessages([]) // Clear messages
                        setNewMessageText('') // Clear message input
                      }}
                      className={`w-full flex items-center px-4 py-3 hover:bg-gray-50 transition-colors ${
                        selectedPage?.id === page.id ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold mr-3">
                        {page.name?.charAt(0) || '?'}
                      </div>
                      <span className="font-medium text-gray-900">{page.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          
          {/* Debug info */}
          <div className="mt-2 text-xs text-gray-500">
            Pages loaded: {pages.length} | Selected: {selectedPage ? 'Yes' : 'No'}
          </div>
        </div>

        {/* Search and Refresh */}
        <div className="p-4 border-b">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={!selectedPage}
              />
            </div>
            <button
              onClick={loadConversations}
              disabled={loading || !selectedPage}
              className="p-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50"
              title="Refresh conversations"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto">
          {!selectedPage ? (
            <div className="p-4 text-center text-gray-500">
              <p>No page selected</p>
              <a href="/dashboard/settings" className="text-blue-500 hover:underline text-sm mt-2 inline-block">
                Go to settings to connect a page
              </a>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-gray-500">Loading conversations...</div>
            </div>
          ) : error ? (
            <div className="p-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800">{error}</p>
              </div>
              <button
                onClick={loadConversations}
                className="mt-4 w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                Try Again
              </button>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No conversations yet</p>
              <p className="text-sm text-gray-400 mt-1 px-4">
                {searchTerm ? 'Try a different search' : 'When people message your page, they will appear here'}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredConversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => {
                    setSelectedConversation(conv)
                    loadMessages(conv)
                    setNewMessageText('') // Clear message input when switching conversations
                  }}
                  className={`w-full p-4 hover:bg-gray-50 transition-colors flex items-start gap-3 ${
                    selectedConversation?.id === conv.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center flex-shrink-0">
                    <User className="h-5 w-5 text-gray-600" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-medium text-gray-900">
                      {conv.participant_name || 'Unknown User'}
                    </p>
                    <p className="text-sm text-gray-500 truncate">
                      Click to view conversation
                    </p>
                    {conv.unread_count > 0 && (
                      <span className="inline-block px-2 py-1 bg-blue-500 text-white text-xs rounded-full mt-1">
                        {conv.unread_count} new
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">
                    {conv.last_message_time && 
                      new Date(conv.last_message_time).toLocaleDateString()
                    }
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Message Thread - Right side remains the same */}
      <div className="flex-1 flex flex-col bg-white">
        {selectedConversation ? (
          <>
            <div className="p-4 border-b">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                  <User className="h-5 w-5 text-gray-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {selectedConversation.participant_name || 'Unknown User'}
                  </h3>
                  <p className="text-sm text-gray-500">Facebook Messenger</p>
                </div>
              </div>
              
              {/* Success/Error Messages */}
              {successMessage && (
                <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-800">
                  {successMessage}
                </div>
              )}
              {error && (
                <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-800">
                  {error}
                </div>
              )}
            </div>
            <div className="flex-1 p-4 overflow-y-auto">
              {loadingMessages ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                    <p className="text-gray-500">Loading messages...</p>
                  </div>
                </div>
              ) : error ? (
                <div className="text-center text-gray-500">
                  <p className="text-red-500">{error}</p>
                  <button
                    onClick={() => loadMessages(selectedConversation)}
                    className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                  >
                    Retry
                  </button>
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center text-gray-500">
                  <p>No messages found</p>
                  <p className="text-sm mt-1">Messages will appear here when loaded</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.is_from_page ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-xs px-4 py-2 rounded-lg ${
                          message.is_from_page
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-200 text-gray-800'
                        }`}
                      >
                        <p className="text-sm">{message.message_text}</p>
                        <p className="text-xs opacity-75 mt-1">
                          {new Date(message.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 border-t">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={newMessageText}
                  onChange={(e) => setNewMessageText(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={sendingMessage}
                  className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
                <button 
                  onClick={sendMessage}
                  disabled={sendingMessage || !newMessageText.trim()}
                  className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
                >
                  {sendingMessage ? 'Sending...' : 'Send'}
                </button>
                <button
                  onClick={() => loadMessages(selectedConversation)}
                  disabled={loadingMessages}
                  className="px-3 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  title="Refresh messages"
                >
                  <RefreshCw className={`h-4 w-4 ${loadingMessages ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <MessageSquare className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <p className="text-xl font-medium">Select a conversation to start messaging</p>
              <p className="text-sm mt-2">Choose a conversation from the left sidebar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
