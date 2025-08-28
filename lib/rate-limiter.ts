import { Redis } from 'ioredis'

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

export class FacebookMessengerRateLimiter {
  private redis: Redis
  private config: RateLimiterConfig
  private metrics: RateLimitMetrics
  private lastSentMap: Map<string, Date> = new Map()
  private backoffState: Map<string, { backoffUntil: Date; currentRate: number }> = new Map()

  constructor(redis: Redis, config: RateLimiterConfig) {
    this.redis = redis
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

  // Token bucket mechanics
  private async consumeToken(): Promise<boolean> {
    const key = `rate_limit:${this.config.page_id}:tokens`
    const result = await this.redis.eval(`
      local current = redis.call('get', KEYS[1])
      if not current then
        redis.call('set', KEYS[1], ARGV[1])
        redis.call('expire', KEYS[1], 1)
        return 1
      end
      local tokens = tonumber(current)
      if tokens > 0 then
        redis.call('decr', KEYS[1])
        return 1
      end
      return 0
    `, 1, key, this.config.burst_ceiling_mps)

    return result === 1
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
    const queueKey = `queue:${this.config.page_id}`
    
    // Add to queue with priority and timestamp
    const queueItem = {
      ...task,
      queued_at: new Date().toISOString(),
      priority: task.priority || 0
    }
    
    await this.redis.zadd(queueKey, Date.now(), JSON.stringify(queueItem))
    
    // Update metrics
    this.metrics.queue_length = await this.redis.zcard(queueKey)
    
    console.log(`Message enqueued: ${task.id} for recipient ${task.recipientId}`)
    return task.id
  }

  // Process queue with rate limiting
  async processQueue(): Promise<void> {
    const queueKey = `queue:${this.config.page_id}`
    
    while (true) {
      try {
        // Check if we're in backoff
        if (this.isInBackoff()) {
          console.log(`In backoff mode, waiting...`)
          await new Promise(resolve => setTimeout(resolve, 1000))
          continue
        }

        // Get next message from queue
        const items = await this.redis.zrange(queueKey, 0, 0, 'WITHSCORES')
        if (items.length === 0) {
          await new Promise(resolve => setTimeout(resolve), 100)
          continue
        }

        const [itemJson, score] = items
        const item: MessageTask = JSON.parse(itemJson)
        
        // Check if it's time to process this item
        if (Date.now() < parseInt(score)) {
          await new Promise(resolve => setTimeout(resolve), 100)
          continue
        }

        // Consume token from bucket
        const tokenAvailable = await this.consumeToken()
        if (!tokenAvailable) {
          console.log(`No tokens available, waiting...`)
          await new Promise(resolve => setTimeout(resolve), 100)
          continue
        }

        // Check recipient pacing
        await this.checkRecipientPacing(item.recipient_id)

        // Process the message
        await this.processMessage(item)

        // Remove from queue
        await this.redis.zrem(queueKey, itemJson)
        
        // Update metrics
        this.metrics.queue_length = await this.redis.zcard(queueKey)
        this.metrics.sends_per_sec = this.metrics.sends_per_sec + 1

        // Rate limiting delay
        const delayMs = 1000 / this.config.baseline_rate_mps
        await new Promise(resolve => setTimeout(resolve, delayMs))

      } catch (error) {
        console.error('Error processing queue:', error)
        await new Promise(resolve => setTimeout(resolve), 1000)
      }
    }
  }

  // Process individual message with retry logic
  private async processMessage(task: MessageTask): Promise<void> {
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
          await this.requeueWithDelay(task, 5000)
          
        } else if (result.error_code === 10) {
          // Outside messaging window
          await this.markMessageStatus(task.id, 'failed', 'Outside 24h window without valid message tag')
          
        } else {
          // Other errors - retry with backoff
          if (task.retry_count < 5) {
            task.retry_count++
            await this.requeueWithDelay(task, Math.pow(2, task.retry_count) * 1000)
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
      // This would be your actual Facebook API call
      // For now, we'll simulate it
      const response = await fetch(`https://graph.facebook.com/v19.0/me/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: task.recipient_id },
          message: { text: task.message },
          ...(task.message_tag && { tag: task.message_tag })
        })
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
  private async markMessageStatus(messageId: string, status: string, error_message?: string, message_id?: string): Promise<void> {
    // This would update your database
    console.log(`Message ${messageId} status: ${status}${error_message ? ` - ${error_message}` : ''}`)
  }

  // Re-queue message with delay
  private async requeueWithDelay(task: MessageTask, delayMs: number): Promise<void> {
    const queueKey = `queue:${this.config.page_id}`
    const notBefore = Date.now() + delayMs
    
    await this.redis.zadd(queueKey, notBefore, JSON.stringify(task))
    console.log(`Message ${task.id} requeued with ${delayMs}ms delay`)
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
