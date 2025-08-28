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
  const [loadingConversations, setLoadingConversations] = useState(false)
  const [conversationProgress, setConversationProgress] = useState<any>(null)
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
        loadMessages(true) // Silent refresh with Facebook sync
      }
    }, 3000) // Poll every 3 seconds for better performance
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
    if (!silent) {
      setLoadingConversations(true)
      setConversationProgress({
        status: 'loading',
        message: 'Loading conversations...',
        current: 0,
        total: 0
      })
    }
    
    try {
      const response = await fetch(`/api/facebook/conversations?pageId=${selectedPage.id}`)
      const data = await response.json()
      
      if (data.conversations) {
        setConversations(data.conversations)
        
        // Show progress information if available
        if (data.paginationInfo && !silent) {
          setConversationProgress({
            status: 'complete',
            message: `Loaded ${data.conversations.length} conversations from ${data.paginationInfo.pagesFetched} Facebook pages`,
            current: data.conversations.length,
            total: data.paginationInfo.totalConversationsFetched,
            source: data.source
          })
        } else if (data.source === 'cache' && !silent) {
          setConversationProgress({
            status: 'complete',
            message: `Showing ${data.conversations.length} cached conversations`,
            current: data.conversations.length,
            total: data.conversations.length,
            source: 'cache'
          })
        }
        
        // Clear progress after 5 seconds
        if (!silent) {
          setTimeout(() => setConversationProgress(null), 5000)
        }
      }
    } catch (error) {
      console.error('Error loading conversations:', error)
      if (!silent) {
        setConversationProgress({
          status: 'error',
          message: 'Failed to load conversations',
          current: 0,
          total: 0
        })
      }
    } finally {
      if (!silent) setLoadingConversations(false)
    }
  }

  const loadMessages = async (silent = false) => {
    if (!selectedConversation) return
    
    if (!silent) setLoading(true)
    
    try {
      // First, sync new messages from Facebook
      if (silent) {
        try {
          const syncResponse = await fetch(`/api/facebook/messages/sync?conversationId=${selectedConversation.id}&pageId=${selectedPage.id}`)
          const syncData = await syncResponse.json()
          
          if (syncResponse.ok && syncData.newMessages && syncData.newMessages.length > 0) {
            console.log('Synced new messages from Facebook:', syncData.newMessages.length)
          }
        } catch (syncError) {
          console.error('Error syncing messages:', syncError)
        }
      }
      
      // Then fetch updated messages from database
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
              disabled={loadingConversations}
            >
              <RefreshCw className={`h-4 w-4 ${loadingConversations ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Progress Indicator */}
        {conversationProgress && (
          <div className={`px-4 py-3 border-b ${
            conversationProgress.status === 'loading' ? 'bg-blue-50 border-blue-200' :
            conversationProgress.status === 'complete' ? 'bg-green-50 border-green-200' :
            conversationProgress.status === 'error' ? 'bg-red-50 border-red-200' :
            'bg-gray-50 border-gray-200'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {conversationProgress.status === 'loading' && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                )}
                {conversationProgress.status === 'complete' && (
                  <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
                {conversationProgress.status === 'error' && (
                  <div className="w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
                <span className={`text-sm font-medium ${
                  conversationProgress.status === 'loading' ? 'text-blue-700' :
                  conversationProgress.status === 'complete' ? 'text-green-700' :
                  conversationProgress.status === 'error' ? 'text-red-700' :
                  'text-gray-700'
                }`}>
                  {conversationProgress.message}
                </span>
              </div>
              
              {conversationProgress.status === 'loading' && (
                <div className="text-xs text-blue-600">
                  Loading...
                </div>
              )}
              
              {conversationProgress.status === 'complete' && (
                <div className="text-xs text-green-600">
                  {conversationProgress.current} conversations loaded
                </div>
              )}
              
              {conversationProgress.status === 'error' && (
                <div className="text-xs text-red-600">
                  Failed
                </div>
              )}
            </div>
            
            {/* Progress Bar for Loading */}
            {conversationProgress.status === 'loading' && (
              <div className="mt-2 w-full bg-blue-200 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full animate-pulse" style={{ width: '100%' }}></div>
              </div>
            )}
            
            {/* Progress Bar for Complete */}
            {conversationProgress.status === 'complete' && conversationProgress.total > 0 && (
              <div className="mt-2 w-full bg-green-200 rounded-full h-2">
                <div 
                  className="bg-green-500 h-2 rounded-full transition-all duration-500" 
                  style={{ width: `${(conversationProgress.current / conversationProgress.total) * 100}%` }}
                ></div>
              </div>
            )}
          </div>
        )}

        {/* Conversations Header */}
        <div className="px-4 py-2 border-b bg-gray-50">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              Conversations ({filteredConversations.length})
            </span>
            {conversations.length > 0 && (
              <span className="text-xs text-gray-500">
                Total: {conversations.length} | Filtered: {filteredConversations.length}
              </span>
            )}
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
                  <p className="text-sm text-gray-500">Facebook Messenger • Auto-sync every 3s</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    try {
                      const syncResponse = await fetch(`/api/facebook/messages/sync?conversationId=${selectedConversation.id}&pageId=${selectedPage.id}`)
                      const syncData = await syncResponse.json()
                      
                      if (syncResponse.ok && syncData.newMessages && syncData.newMessages.length > 0) {
                        console.log('Manual sync found new messages:', syncData.newMessages.length)
                        // Reload messages to show new ones
                        loadMessages(true)
                      } else {
                        console.log('No new messages found via manual sync')
                      }
                    } catch (error) {
                      console.error('Error in manual sync:', error)
                    }
                  }}
                  className="px-3 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600 transition-colors"
                  title="Sync new messages from Facebook"
                >
                  Sync Facebook
                </button>
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

