'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronDown, MessageSquare, Search, User, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function InboxPage() {
  const [selectedPage, setSelectedPage] = useState<any>(null)
  const [pages, setPages] = useState<any[]>([])
  const [conversations, setConversations] = useState<any[]>([])
  const [selectedConversation, setSelectedConversation] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sendingMessage, setSendingMessage] = useState(false)
  const [newMessageText, setNewMessageText] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [messageCache, setMessageCache] = useState<Record<string, any[]>>({})
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [error, setError] = useState('')
  const [loadingPages, setLoadingPages] = useState(true)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [realtimeInterval, setRealtimeInterval] = useState<NodeJS.Timeout | null>(null)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false)
  const [messagePage, setMessagePage] = useState(1)
  const [totalMessages, setTotalMessages] = useState(0)
  
  // Ref for messages container to enable auto-scrolling
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const messagesTopRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadPages()
  }, [])

  // Clean up placeholder conversations when conversations change
  useEffect(() => {
    if (conversations.length > 0 && selectedPage) {
      const realConversations = conversations.filter((conv: any) => {
        if (conv.participant_name === 'Facebook User' || 
            conv.participant_name === 'Unknown User' ||
            conv.participant_name === 'Test User') {
          return false
        }
        
        if (!conv.participant_id || !conv.facebook_conversation_id) {
          return false
        }
        
        if (conv.page_id !== selectedPage.id) {
          return false
        }
        
        return true
      })
      
      if (realConversations.length !== conversations.length) {
        console.log(`Cleaned up ${conversations.length - realConversations.length} placeholder conversations`)
        setConversations(realConversations)
      }
    }
  }, [conversations.length, selectedPage])



  useEffect(() => {
    if (selectedPage) {
      loadConversations()
    }
  }, [selectedPage])

  // Real-time subscriptions for live updates
  useEffect(() => {
    if (!supabase || !selectedPage) return
    
    console.log('Setting up real-time subscriptions for page:', selectedPage.id)
    
    // Subscribe to new messages
    const messagesSubscription = supabase
      .channel('messages-realtime')
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'messages',
          filter: `page_id=eq.${selectedPage.id}`
        },
        (payload) => {
          console.log('New message received via real-time:', payload)
          handleRealtimeMessage(payload.new)
        }
      )
      .subscribe()
    
    // Subscribe to conversation updates
    const conversationsSubscription = supabase
      .channel('conversations-realtime')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'conversations',
          filter: `page_id=eq.${selectedPage.id}`
        },
        (payload) => {
          console.log('Conversation update received via real-time:', payload)
          handleRealtimeConversation(payload)
        }
      )
      .subscribe()
    
    return () => {
      messagesSubscription.unsubscribe()
      conversationsSubscription.unsubscribe()
    }
  }, [selectedPage, supabase])

  // DISABLED: Real-time message polling causing confusion
  // useEffect(() => {
    // if (!selectedPage || !selectedConversation) return

    // // Clear any existing interval
    // if (realtimeInterval) {
    //   clearInterval(realtimeInterval)
    // }

    // // Set up real-time polling for the active conversation
    // const interval = setInterval(async () => {
    //   try {
    //     // Always sync new messages from Facebook
    //     const syncResponse = await fetch(`/api/facebook/messages/sync?conversationId=${selectedConversation.id}&pageId=${selectedPage.id}`)
    //     const syncData = await syncResponse.json()
        
    //     if (syncResponse.ok) {
    //       // Get updated messages from database
    //       const messagesResponse = await fetch(`/api/facebook/messages/realtime?conversationId=${selectedConversation.id}&pageId=${selectedPage.id}`)
    //       const messagesData = await messagesResponse.json()
        
    //       if (messagesResponse.ok && messagesData.messages) {
    //         // Check if we have new messages
    //         const currentMessageIds = new Set(messages.map(m => m.id))
    //         const newMessages = messagesData.messages.filter((m: any) => !currentMessageIds.has(m.id))
        
    //         if (newMessages.length > 0) {
    //           console.log('New incoming messages found:', newMessages.length)
    //         }
        
    //         // Always update messages to ensure latest state
    //         if (newMessages.length > 0) {
    //           setMessages(messagesData.messages)
        
    //           // Update message cache
    //           setMessageCache(prev => ({
    //             ...prev,
    //             [selectedConversation.id]: messagesData.messages
    //           }))
        
    //           // Update conversation list and filter out placeholders
    //           setConversations(prev => {
    //             const updated = prev.map(conv => 
    //               conv.id === selectedConversation.id 
    //                 ? { ...conv, last_message_time: new Date().toISOString() }
    //                 : conv
    //             )
        
    //             // Filter out placeholder conversations
    //             return updated.filter((conv: any) => {
    //               if (conv.participant_name === 'Facebook User' || 
    //                   conv.participant_name === 'Unknown User' ||
    //                   conv.participant_name === 'Test User') {
    //                 return false
    //               }
        
    //               if (!conv.participant_id || !conv.facebook_conversation_id) {
    //                 return false
    //               }
        
    //               if (conv.page_id !== selectedPage.id) {
    //                 return false
    //               }
        
    //               return true
    //             })
    //           })
        
    //           // Scroll to bottom when new messages arrive
    //           setTimeout(() => scrollToBottom(), 100)
    //         }
    //       }
    //     }
    //   } catch (error) {
    //     console.error('Error in real-time polling:', error)
    //   }
    // }, 2000) // Check every 2 seconds for active conversation

    // // Also do an immediate sync when conversation is selected
    // const immediateSync = async () => {
    //   try {
    //     const syncResponse = await fetch(`/api/facebook/messages/sync?conversationId=${selectedConversation.id}&pageId=${selectedPage.id}`)
    //     const syncData = await syncResponse.json()
        
    //     if (syncResponse.ok && syncData.newMessages && syncData.newMessages.length > 0) {
    //       console.log('Immediate sync found new messages:', syncData.newMessages.length)
    //       // Reload messages to show new ones
    //       loadMessages(selectedConversation, true)
    //       // Scroll to bottom after immediate sync
    //       setTimeout(() => scrollToBottom(), 200)
    //     }
    //   } catch (error) {
    //     console.error('Immediate sync error:', error)
    //   }
    // }

    // // Run immediate sync after a short delay
    // const immediateTimeout = setTimeout(immediateSync, 1000)

    // setRealtimeInterval(interval)

    // return () => {
    //   if (interval) {
    //     clearInterval(interval)
    //   }
    //   if (immediateTimeout) {
    //     clearTimeout(immediateTimeout)
    //   }
    // }
  // }, [selectedPage, selectedConversation])

  // DISABLED: Background sync causing confusion
  // useEffect(() => {
  //   if (!selectedPage || conversations.length === 0) return

  //   const interval = setInterval(async () => {
  //     try {
  //       console.log('Background sync: Checking all conversations for new messages...')
        
  //       // Sync each conversation for new messages
  //       for (const conversation of conversations) {
  //         try {
  //           const syncResponse = await fetch(`/api/facebook/messages/sync?conversationId=${conversation.id}&pageId=${selectedPage.id}`)
  //           const syncData = await syncResponse.json()
            
  //           if (syncResponse.ok && syncData.newMessages && syncData.newMessages.length > 0) {
  //             console.log(`Background sync: Found ${syncData.newMessages.length} new messages in conversation ${conversation.id}`)
            
  //             // Update conversation list to show new message indicator and filter placeholders
  //       setConversations(prev => {
  //         const updated = prev.map(conv => 
  //           conv.id === conversation.id 
  //             ? { ...conv, last_message_time: new Date().toISOString() }
  //             : conv
  //         )
            
  //         // Filter out placeholder conversations
  //         return updated.filter((conv: any) => {
  //           if (conv.participant_name === 'Facebook User' || 
  //               conv.participant_name === 'Unknown User' ||
  //               conv.participant_name === 'Test User') {
  //             return false
  //           }
            
  //           if (!conv.participant_id || !conv.facebook_conversation_id) {
  //             return false
  //           }
            
  //           if (conv.page_id !== selectedPage.id) {
  //             return false
  //           }
            
  //           return true
  //         })
  //       })
  //     }
  //   } catch (error) {
  //     console.error(`Error syncing conversation ${conversation.id}:`, error)
  //   }
  // }
        
  //     // Update last sync time
  //     ;(window as any).lastMessageUpdate = Date.now()
        
  //   } catch (error) {
  //     console.error('Error in background sync:', error)
  //   }
  // }, 5000) // Check every 5 seconds

  //   return () => clearInterval(interval)
  // }, [selectedPage, conversations])

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

  // Function to scroll to bottom of messages
  const scrollToBottom = () => {
    if (shouldAutoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  // Function to scroll to bottom without checking shouldAutoScroll (for forced scrolls)
  const forceScrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Function to scroll to bottom for new messages (always scroll)
  const scrollToBottomForNewMessage = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Handle scroll events to detect user scrolling
  const handleScroll = () => {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10 // 10px threshold
      setShouldAutoScroll(isAtBottom)
    }
  }

  const loadConversations = useCallback(async (forceRefresh = false) => {
    if (!selectedPage) return
    
    if (forceRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError('')
    
    try {
      const pageId = selectedPage.id || selectedPage.facebook_page_id
      const url = `/api/facebook/conversations?pageId=${pageId}${forceRefresh ? '&refresh=true' : ''}`
      
      const response = await fetch(url)
      const data = await response.json()
      
      if (!response.ok && !data.conversations) {
        setError(data.error || 'Failed to load conversations')
        setConversations([])
        return
      }
      
      if (data.conversations && data.conversations.length > 0) {
        // Filter out placeholder conversations and ensure only real conversations
        const realConversations = data.conversations.filter((conv: any) => {
          // Remove conversations with placeholder names
          if (conv.participant_name === 'Facebook User' || 
              conv.participant_name === 'Unknown User' ||
              conv.participant_name === 'Test User') {
            return false
          }
          
          // Remove conversations without proper participant information
          if (!conv.participant_id || !conv.facebook_conversation_id) {
            return false
          }
          
          // Ensure conversation belongs to the current page
          if (conv.page_id !== selectedPage.id) {
            return false
          }
          
          return true
        })
        
        console.log(`Filtered conversations: ${data.conversations.length} -> ${realConversations.length} real conversations`)
        
        setConversations(realConversations)
        setError('')
        
        if (forceRefresh) {
          setLastRefreshed(new Date())
        }
        
        // Preload messages for real conversations only
        preloadMessages(realConversations)
      } else {
        setConversations([])
        if (!data.error) {
          setError('No conversations found. Messages will appear here when customers message your page.')
        }
      }
      
      // Show source of data
      if (data.source === 'cache') {
        console.log('Loaded from cache')
      } else if (data.source === 'facebook') {
        console.log('Loaded fresh data from Facebook')
      }
      
    } catch (error: any) {
      console.error('Error loading conversations:', error)
      setError('Failed to load conversations: ' + (error.message || 'Unknown error'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [selectedPage])

  const preloadMessages = async (conversations: any[]) => {
    // Preload messages for first 3 conversations only to avoid overwhelming the API
    const conversationsToPreload = conversations.slice(0, 3)
    
    conversationsToPreload.forEach(async (conv) => {
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
    
    // Only update if this is for the currently selected conversation
    if (selectedConversation?.id === newMessage.conversation_id) {
      // Add new message to current display
      setMessages(prev => [...prev, newMessage])
      // Scroll to bottom to show new message
      setTimeout(() => forceScrollToBottom(), 100)
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
            
            // Update cache with new messages (reverse to show oldest first)
            const reversedMessages = [...data.messages].reverse()
            setMessageCache(prev => ({
              ...prev,
              [conv.id]: reversedMessages
            }))
            
            // Don't update current conversation display here - let the main loadMessages handle it
            // This prevents multiple sources from updating the same conversation
            
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

  const selectConversation = (conversation: any) => {
    // Immediately clear previous conversation data to prevent confusion
    setMessages([])
    setError('')
    setNewMessageText('')
    setShouldAutoScroll(true)
    
    // Reset pagination state for new conversation
    setMessagePage(1)
    setHasMoreMessages(false)
    setTotalMessages(0)
    
    // Set the new conversation
    setSelectedConversation(conversation)
    
    // Show loading state immediately
    setLoadingMessages(true)
    
    // Load messages for the new conversation (single source of truth)
    loadMessages(conversation)
    
    // Cancel any ongoing background operations for previous conversation
    if ((window as any).currentConversationId !== conversation.id) {
      (window as any).currentConversationId = conversation.id
      // Clear any pending timeouts
      if ((window as any).messageUpdateTimeout) {
        clearTimeout((window as any).messageUpdateTimeout)
        ;(window as any).messageUpdateTimeout = null
      }
    }
  }

  const loadMessages = async (conversation: any, forceRefresh = false, loadOlder = false) => {
    if (!conversation || !selectedPage) return
    
    // Prevent multiple simultaneous loading operations
    if ((window as any).isLoadingMessages) {
      console.log('Message loading already in progress, skipping...')
      return
    }
    
    ;(window as any).isLoadingMessages = true
    
    if (loadOlder) {
      setIsLoadingOlderMessages(true)
    } else {
      setLoadingMessages(true)
      setMessagePage(1) // Reset to first page for new conversation
    }
    
    setError('')
    
    try {
      // If force refresh, sync new messages from Facebook first
      if (forceRefresh && !loadOlder) {
        try {
          const syncResponse = await fetch(`/api/facebook/messages/sync?conversationId=${conversation.id}&pageId=${selectedPage.id}`)
          const syncData = await syncResponse.json()
          
          if (syncResponse.ok && syncData.newMessages && syncData.newMessages.length > 0) {
            console.log('Synced new incoming messages:', syncData.newMessages.length)
          }
        } catch (error) {
          console.error('Error syncing messages:', error)
        }
      }
      
      // Load messages from API with pagination
      const currentPage = loadOlder ? messagePage + 1 : 1
      const pageSize = 30 // Load 30 messages per page
      const url = `/api/facebook/messages?conversationId=${conversation.id}&page=${currentPage}&pageSize=${pageSize}${forceRefresh ? '&refresh=true' : ''}`
      
      const response = await fetch(url)
      const data = await response.json()
      
      if (!response.ok) {
        setError(data.error || 'Failed to load messages')
        if (!loadOlder) {
          setMessages([])
        }
        return
      }
      
      if (data.messages && data.messages.length > 0) {
        // For new conversations, show latest messages first
        // For loading older messages, prepend them to existing messages
        let newMessages: any[] = []
        
        if (loadOlder) {
          // Loading older messages - prepend to existing messages (oldest first)
          newMessages = [...data.messages, ...messages]
          setMessagePage(currentPage)
        } else {
          // New conversation - messages are already in correct order (oldest first, newest last)
          newMessages = data.messages
          setMessagePage(1)
        }
        
        // Update total message count
        if (data.total) {
          setTotalMessages(data.total)
        }
        
        // Check if there are more messages to load
        setHasMoreMessages(data.messages.length === pageSize && newMessages.length < data.total)
        
        // Cache the messages
        setMessageCache(prev => ({
          ...prev,
          [conversation.id]: newMessages
        }))
        
        // Update conversation with cache timestamp
        setConversations(prev => prev.map(conv => 
          conv.id === conversation.id 
            ? { ...conv, lastCacheUpdate: Date.now() }
            : conv
        ))
        
        setError('')
        setMessages(newMessages)
        
        // Only auto-scroll for new conversations, not when loading older messages
        if (!loadOlder) {
          setTimeout(() => scrollToBottomForNewMessage(), 25)
        }
      } else {
        if (!loadOlder) {
          setMessages([])
          setHasMoreMessages(false)
        }
        setError('No messages found in this conversation.')
      }
    } catch (error: any) {
      console.error('Error loading messages:', error)
      setError('Failed to load messages: ' + (error.message || 'Unknown error'))
      if (!loadOlder) {
        setMessages([])
      }
    } finally {
      setLoadingMessages(false)
      setIsLoadingOlderMessages(false)
      ;(window as any).isLoadingMessages = false
    }
  }

  // Function to load older messages (lazy loading)
  const loadOlderMessages = async () => {
    if (!selectedConversation || isLoadingOlderMessages || !hasMoreMessages) return
    
    console.log('Loading older messages...')
    await loadMessages(selectedConversation, false, true)
  }

  // Handle real-time message updates
  const handleRealtimeMessage = (newMessage: any) => {
    console.log('Processing real-time message:', newMessage)
    
    // Check if this message belongs to the currently open conversation
    if (selectedConversation && newMessage.conversation_id === selectedConversation.id) {
      console.log('Adding new message to current conversation')
      
      // Add the new message to the current messages
      setMessages(prev => {
        // Check if message already exists to prevent duplicates
        const exists = prev.some(msg => msg.facebook_message_id === newMessage.facebook_message_id)
        if (exists) return prev
        
        // Add new message and sort by event_time to maintain correct order
        const updatedMessages = [...prev, newMessage].sort((a, b) => 
          new Date(a.event_time || a.created_at).getTime() - new Date(b.event_time || b.created_at).getTime()
        )
        
        return updatedMessages
      })
      
      // Auto-scroll to bottom for new incoming messages
      setTimeout(() => scrollToBottomForNewMessage(), 100)
      
      // Update conversation list to show new message indicator
      setConversations(prev => prev.map(conv => 
        conv.id === selectedConversation.id 
          ? { ...conv, last_message_time: newMessage.event_time || newMessage.created_at, unread_count: (conv.unread_count || 0) + 1 }
          : conv
      ))
    } else {
      console.log('Message not for current conversation, updating conversation list')
      
      // Update conversation list for other conversations
      setConversations(prev => prev.map(conv => 
        conv.id === newMessage.conversation_id
          ? { ...conv, last_message_time: newMessage.event_time || newMessage.created_at, unread_count: (conv.unread_count || 0) + 1 }
          : conv
      ))
    }
  }

  // Handle real-time conversation updates
  const handleRealtimeConversation = (payload: any) => {
    console.log('Processing real-time conversation update:', payload)
    
    if (payload.eventType === 'INSERT') {
      // New conversation created
      setConversations(prev => [...prev, payload.new])
    } else if (payload.eventType === 'UPDATE') {
      // Existing conversation updated
      setConversations(prev => prev.map(conv => 
        conv.id === payload.new.id ? payload.new : conv
      ))
    }
  }

  // Removed loadMessagesSilently to prevent multiple message loading sources
  // All message loading now goes through the single loadMessages function

  const sendMessage = async () => {
    if (!selectedConversation || !selectedPage || !newMessageText.trim()) return
    
    const messageText = newMessageText.trim()
    setSendingMessage(true)
    setError('')
    
    // Create optimistic message immediately with proper timestamp
    const now = new Date().toISOString()
    const optimisticMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: selectedConversation.id,
      facebook_message_id: `temp-${Date.now()}`,
      sender_id: selectedPage.facebook_page_id || selectedPage.id,
      message_text: messageText,
      is_from_page: true,
      created_at: now,
      event_time: now // Use same timestamp for proper sorting
    }
    
          // Add message to UI immediately
      setMessages(prev => [...prev, optimisticMessage])
      
      // Clear input immediately
      setNewMessageText('')
      
      // Always scroll to bottom when sending a message
      setTimeout(() => scrollToBottomForNewMessage(), 100)
    
    try {
      const response = await fetch('/api/facebook/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId: selectedConversation.id,
          message: messageText
        })
      })
      
      const data = await response.json()
      
      console.log('Message send response:', data)
      
      if (!response.ok) {
        setError(data.error || 'Failed to send message')
        // Remove optimistic message on error
        setMessages(prev => prev.filter(msg => msg.id !== optimisticMessage.id))
        // Restore the message text
        setNewMessageText(messageText)
        return
      }
      
      // Message sent successfully - replace optimistic message with real one
      if (data.success && data.message_id) {
        console.log('Replacing optimistic message with real message ID:', data.message_id)
        
        setMessages(prev => {
          const updatedMessages = prev.map(msg => 
            msg.id === optimisticMessage.id 
              ? { ...msg, id: data.message_id, facebook_message_id: data.message_id }
              : msg
          )
          
          console.log('Updated messages:', updatedMessages)
          
          // Update the cache with the new messages
          setMessageCache(prevCache => ({
            ...prevCache,
            [selectedConversation.id]: updatedMessages
          }))
          
          return updatedMessages
        })
      } else {
        // If we don't get a proper response, just keep the optimistic message
        // but mark it as sent
        console.log('No proper response, marking optimistic message as sent')
        
        setMessages(prev => {
          const updatedMessages = prev.map(msg => 
            msg.id === optimisticMessage.id 
              ? { ...msg, id: `sent-${Date.now()}`, facebook_message_id: `sent-${Date.now()}` }
              : msg
          )
          
          console.log('Updated messages (fallback):', updatedMessages)
          
          // Update the cache
          setMessageCache(prevCache => ({
            ...prevCache,
            [selectedConversation.id]: updatedMessages
          }))
          
          return updatedMessages
        })
      }

      // Also update the conversation list to show the new message
      setConversations(prev => prev.map(conv => {
        if (conv.id === selectedConversation.id) {
          return {
            ...conv,
            last_message_time: now, // Use the same timestamp as the message
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
          
          {/* Status bar */}
          <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
            <span>Pages loaded: {pages.length} | Selected: {selectedPage ? 'Yes' : 'No'}</span>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>Fast Sync</span>
              </div>
              {lastRefreshed && (
                <span className="flex items-center">
                  <Clock className="h-3 w-3 mr-1" />
                  {lastRefreshed?.toLocaleTimeString() || 'Unknown time'}
                </span>
              )}
            </div>
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
              onClick={() => loadConversations(true)}
              disabled={refreshing || !selectedPage}
              className="p-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
              title="Refresh conversations"
            >
              <div className={`w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full ${refreshing ? 'animate-spin' : ''}`}></div>
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
          ) : loading && conversations.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                <div className="text-gray-500">Loading conversations...</div>
              </div>
            </div>
          ) : error ? (
            <div className="p-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800">{error}</p>
              </div>
              <button
                onClick={() => loadConversations(true)}
                className="mt-4 w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                Refresh Conversations
              </button>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No conversations yet</p>
              <p className="text-sm text-gray-400 mt-1 px-4">
                {searchTerm ? 'Try a different search' : 'Click refresh to check for new messages'}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredConversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => selectConversation(conv)}
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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                    <User className="h-5 w-5 text-gray-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {selectedConversation.participant_name || 'Unknown User'}
                    </h3>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-gray-500">Facebook Messenger</p>
                      {loadingMessages ? (
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                          <span className="text-xs text-blue-600">Loading messages...</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                          <span className="text-xs text-green-600">Fast Sync (2s)</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      try {
                        const syncResponse = await fetch(`/api/facebook/messages/sync?conversationId=${selectedConversation.id}&pageId=${selectedPage.id}`)
                        const syncData = await syncResponse.json()
                        
                        if (syncResponse.ok && syncData.newMessages && syncData.newMessages.length > 0) {
                          console.log('Synced new incoming messages:', syncData.newMessages.length)
                          // Reload messages to show new ones
                          loadMessages(selectedConversation, true)
                        } else {
                          console.log('No new incoming messages found')
                        }
                      } catch (error) {
                        console.error('Error syncing incoming messages:', error)
                      }
                    }}
                    className="p-2 text-green-500 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors"
                    title="Sync incoming messages from Facebook"
                  >
                    <div className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full"></div>
                  </button>
                  <button
                    onClick={() => loadMessages(selectedConversation, true)}
                    disabled={loadingMessages}
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Refresh messages manually"
                  >
                    <div className={`w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full ${loadingMessages ? 'animate-spin' : ''}`}></div>
                  </button>
                  
                  <button
                    onClick={async () => {
                      try {
                        const syncResponse = await fetch(`/api/facebook/messages/sync?conversationId=${selectedConversation.id}&pageId=${selectedPage.id}`)
                        const syncData = await syncResponse.json()
                        
                        if (syncResponse.ok && syncData.newMessages && syncData.newMessages.length > 0) {
                          console.log('Manual sync found new messages:', syncData.newMessages.length)
                          // Reload messages to show new ones
                          loadMessages(selectedConversation, true)
                        } else {
                          console.log('No new messages found via manual sync')
                        }
                      } catch (error) {
                        console.error('Error in manual sync:', error)
                      }
                    }}
                    className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Check for new messages from Facebook"
                  >
                    <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full"></div>
                  </button>
                </div>
              </div>
              
              {/* Loading Indicator for Conversation Switch */}
              {loadingMessages && (
                <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
                  <div className="flex items-center justify-center">
                    <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-2"></div>
                    <span>Loading conversation with {selectedConversation?.participant_name}...</span>
                  </div>
                </div>
              )}
              
              {/* Success/Error Messages */}
              {successMessage && (
                <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-800">
                  {successMessage}
                </div>
              )}
              {error && (
                <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-800">
                  <div className="flex items-center justify-between">
                    <span>{error}</span>
                    <button
                      onClick={() => {
                        setError('')
                        if (selectedConversation) {
                          loadMessages(selectedConversation)
                        }
                      }}
                      className="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div 
              ref={messagesContainerRef}
              className="flex-1 p-4 overflow-y-auto"
              onScroll={handleScroll}
            >
              {loadingMessages ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto mb-2"></div>
                    <p className="text-gray-400 text-sm">Loading messages in correct order...</p>
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
                  {/* Reference for top of messages */}
                  <div ref={messagesTopRef} />
                  
                  {/* Load Older Messages Button */}
                  {hasMoreMessages && (
                    <div className="text-center py-4">
                      <button
                        onClick={loadOlderMessages}
                        disabled={isLoadingOlderMessages}
                        className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors flex items-center mx-auto"
                      >
                        {isLoadingOlderMessages ? (
                          <>
                            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mr-2"></div>
                            Loading...
                          </>
                        ) : (
                          <>
                            <Clock className="h-4 w-4 mr-2" />
                            Load Older Messages
                          </>
                        )}
                      </button>
                      <p className="text-xs text-gray-500 mt-2">
                        Showing {messages.length} of {totalMessages} messages
                      </p>
                    </div>
                  )}
                  
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
              
              {/* Invisible element for auto-scrolling to bottom */}
              <div ref={messagesEndRef} />
              
              {/* Scroll to bottom button - only show when user has scrolled up */}
              {!shouldAutoScroll && (
                <button
                  onClick={forceScrollToBottom}
                  className="fixed bottom-20 right-8 bg-blue-500 text-white p-3 rounded-full shadow-lg hover:bg-blue-600 transition-colors z-10"
                  title="Scroll to recent messages"
                >
                  <ChevronDown className="h-5 w-5" />
                </button>
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
                  
                  {/* Debug buttons - only show in development */}
                  {process.env.NODE_ENV === 'development' && (
                    <>
                      <button
                        onClick={async () => {
                          try {
                            const response = await fetch('/api/facebook/test-send', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                conversationId: selectedConversation.id,
                                pageId: selectedPage.id
                              })
                            })
                            const data = await response.json()
                            console.log('Facebook API Test Result:', data)
                            alert(`Test Result: ${JSON.stringify(data, null, 2)}`)
                          } catch (error: any) {
                            console.error('Test failed:', error)
                            alert('Test failed: ' + error.message)
                          }
                        }}
                        className="px-3 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 text-xs"
                        title="Test Facebook API Configuration"
                      >
                        Test API
                      </button>
                      
                      <button
                        onClick={async () => {
                          try {
                            const response = await fetch('/api/test-message')
                            const data = await response.json()
                            console.log('Test Message Result:', data)
                            alert(`Test Message Result: ${JSON.stringify(data, null, 2)}`)
                          } catch (error: any) {
                            console.error('Test message failed:', error)
                            alert('Test message failed: ' + error.message)
                          }
                        }}
                        className="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-xs"
                        title="Test Message Sending"
                      >
                        Test Msg
                      </button>
                    </>
                  )}

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
