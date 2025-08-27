'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronDown, MessageSquare, Search, RefreshCw, User } from 'lucide-react'

export default function InboxPage() {
  const [selectedPage, setSelectedPage] = useState<any>(null)
  const [pages, setPages] = useState<any[]>([])
  const [conversations, setConversations] = useState<any[]>([])
  const [selectedConversation, setSelectedConversation] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [loadingPages, setLoadingPages] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const [isFirstLoad, setIsFirstLoad] = useState(true)
  const [lastMessageCount, setLastMessageCount] = useState(0)

  // Load pages on mount
  useEffect(() => {
    loadPages()
  }, [])

  // Load conversations when page is selected
  useEffect(() => {
    if (selectedPage) {
      loadConversations()
      // Start polling for conversation updates
      const interval = setInterval(() => {
        loadConversations(true) // Silent refresh
      }, 5000)
      return () => clearInterval(interval)
    }
  }, [selectedPage])

  // Load messages when conversation is selected
  useEffect(() => {
    if (selectedConversation) {
      setIsFirstLoad(true)
      loadMessages()
      startMessagePolling()
    } else {
      stopMessagePolling()
    }
    
    return () => stopMessagePolling()
  }, [selectedConversation])

  const scrollToBottom = (force = false) => {
    if (messagesContainerRef.current) {
      const container = messagesContainerRef.current
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100
      
      // Only auto-scroll if user is near bottom or it's forced
      if (force || isNearBottom) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }
    }
  }

  const startMessagePolling = () => {
    pollIntervalRef.current = setInterval(() => {
      if (selectedConversation) {
        loadMessages(true) // Silent refresh
      }
    }, 2000) // Poll every 2 seconds
  }

  const stopMessagePolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }

  const loadPages = async () => {
    setLoadingPages(true)
    try {
      const response = await fetch('/api/facebook/pages')
      const data = await response.json()
      
      if (data.pages && data.pages.length > 0) {
        setPages(data.pages)
        if (!selectedPage) {
          setSelectedPage(data.pages[0])
        }
      }
    } catch (error) {
      console.error('Error loading pages:', error)
    } finally {
      setLoadingPages(false)
    }
  }

  const loadConversations = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const response = await fetch(`/api/facebook/conversations?pageId=${selectedPage.id}`)
      const data = await response.json()
      
      if (data.conversations) {
        setConversations(data.conversations)
      }
    } catch (error) {
      console.error('Error loading conversations:', error)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const loadMessages = async (silent = false) => {
    if (!selectedConversation) return
    
    if (!silent) setLoading(true)
    
    try {
      const response = await fetch(`/api/facebook/messages/${selectedConversation.id}`)
      const data = await response.json()
      
      if (data.messages) {
        const previousCount = messages.length
        setMessages(data.messages)
        
        // Check if new messages arrived
        if (data.messages.length > previousCount && silent) {
          // New message arrived during polling
          const hasUserMessage = data.messages.slice(previousCount).some((m: any) => !m.is_from_page)
          if (hasUserMessage) {
            // Auto-scroll only for new incoming messages
            setTimeout(() => scrollToBottom(true), 100)
          }
        } else if (isFirstLoad) {
          // First load - scroll to bottom
          setTimeout(() => scrollToBottom(true), 100)
          setIsFirstLoad(false)
        }
        
        setLastMessageCount(data.messages.length)
      }
    } catch (error) {
      console.error('Error loading messages:', error)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation) return
    
    setSending(true)
    
    // Add optimistic message
    const tempMessage = {
      id: `temp_${Date.now()}`,
      message_text: newMessage,
      is_from_page: true,
      created_at: new Date().toISOString(),
      status: 'sending'
    }
    
    setMessages(prev => [...prev, tempMessage])
    const messageText = newMessage
    setNewMessage('')
    
    // Scroll to bottom for sent message
    setTimeout(() => scrollToBottom(true), 100)
    
    try {
      const response = await fetch('/api/facebook/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: selectedConversation.id,
          message: messageText
        })
      })
      
      if (response.ok) {
        // Update message status
        setMessages(prev => prev.map(msg => 
          msg.id === tempMessage.id 
            ? { ...msg, status: 'sent' }
            : msg
        ))
        
        // Reload messages after a short delay
        setTimeout(() => loadMessages(true), 1000)
      } else {
        // Remove failed message
        setMessages(prev => prev.filter(msg => msg.id !== tempMessage.id))
        alert('Failed to send message')
      }
    } catch (error) {
      setMessages(prev => prev.filter(msg => msg.id !== tempMessage.id))
      alert('Failed to send message')
    } finally {
      setSending(false)
    }
  }

  const refreshConversations = async () => {
    const response = await fetch(`/api/facebook/conversations?pageId=${selectedPage.id}&refresh=true`)
    const data = await response.json()
    if (data.conversations) {
      setConversations(data.conversations)
    }
  }

  const filteredConversations = conversations.filter(conv =>
    conv.participant_name?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loadingPages) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Left Sidebar */}
      <div className="w-96 bg-white border-r flex flex-col">
        {/* Page Selector */}
        <div className="p-4 border-b bg-white">
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-300 rounded-lg hover:border-gray-400"
            >
              <div className="flex items-center">
                {selectedPage ? (
                  <>
                    <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold mr-3">
                      {selectedPage.name?.charAt(0)}
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-gray-900">{selectedPage.name}</p>
                      <p className="text-xs text-gray-500">Selected</p>
                    </div>
                  </>
                ) : (
                  <span className="text-gray-500">Select a page</span>
                )}
              </div>
              <ChevronDown className="h-5 w-5 text-gray-400" />
            </button>
            
            {dropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border rounded-lg shadow-lg z-20">
                  {pages.map((page) => (
                    <button
                      key={page.id}
                      onClick={() => {
                        setSelectedPage(page)
                        setDropdownOpen(false)
                        setSelectedConversation(null)
                      }}
                      className="w-full flex items-center px-4 py-3 hover:bg-gray-50"
                    >
                      <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold mr-3">
                        {page.name?.charAt(0)}
                      </div>
                      <span className="font-medium text-gray-900">{page.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          
          <div className="mt-2 text-xs text-gray-500">
            Pages loaded: {pages.length} | Fast Sync
          </div>
        </div>

        {/* Search */}
        <div className="p-4 border-b bg-gray-50">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border rounded-lg text-gray-900"
              />
            </div>
            <button
              onClick={refreshConversations}
              className="p-2 bg-white border rounded-lg hover:bg-gray-50"
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Conversations */}
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => {
                setSelectedConversation(conv)
                setMessages([]) // Clear messages before loading new ones
              }}
              className={`w-full p-4 hover:bg-gray-50 flex items-start gap-3 ${
                selectedConversation?.id === conv.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
              }`}
            >
              <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                <User className="h-5 w-5 text-gray-600" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium text-gray-900">{conv.participant_name}</p>
                <p className="text-sm text-gray-500">Click to view conversation</p>
              </div>
              <div className="text-xs text-gray-400">
                {new Date(conv.last_message_time).toLocaleDateString()}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Message Area */}
      <div className="flex-1 flex flex-col bg-white">
        {selectedConversation ? (
          <>
            {/* Header */}
            <div className="p-4 border-b bg-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                  <User className="h-5 w-5 text-gray-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{selectedConversation.participant_name}</h3>
                  <p className="text-sm text-gray-500">Facebook Messenger • Fast Sync (2s)</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsFirstLoad(false)
                  loadMessages()
                }}
                className="text-blue-500 text-sm hover:underline"
              >
                Check New Messages
              </button>
            </div>

            {/* Messages */}
            <div 
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto p-4 bg-gray-50"
              onScroll={(e) => {
                // User is scrolling manually
                setIsFirstLoad(false)
              }}
            >
              {loading && messages.length === 0 ? (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                  <p className="mt-2 text-gray-500">Loading messages...</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {messages.map((msg, index) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.is_from_page ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-xs ${msg.is_from_page ? 'text-right' : 'text-left'}`}>
                        <div
                          className={`inline-block px-4 py-2 rounded-lg ${
                            msg.is_from_page
                              ? 'bg-blue-500 text-white'
                              : 'bg-white text-gray-900 border border-gray-200'
                          }`}
                        >
                          {msg.message_text}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {new Date(msg.created_at).toLocaleTimeString('en-US', { 
                            hour: 'numeric', 
                            minute: '2-digit' 
                          })}
                          {msg.status === 'sending' && ' • Sending...'}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-4 border-t bg-white">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 border rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={sending}
                />
                <button
                  onClick={sendMessage}
                  disabled={sending || !newMessage.trim()}
                  className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <MessageSquare className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <p className="text-xl font-medium text-gray-900">Select a conversation to start messaging</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

