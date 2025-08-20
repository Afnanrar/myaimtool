'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, MessageSquare, Search, User } from 'lucide-react'
import { supabase } from '@/lib/supabase'

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
  const [messageCache, setMessageCache] = useState<Record<string, any[]>>({})
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

  // Real-time subscription for new messages
  useEffect(() => {
    if (!supabase || !selectedPage) return

    console.log('Setting up real-time subscription for conversations:', conversations.map(c => c.id))

    // Subscribe to new messages in real-time
    const messagesSubscription = supabase
      .channel('messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        (payload: any) => {
          console.log('Real-time message received:', payload)
          handleNewMessage(payload.new)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages'
        },
        (payload: any) => {
          console.log('Real-time message updated:', payload)
          handleMessageUpdate(payload.new)
        }
      )
      .subscribe((status) => {
        console.log('Real-time subscription status:', status)
      })

    return () => {
      console.log('Cleaning up real-time subscription')
      messagesSubscription.unsubscribe()
    }
  }, [supabase, selectedPage, conversations])

  // More frequent polling as fallback for real-time updates
  useEffect(() => {
    if (!selectedPage || conversations.length === 0) return

    const interval = setInterval(() => {
      // Check for new messages every 10 seconds as fallback
      const lastUpdate = Date.now() - (window as any).lastMessageUpdate || 0
      if (lastUpdate > 10000) { // 10 seconds
        console.log('Polling for new messages - fallback to API calls')
        checkForNewMessages()
      }
    }, 10000) // Check every 10 seconds

    return () => clearInterval(interval)
  }, [selectedPage, conversations])

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
        
        // Preload messages for all conversations in background
        preloadMessages(data.conversations)
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

  const preloadMessages = async (conversations: any[]) => {
    // Preload messages for all conversations in background
    conversations.forEach(async (conv) => {
      if (!messageCache[conv.id]) {
        try {
          const response = await fetch(`/api/facebook/messages?conversationId=${conv.id}`)
          const data = await response.json()
          
          if (response.ok && data.messages) {
            setMessageCache(prev => ({
              ...prev,
              [conv.id]: data.messages || []
            }))
            console.log('Preloaded messages for conversation:', conv.id)
          }
        } catch (error) {
          console.log('Failed to preload messages for conversation:', conv.id)
        }
      }
    })
  }





  const handleNewMessage = (newMessage: any) => {
    console.log('Handling new message:', newMessage)
    
    // Track last update time for periodic refresh
    ;(window as any).lastMessageUpdate = Date.now()
    
    // Update message cache
    setMessageCache(prev => {
      const conversationId = newMessage.conversation_id
      const existingMessages = prev[conversationId] || []
      
      return {
        ...prev,
        [conversationId]: [...existingMessages, newMessage]
      }
    })
    
    // If this conversation is currently open, update the messages display
    if (selectedConversation?.id === newMessage.conversation_id) {
      setMessages(prev => [...prev, newMessage])
    }
    
    // Update conversation list to show new message preview
    setConversations(prev => prev.map(conv => {
      if (conv.id === newMessage.conversation_id) {
        return {
          ...conv,
          last_message_time: newMessage.created_at
        }
      }
      return conv
    }))
  }

  const handleMessageUpdate = (updatedMessage: any) => {
    console.log('Handling message update:', updatedMessage)
    
    // Update message in cache
    setMessageCache(prev => {
      const conversationId = updatedMessage.conversation_id
      const existingMessages = prev[conversationId] || []
      
      return {
        ...prev,
        [conversationId]: existingMessages.map(msg => 
          msg.id === updatedMessage.id ? updatedMessage : msg
        )
      }
    })
    
    // If this conversation is currently open, update the messages display
    if (selectedConversation?.id === updatedMessage.conversation_id) {
      setMessages(prev => prev.map(msg => 
        msg.id === updatedMessage.id ? updatedMessage : msg
      ))
    }
  }

  const checkForNewMessages = async () => {
    try {
      if (!selectedPage || conversations.length === 0) return
      
      console.log('Checking for new messages via API...')
      
      let totalNewMessages = 0
      
      // Check each conversation for new messages
      for (const conv of conversations) {
        const response = await fetch(`/api/facebook/messages?conversationId=${conv.id}`)
        const data = await response.json()
        
        if (response.ok && data.messages) {
          const currentMessageCount = messageCache[conv.id]?.length || 0
          const newMessageCount = data.messages.length
          
          if (newMessageCount > currentMessageCount) {
            const newMessages = newMessageCount - currentMessageCount
            totalNewMessages += newMessages
            console.log(`Found ${newMessages} new messages in conversation ${conv.id}`)
            
            // Update cache with new messages
            setMessageCache(prev => ({
              ...prev,
              [conv.id]: data.messages
            }))
            
            // If this conversation is currently open, update the display
            if (selectedConversation?.id === conv.id) {
              setMessages(data.messages)
            }
            
            // Update conversation list
            setConversations(prev => prev.map(c => {
              if (c.id === conv.id) {
                return {
                  ...c,
                  last_message_time: data.messages[data.messages.length - 1]?.created_at || c.last_message_time
                }
              }
              return c
            }))
            
            // Mark that we found new messages
            ;(window as any).lastMessageUpdate = Date.now()
          }
        }
      }
      
      if (totalNewMessages > 0) {
        setSuccessMessage(`Found ${totalNewMessages} new message${totalNewMessages > 1 ? 's' : ''}!`)
        setTimeout(() => setSuccessMessage(''), 3000)
      }
      
    } catch (error) {
      console.error('Error checking for new messages:', error)
    }
  }

  const syncMessagesFromFacebook = async (conversationId: string, pageId: string) => {
    try {
      console.log('Syncing messages from Facebook for conversation:', conversationId)
      
      const response = await fetch('/api/facebook/sync-messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ conversationId, pageId })
      })

      const data = await response.json()

      if (response.ok) {
        console.log('Sync successful:', data)
        
        // Reload messages to show synced content
        if (selectedConversation?.id === conversationId) {
          loadMessages(selectedConversation)
        }
        
        // Reload conversations to update last message times
        loadConversations()
        
        setSuccessMessage(`Synced ${data.newMessages} new messages from Facebook!`)
        setTimeout(() => setSuccessMessage(''), 3000)
      } else {
        setError(data.error || 'Failed to sync messages')
      }
    } catch (error: any) {
      console.error('Error syncing messages:', error)
      setError('Failed to sync messages: ' + (error.message || 'Unknown error'))
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
        // Cache the messages for instant switching
        setMessageCache(prev => ({
          ...prev,
          [conversation.id]: data.messages
        }))
        setError('')
      } else {
        setMessages([])
        // Cache empty messages array
        setMessageCache(prev => ({
          ...prev,
          [conversation.id]: []
        }))
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

  const loadMessagesSilently = async (conversation: any) => {
    if (!conversation || !selectedPage) return
    
    try {
      // Load messages for the selected conversation without showing loading state
      const response = await fetch(`/api/facebook/messages?conversationId=${conversation.id}`)
      const data = await response.json()
      
      if (!response.ok) {
        setError(data.error || 'Failed to load messages')
        setMessages([])
        return
      }
      
      if (data.messages && data.messages.length > 0) {
        setMessages(data.messages)
        // Cache the messages for instant switching
        setMessageCache(prev => ({
          ...prev,
          [conversation.id]: data.messages
        }))
        setError('')
      } else {
        setMessages([])
        // Cache empty messages array
        setMessageCache(prev => ({
          ...prev,
          [conversation.id]: []
        }))
        setError('No messages found in this conversation.')
      }
    } catch (error: any) {
      console.error('Error loading messages silently:', error)
      setError('Failed to load messages: ' + (error.message || 'Unknown error'))
      setMessages([])
    }
  }

  const sendMessage = async () => {
    if (!selectedConversation || !selectedPage || !newMessageText.trim()) return
    
    const messageText = newMessageText.trim()
    setSendingMessage(true)
    setError('')
    
    // Create optimistic message immediately
    const optimisticMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: selectedConversation.id,
      facebook_message_id: `temp-${Date.now()}`,
      sender_id: selectedPage.facebook_page_id || selectedPage.id,
      message_text: messageText,
      is_from_page: true,
      created_at: new Date().toISOString()
    }
    
    // Add message to UI immediately
    setMessages(prev => [...prev, optimisticMessage])
    
    // Clear input immediately
    setNewMessageText('')
    
    try {
      const response = await fetch('/api/facebook/send-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId: selectedConversation.id,
          messageText: messageText,
          pageId: selectedPage.id || selectedPage.facebook_page_id
        })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        setError(data.error || 'Failed to send message')
        // Remove optimistic message on error
        setMessages(prev => prev.filter(msg => msg.id !== optimisticMessage.id))
        // Restore the message text
        setNewMessageText(messageText)
        return
      }
      
      // Message sent successfully - replace optimistic message with real one
      const updatedMessages = messages.map(msg => 
        msg.id === optimisticMessage.id 
          ? { ...msg, id: data.messageId, facebook_message_id: data.facebookMessageId }
          : msg
      )
      
      setMessages(updatedMessages)
      
      // Update the cache with the new messages
      setMessageCache(prev => ({
        ...prev,
        [selectedConversation.id]: updatedMessages
      }))

      // Also update the conversation list to show the new message
      setConversations(prev => prev.map(conv => {
        if (conv.id === selectedConversation.id) {
          return {
            ...conv,
            last_message_time: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        }
        return conv
      }))
      
      // Show success message briefly
      setError('')
      setSuccessMessage('Message sent successfully!')
      setTimeout(() => setSuccessMessage(''), 3000) // Hide after 3 seconds
      
    } catch (error: any) {
      console.error('Error sending message:', error)
      setError('Failed to send message: ' + (error.message || 'Unknown error'))
      // Remove optimistic message on error
      setMessages(prev => prev.filter(msg => msg.id !== optimisticMessage.id))
      // Restore the message text
      setNewMessageText(messageText)
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
                        setMessageCache({}) // Clear message cache when switching pages
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

        {/* Search */}
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
                    // Switch conversation instantly
                    setSelectedConversation(conv)
                    setNewMessageText('') // Clear message input when switching conversations
                    setError('') // Clear any previous errors
                    
                    // Check if messages are cached
                    if (messageCache[conv.id]) {
                      setMessages(messageCache[conv.id])
                      console.log('Messages loaded from cache for:', conv.id)
                    } else {
                      // Load messages in background if not cached
                      loadMessagesSilently(conv)
                    }
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
                        className={`max-w-xs px-4 py-2 rounded-lg relative ${
                          message.is_from_page
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-200 text-gray-800'
                        }`}
                      >
                        <p className="text-sm">{message.message_text}</p>
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-xs opacity-75">
                            {new Date(message.created_at).toLocaleString()}
                          </p>
                          {message.id.startsWith('temp-') && (
                            <div className="flex items-center text-xs opacity-75">
                              <div className="w-2 h-2 bg-current rounded-full animate-pulse mr-1"></div>
                              Sending...
                            </div>
                          )}
                        </div>
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
                  className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors flex items-center"
                >
                  {sendingMessage && (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  )}
                  {sendingMessage ? 'Sending...' : 'Send'}
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
