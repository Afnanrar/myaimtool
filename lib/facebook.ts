import crypto from 'crypto'

const GRAPH_API_VERSION = 'v19.0'
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

export class FacebookAPI {
  private accessToken: string

  constructor(accessToken: string) {
    this.accessToken = accessToken
  }

  // Get user's pages
  async getPages() {
    const response = await fetch(
      `${GRAPH_API_BASE}/me/accounts?fields=id,name,access_token,tasks`,
      {
        headers: { Authorization: `Bearer ${this.accessToken}` }
      }
    )
    return response.json()
  }

  // Get page conversations
  async getConversations(pageId: string, pageAccessToken: string) {
    const response = await fetch(
      `${GRAPH_API_BASE}/${pageId}/conversations?fields=participants,updated_time,messages{message,from,created_time}`,
      {
        headers: { Authorization: `Bearer ${pageAccessToken}` }
      }
    )
    return response.json()
  }

  // Get conversation messages
  async getMessages(conversationId: string, pageAccessToken: string) {
    const response = await fetch(
      `${GRAPH_API_BASE}/${conversationId}/messages?fields=id,message,from,created_time,attachments`,
      {
        headers: { Authorization: `Bearer ${pageAccessToken}` }
      }
    )
    return response.json()
  }

  // Send message
  async sendMessage(recipientId: string, message: string, pageAccessToken: string) {
    try {
      console.log('Facebook API sendMessage called with:', {
        recipientId,
        message,
        pageAccessToken: pageAccessToken ? 'Present' : 'Missing'
      })
      
      // First, get the page ID from the access token
      const pageResponse = await fetch(
        `${GRAPH_API_BASE}/me/accounts?access_token=${pageAccessToken}`,
        {
          headers: { 'Authorization': `Bearer ${pageAccessToken}` }
        }
      )
      
      const pageData = await pageResponse.json()
      console.log('Page data response:', pageData)
      
      if (pageData.error) {
        throw new Error(`Failed to get page info: ${pageData.error.message}`)
      }
      
      if (!pageData.data || pageData.data.length === 0) {
        throw new Error('No pages found for this access token')
      }
      
      const pageId = pageData.data[0].id
      console.log('Using page ID:', pageId)
      
      // Send message using the page ID
      const response = await fetch(
        `${GRAPH_API_BASE}/${pageId}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${pageAccessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            recipient: { id: recipientId },
            message: { text: message },
            messaging_type: 'RESPONSE' // or MESSAGE_TAG for after 24 hours
          })
        }
      )
      
      const result = await response.json()
      console.log('Facebook API raw response:', result)
      
      if (!response.ok) {
        console.error('Facebook API HTTP error:', response.status, response.statusText)
        throw new Error(`Facebook API HTTP error: ${response.status} ${response.statusText}`)
      }
      
      if (result.error) {
        console.error('Facebook API error:', result.error)
        throw new Error(`Facebook API error: ${result.error.message || 'Unknown error'}`)
      }
      
      return result
    } catch (error) {
      console.error('Facebook API sendMessage error:', error)
      throw error
    }
  }

  // Send broadcast
  async sendBroadcast(recipients: string[], message: string, pageAccessToken: string) {
    const results = []
    
    for (const recipientId of recipients) {
      try {
        const result = await this.sendMessage(recipientId, message, pageAccessToken)
        results.push({ recipientId, success: true, result })
      } catch (error) {
        results.push({ recipientId, success: false, error })
      }
      
      // Rate limiting - Facebook recommends max 250 messages per second
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    
    return results
  }

  // Verify webhook signature
  static verifyWebhookSignature(payload: string, signature: string): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', process.env.FACEBOOK_APP_SECRET!)
      .update(payload)
      .digest('hex')
    
    return `sha256=${expectedSignature}` === signature
  }
}
