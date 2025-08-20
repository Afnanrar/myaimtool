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
    const response = await fetch(
      `${GRAPH_API_BASE}/me/messages`,
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
    return response.json()
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
