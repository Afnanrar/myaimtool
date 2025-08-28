'use client'

import { useState } from 'react'

interface BroadcastFormProps {
  pageId: string
}

export default function BroadcastForm({ pageId }: BroadcastFormProps) {
  const [message, setMessage] = useState('')
  const [messageTag, setMessageTag] = useState('')
  const [useSpintax, setUseSpintax] = useState(false)
  const [sending, setSending] = useState(false)
  const [preview, setPreview] = useState('')
  const [sendToAllLeads, setSendToAllLeads] = useState(false)
  
  const generatePreview = () => {
    if (!useSpintax) {
      setPreview(message)
      return
    }
    
    // Process spintax for preview
    const processed = message.replace(/\{([^}]+)\}/g, (match, group) => {
      const options = group.split('|')
      return options[Math.floor(Math.random() * options.length)]
    })
    setPreview(processed)
  }
  
  const sendBroadcast = async () => {
    if (!message.trim()) {
      alert('Please enter a message')
      return
    }
    
    if (sendToAllLeads && !messageTag.trim()) {
      alert('Please select a message tag when sending to all leads')
      return
    }
    
    setSending(true)
    
    try {
      const response = await fetch('/api/facebook/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId,
          message,
          messageTag: sendToAllLeads ? messageTag : '',
          useSpintax,
          sendToAllLeads
        })
      })
      
      const data = await response.json()
      
      if (response.ok) {
        alert(`Broadcast sent to ${data.recipientCount} recipients!`)
        setMessage('')
        setPreview('')
      } else {
        alert(data.error || 'Failed to send broadcast')
      }
    } catch (error) {
      alert('Failed to send broadcast')
    } finally {
      setSending(false)
    }
  }
  
  return (
    <div className="max-w-4xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6">Send Broadcast Message</h2>
      
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-blue-800">
          <strong>Facebook Messaging Policy:</strong> 
          <br />• <strong>Within 24 hours:</strong> Can send messages to users who messaged your page recently
          <br />• <strong>After 24 hours:</strong> Can send messages using message tags (e.g., "CONFIRMED_EVENT_UPDATE", "POST_PURCHASE_UPDATE")
          <br />• <strong>Message tags</strong> allow you to reach users outside the 24-hour window for specific business purposes
        </p>
      </div>
      
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">
            Message Content
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Enter your message here..."
            className="w-full h-32 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            disabled={sending}
          />
          
          {useSpintax && (
            <p className="text-sm text-gray-600 mt-2">
              Use spintax format: {`{option1|option2|option3}`} for variations
            </p>
          )}
        </div>

        <div className="flex items-center space-x-3">
          <input
            type="checkbox"
            id="sendToAllLeads"
            checked={sendToAllLeads}
            onChange={(e) => setSendToAllLeads(e.target.checked)}
            className="w-4 h-4"
          />
          <label htmlFor="sendToAllLeads" className="text-sm font-medium">
            Send to ALL leads (including outside 24h window)
          </label>
        </div>

        {sendToAllLeads && (
          <div>
            <label className="block text-sm font-medium mb-2">
              Message Tag (Required for 24h+ messaging)
            </label>
            <select
              value={messageTag}
              onChange={(e) => setMessageTag(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              required={sendToAllLeads}
            >
              <option value="">Select a message tag...</option>
              <option value="CONFIRMED_EVENT_UPDATE">Confirmed Event Update</option>
              <option value="POST_PURCHASE_UPDATE">Post Purchase Update</option>
              <option value="ACCOUNT_UPDATE">Account Update</option>
              <option value="HUMAN_AGENT">Human Agent</option>
              <option value="CUSTOMER_FEEDBACK">Customer Feedback</option>
              <option value="CONVERSATION_STARTER">Conversation Starter</option>
            </select>
            <p className="text-sm text-gray-600 mt-1">
              Message tags allow you to reach users outside the 24-hour window for specific business purposes.
            </p>
          </div>
        )}
        
        <div className="flex items-center space-x-3">
          <input
            type="checkbox"
            id="spintax"
            checked={useSpintax}
            onChange={(e) => setUseSpintax(e.target.checked)}
            className="w-4 h-4"
          />
          <label htmlFor="spintax" className="text-sm font-medium">
            Enable Spintax (message variations)
          </label>
        </div>
        
        {message && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium">Preview</label>
              {useSpintax && (
                <button
                  onClick={generatePreview}
                  className="text-sm text-blue-500 hover:underline"
                >
                  Generate New Preview
                </button>
              )}
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="whitespace-pre-wrap">{preview || message}</p>
            </div>
          </div>
        )}
        
        <div className="flex justify-end space-x-3">
          <button
            onClick={() => {
              setMessage('')
              setPreview('')
            }}
            className="px-6 py-2 border rounded-lg hover:bg-gray-50"
            disabled={sending}
          >
            Clear
          </button>
          <button
            onClick={sendBroadcast}
            disabled={sending || !message.trim()}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            {sending ? 'Sending...' : 'Send Broadcast'}
          </button>
        </div>
      </div>
    </div>
  )
}
