'use client'

import { useState } from 'react'

interface BroadcastFormProps {
  pageId: string
}

export default function BroadcastForm({ pageId }: BroadcastFormProps) {
  const [message, setMessage] = useState('')
  const [useSpintax, setUseSpintax] = useState(false)
  const [sending, setSending] = useState(false)
  const [preview, setPreview] = useState('')
  
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
    
    setSending(true)
    
    try {
      const response = await fetch('/api/facebook/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId,
          message,
          useSpintax
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
      
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-yellow-800">
          <strong>Important:</strong> Messages can only be sent to users who have messaged your page within the last 24 hours due to Facebook's messaging policy.
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
