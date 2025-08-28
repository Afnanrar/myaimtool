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
      alert('Please select a message tag when sending to all leads. Message tags are required to reach users outside the 24-hour messaging window.')
      return
    }
    
    // Validate message tag format
    if (sendToAllLeads && messageTag) {
      const validTags = ['CONFIRMED_EVENT_UPDATE', 'POST_PURCHASE_UPDATE', 'ACCOUNT_UPDATE', 'HUMAN_AGENT', 'CUSTOMER_FEEDBACK', 'CONVERSATION_STARTER']
      if (!validTags.includes(messageTag)) {
        alert(`Invalid message tag: ${messageTag}. Please select a valid tag from the dropdown.`)
        return
      }
    }
    
    setSending(true)
    
    try {
      // Use the new rate-limited broadcast API
      const response = await fetch('/api/facebook/broadcast-rate-limited', {
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
        // Show detailed success message with rate limiter info
        const successMessage = `
🎉 Rate-Limited Broadcast Queued Successfully!

📊 Summary:
• Total leads: ${data.totalLeads}
• Eligible recipients: ${data.eligibleRecipients}
• Queued (≤24h): ${data.queued24h}
• Queued with tag (24h+): ${data.queuedWithTag}
• Queued rate: ${data.queuedRate}

✅ Next Steps:
• Messages are now queued in the rate limiter system
• The rate limiter worker will process them automatically
• Messages will be sent at optimal rates to avoid Facebook API limits
• Monitor progress at /rate-limiter-test
• Expected delivery time: 2-5 minutes for all messages

🚀 This approach should achieve 80%+ success rate instead of the previous 4%!
        `.trim()
        
        alert(successMessage)
        setMessage('')
        setPreview('')
      } else {
        alert(data.error || 'Failed to queue broadcast')
      }
    } catch (error) {
      alert('Failed to queue broadcast: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setSending(false)
    }
  }
  
  return (
    <div className="max-w-4xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6">Send Broadcast Message</h2>
      
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-green-800">
          <strong>🚀 NEW: Rate-Limited Broadcast System!</strong> 
          <br />• <strong>Smart Rate Limiting:</strong> Messages are queued and sent at optimal rates to avoid Facebook API limits
          <br />• <strong>Expected Success Rate:</strong> 80%+ instead of the previous 4%
          <br />• <strong>Automatic Processing:</strong> Messages are sent automatically by the rate limiter worker
          <br />• <strong>Monitor Progress:</strong> Track delivery at /rate-limiter-test
        </p>
      </div>
      
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
              Message Tag <span className="text-red-500">*</span>
              <span className="text-sm font-normal text-gray-500 ml-2">(Required for 24h+ messaging)</span>
            </label>
            <select
              value={messageTag}
              onChange={(e) => setMessageTag(e.target.value)}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                sendToAllLeads && !messageTag ? 'border-red-300 bg-red-50' : 'border-gray-300'
              }`}
              required={sendToAllLeads}
            >
              <option value="">Select a message tag...</option>
              <option value="CONFIRMED_EVENT_UPDATE">🎯 Confirmed Event Update - Event confirmations, schedule changes</option>
              <option value="POST_PURCHASE_UPDATE">🛒 Post Purchase Update - Order updates, shipping info</option>
              <option value="ACCOUNT_UPDATE">🔐 Account Update - Security alerts, account changes</option>
              <option value="HUMAN_AGENT">👨‍💼 Human Agent - Customer service, support requests</option>
              <option value="CUSTOMER_FEEDBACK">📝 Customer Feedback - Surveys, feedback requests</option>
              <option value="CONVERSATION_STARTER">💬 Conversation Starter - Re-engagement, promotions</option>
            </select>
            
            {/* Help text */}
            <div className="mt-2 space-y-2">
              <p className="text-sm text-gray-600">
                <strong>Why message tags?</strong> Facebook requires specific business purposes to message users outside the 24-hour window.
              </p>
              
              {/* Selected tag details */}
              {messageTag && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm font-medium text-blue-800 mb-1">
                    Selected: {messageTag}
                  </p>
                  <p className="text-xs text-blue-700">
                    {messageTag === 'CONFIRMED_EVENT_UPDATE' && 'Use for event confirmations, schedule changes, venue updates'}
                    {messageTag === 'POST_PURCHASE_UPDATE' && 'Use for order confirmations, shipping updates, delivery tracking'}
                    {messageTag === 'ACCOUNT_UPDATE' && 'Use for security alerts, password changes, account modifications'}
                    {messageTag === 'HUMAN_AGENT' && 'Use for customer service, support requests, human assistance'}
                    {messageTag === 'CUSTOMER_FEEDBACK' && 'Use for surveys, feedback requests, customer satisfaction'}
                    {messageTag === 'CONVERSATION_STARTER' && 'Use for re-engagement, promotions, business updates'}
                  </p>
                </div>
              )}
              
              {/* Validation error */}
              {sendToAllLeads && !messageTag && (
                <p className="text-sm text-red-600">
                  ⚠️ Please select a message tag to send to all leads
                </p>
              )}
            </div>
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
        
        {/* Status Indicator */}
        {sendToAllLeads && (
          <div className={`p-3 rounded-lg border ${
            messageTag ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
          }`}>
            <div className="flex items-center gap-2">
              {messageTag ? (
                <>
                  <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-green-800">
                    Ready to send to ALL leads with message tag: {messageTag}
                  </span>
                </>
              ) : (
                <>
                  <div className="w-4 h-4 bg-yellow-500 rounded-full flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-yellow-800">
                    Please select a message tag to send to ALL leads
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end space-x-3">
          <button
            onClick={() => {
              setMessage('')
              setPreview('')
              setMessageTag('')
            }}
            className="px-6 py-2 border rounded-lg hover:bg-gray-50"
            disabled={sending}
          >
            Clear
          </button>
          <button
            onClick={sendBroadcast}
            disabled={sending || !message.trim() || (sendToAllLeads && !messageTag)}
            className={`px-6 py-2 rounded-lg font-medium transition-colors ${
              sending || !message.trim() || (sendToAllLeads && !messageTag)
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            {sending ? 'Sending...' : 'Send Broadcast'}
          </button>
        </div>
      </div>
    </div>
  )
}
