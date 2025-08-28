import { supabaseAdmin } from './supabase'

export interface RateLimiterConfig {
  baseline_rate_mps: number // messages per second
  burst_ceiling_mps: number
  hard_guardrail_mps: number
  recipient_min_gap_sec: number
  backoff_max_sec: number
  page_id: string
}

export interface MessageTask {
  id: string
  page_id: string
  recipient_id: string
  message: string
  message_tag?: string
  priority: number
  created_at: Date
  retry_count: number
  idempotency_key: string
}

export interface RateLimitMetrics {
  sends_per_sec: number
  tokens_remaining: number
  queue_length: number
  error_rate: number
  error_613_count: number
  average_wait_time_ms: number
  last_rate_limit_time?: Date
  current_backoff_sec: number
}

export class FacebookMessengerRateLimiterSupabase {
  private config: RateLimiterConfig
  private metrics: RateLimitMetrics
  private lastSentMap: Map<string, Date> = new Map()
  private backoffState: Map<string, { backoffUntil: Date; currentRate: number }> = new Map()

  constructor(config: RateLimiterConfig) {
    this.config = config
    this.metrics = {
      sends_per_sec: 0,
      tokens_remaining: config.burst_ceiling_mps,
      queue_length: 0,
      error_rate: 0,
      error_613_count: 0,
      average_wait_time_ms: 0,
      current_backoff_sec: 0
    }
  }

  // Token bucket mechanics using Supabase
  private async consumeToken(): Promise<boolean> {
    if (!supabaseAdmin) return false

    try {
      // Use a dedicated table for token buckets
      const { data, error } = await supabaseAdmin
        .from('rate_limiter_tokens')
        .select('tokens_remaining, last_refill')
        .eq('page_id', this.config.page_id)
        .single()

      if (error && error.code === 'PGRST116') {
        // No record exists, create one with full bucket
        const { error: insertError } = await supabaseAdmin
          .from('rate_limiter_tokens')
          .insert({
            page_id: this.config.page_id,
            tokens_remaining: this.config.burst_ceiling_mps,
            last_refill: new Date().toISOString()
          })

        if (insertError) {
          console.error('Error creating token bucket:', insertError)
          return false
        }

        return true
      }

      if (error) {
        console.error('Error reading token bucket:', error)
        return false
      }

      const now = new Date()
      const lastRefill = new Date(data.last_refill)
      const secondsSinceRefill = (now.getTime() - lastRefill.getTime()) / 1000

      // Refill tokens based on time passed
      const tokensToAdd = Math.floor(secondsSinceRefill * this.config.baseline_rate_mps)
      const newTokens = Math.min(
        data.tokens_remaining + tokensToAdd,
        this.config.burst_ceiling_mps
      )

      if (newTokens > 0) {
        // Consume one token
        const { error: updateError } = await supabaseAdmin
          .from('rate_limiter_tokens')
          .update({
            tokens_remaining: newTokens - 1,
            last_refill: now.toISOString()
          })
          .eq('page_id', this.config.page_id)

        if (updateError) {
          console.error('Error consuming token:', updateError)
          return false
        }

        this.metrics.tokens_remaining = newTokens - 1
        return true
      }

      return false
    } catch (error) {
      console.error('Error in consumeToken:', error)
      return false
    }
  }

  // Per-recipient pacing (2-second gap)
  private async checkRecipientPacing(recipientId: string): Promise<boolean> {
    const lastSent = this.lastSentMap.get(recipientId)
    if (!lastSent) return true

    const timeSinceLastSent = Date.now() - lastSent.getTime()
    const minGapMs = this.config.recipient_min_gap_sec * 1000

    if (timeSinceLastSent < minGapMs) {
      const delayMs = minGapMs - timeSinceLastSent
      console.log(`Recipient pacing: delaying message to ${recipientId} by ${delayMs}ms`)
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }

    return true
  }

  // Exponential backoff with jitter
  private async applyBackoff(reason: string): Promise<void> {
    const currentBackoff = this.backoffState.get(this.config.page_id)
    let backoffSec = currentBackoff ? currentBackoff.currentRate * 2 : 1
    
    // Cap at max backoff
    backoffSec = Math.min(backoffSec, this.config.backoff_max_sec)
    
    // Add jitter (±25%)
    const jitter = (Math.random() - 0.5) * 0.5
    backoffSec = backoffSec * (1 + jitter)
    
    const backoffUntil = new Date(Date.now() + backoffSec * 1000)
    
    this.backoffState.set(this.config.page_id, {
      backoffUntil,
      currentRate: Math.max(this.config.baseline_rate_mps * 0.5, 1)
    })
    
    this.metrics.current_backoff_sec = backoffSec
    this.metrics.last_rate_limit_time = new Date()
    
    console.log(`Rate limit backoff applied: ${backoffSec.toFixed(2)}s for ${reason}`)
    
    await new Promise(resolve => setTimeout(resolve, backoffSec * 1000))
  }

  // Check if we're in backoff
  private isInBackoff(): boolean {
    const backoff = this.backoffState.get(this.config.page_id)
    if (!backoff) return false
    
    return Date.now() < backoff.getTime()
  }

  // Enqueue message with rate limiting
  async enqueueMessage(task: MessageTask): Promise<string> {
    if (!supabaseAdmin) throw new Error('Database not configured')

    try {
      // Add message to queue table
      const { data, error } = await supabaseAdmin
        .from('message_queue')
        .insert({
          page_id: task.page_id,
          recipient_id: task.recipient_id,
          message_text: task.message,
          message_tag: task.message_tag,
          priority: task.priority || 0,
          idempotency_key: task.idempotency_key,
          status: 'queued'
        })
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to enqueue message: ${error.message}`)
      }

      // Update metrics
      this.metrics.queue_length++
      
      console.log(`Message enqueued: ${task.id} for recipient ${task.recipient_id}`)
      return data.id
    } catch (error) {
      console.error('Error enqueueing message:', error)
      throw error
    }
  }

  // Process queue with rate limiting
  async processQueue(): Promise<void> {
    while (true) {
      try {
        // Check if we're in backoff
        if (this.isInBackoff()) {
          console.log(`In backoff mode, waiting...`)
          await new Promise(resolve => setTimeout(resolve, 1000))
          continue
        }

        // Get next message from queue
        const message = await this.getNextMessageFromQueue()
        if (!message) {
          // No messages, wait a bit
          await new Promise(resolve => setTimeout(resolve, 100))
          continue
        }

        // Consume token from bucket
        const tokenAvailable = await this.consumeToken()
        if (!tokenAvailable) {
          console.log(`No tokens available, waiting...`)
          await new Promise(resolve => setTimeout(resolve, 100))
          continue
        }

        // Check recipient pacing
        await this.checkRecipientPacing(message.recipient_id)

        // Process the message
        await this.processMessage(message)

        // Update metrics
        this.metrics.queue_length = Math.max(0, this.metrics.queue_length - 1)
        this.metrics.sends_per_sec = this.metrics.sends_per_sec + 1

        // Rate limiting delay
        const delayMs = 1000 / this.config.baseline_rate_mps
        await new Promise(resolve => setTimeout(resolve, delayMs))

      } catch (error) {
        console.error('Error processing queue:', error)
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
  }

  // Get next message from queue
  private async getNextMessageFromQueue(): Promise<any> {
    if (!supabaseAdmin) return null

    try {
      const { data, error } = await supabaseAdmin
        .from('message_queue')
        .select('*')
        .eq('page_id', this.config.page_id)
        .eq('status', 'queued')
        .is('not_before', null)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(1)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('Error getting next message:', error)
        return null
      }

      return data
    } catch (error) {
      console.error('Error getting next message:', error)
      return null
    }
  }

  // Process individual message with retry logic
  private async processMessage(task: any): Promise<void> {
    try {
      // Check 24-hour policy and message tag validation
      const policyCheck = await this.validateMessagePolicy(task)
      if (!policyCheck.allowed) {
        console.log(`Policy blocked: ${task.recipient_id} - ${policyCheck.reason}`)
        await this.markMessageStatus(task.id, 'blocked_policy', policyCheck.reason)
        return
      }

      // Send message via Facebook API
      const result = await this.sendToFacebook(task)
      
      if (result.success) {
        // Message sent successfully
        await this.markMessageStatus(task.id, 'sent', undefined, result.message_id)
        this.lastSentMap.set(task.recipient_id, new Date())
        
        // Gradually increase rate if successful
        this.graduallyIncreaseRate()
        
      } else {
        // Handle different error types
        if (result.error_code === 613) {
          // Rate limit error - apply backoff
          this.metrics.error_613_count++
          await this.applyBackoff('Facebook API rate limit (613)')
          
          // Re-queue with delay
          await this.requeueWithDelay(task.id, 5000)
          
        } else if (result.error_code === 10) {
          // Outside messaging window
          await this.markMessageStatus(task.id, 'failed', 'Outside 24h window without valid message tag')
          
        } else {
          // Other errors - retry with backoff
          if (task.retry_count < 5) {
            task.retry_count++
            await this.requeueWithDelay(task.id, Math.pow(2, task.retry_count) * 1000)
            
          } else {
            await this.markMessageStatus(task.id, 'failed', result.error_message)
          }
        }
      }

    } catch (error) {
      console.error(`Error processing message ${task.id}:`, error)
      await this.markMessageStatus(task.id, 'failed', error instanceof Error ? error.message : 'Unknown error')
    }
  }

  // Validate 24-hour policy and message tags
  private async validateMessagePolicy(task: MessageTask): Promise<{ allowed: boolean; reason?: string }> {
    // This would check your database for last message time
    // For now, we'll assume the validation is done at the API level
    return { allowed: true }
  }

  // Send message to Facebook API
  private async sendToFacebook(task: MessageTask): Promise<{ success: boolean; message_id?: string; error_code?: number; error_message?: string }> {
    try {
      // Get page access token
      const { data: page } = await supabaseAdmin!
        .from('pages')
        .select('access_token, facebook_page_id')
        .eq('id', task.page_id)
        .single()

      if (!page) {
        throw new Error('Page not found')
      }

      // Prepare message payload
      const payload: any = {
        recipient: { id: task.recipient_id },
        message: { text: task.message }
      }

      // Add message tag if present
      if (task.message_tag) {
        payload.tag = task.message_tag
      }

      // Send to Facebook API
      const response = await fetch(`https://graph.facebook.com/v19.0/${page.facebook_page_id}/messages?access_token=${page.access_token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const result = await response.json()

      if (response.ok && result.message_id) {
        return { success: true, message_id: result.message_id }
      } else {
        return { 
          success: false, 
          error_code: result.error?.code, 
          error_message: result.error?.message 
        }
      }

    } catch (error) {
      return { 
        success: false, 
        error_code: 0, 
        error_message: error instanceof Error ? error.message : 'Network error' 
      }
    }
  }

  // Mark message status in database
  private async markMessageStatus(messageId: string, status: string, error_message?: string, facebook_message_id?: string): Promise<void> {
    if (!supabaseAdmin) return

    try {
      const { error } = await supabaseAdmin
        .from('message_queue')
        .update({
          status,
          error_message,
          facebook_message_id,
          completed_at: status === 'sent' || status === 'failed' || status === 'blocked_policy' ? new Date().toISOString() : null
        })
        .eq('id', messageId)

      if (error) {
        console.error('Error updating message status:', error)
      }
    } catch (error) {
      console.error('Error updating message status:', error)
    }
  }

  // Re-queue message with delay
  private async requeueWithDelay(messageId: string, delayMs: number): Promise<void> {
    if (!supabaseAdmin) return

    try {
      const notBefore = new Date(Date.now() + delayMs)
      
      const { error } = await supabaseAdmin
        .from('message_queue')
        .update({ 
          status: 'queued',
          not_before: notBefore.toISOString()
        })
        .eq('id', messageId)

      if (error) {
        console.error('Error requeuing message:', error)
      }
    } catch (error) {
      console.error('Error requeuing message:', error)
    }
  }

  // Gradually increase rate after successful sends
  private graduallyIncreaseRate(): void {
    const backoff = this.backoffState.get(this.config.page_id)
    if (!backoff) return

    // Increase rate by 10% every minute if no errors
    const timeSinceLastError = Date.now() - (this.metrics.last_rate_limit_time?.getTime() || 0)
    if (timeSinceLastError > 60000) { // 1 minute
      backoff.currentRate = Math.min(
        backoff.currentRate * 1.1,
        this.config.baseline_rate_mps
      )
      
      if (backoff.currentRate >= this.config.baseline_rate_mps) {
        this.backoffState.delete(this.config.page_id)
        this.metrics.current_backoff_sec = 0
        console.log(`Rate restored to baseline: ${this.config.baseline_rate_mps} mps`)
      }
    }
  }

  // Get current metrics
  getMetrics(): RateLimitMetrics {
    return { ...this.metrics }
  }

  // Update configuration
  updateConfig(newConfig: Partial<RateLimiterConfig>): void {
    this.config = { ...this.config, ...newConfig }
    console.log('Rate limiter config updated:', this.config)
  }
}
