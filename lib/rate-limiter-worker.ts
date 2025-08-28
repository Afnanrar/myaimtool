import { Redis } from 'ioredis'
import { supabaseAdmin } from './supabase'
import { FacebookMessengerRateLimiter, RateLimiterConfig } from './rate-limiter'
import { RateLimiterConfigStore } from './rate-limiter-config'

export interface WorkerMetrics {
  page_id: string
  messages_processed: number
  messages_sent: number
  messages_failed: number
  messages_blocked: number
  average_processing_time_ms: number
  last_activity: Date
  queue_length: number
  error_rate: number
}

export class RateLimiterWorker {
  private redis: Redis
  private configStore: RateLimiterConfigStore
  private rateLimiters: Map<string, FacebookMessengerRateLimiter> = new Map()
  private isRunning: boolean = false
  private metrics: Map<string, WorkerMetrics> = new Map()
  private processingPages: Set<string> = new Set()

  constructor(redis: Redis) {
    this.redis = redis
    this.configStore = RateLimiterConfigStore.getInstance()
  }

  // Start the worker
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Worker is already running')
      return
    }

    this.isRunning = true
    console.log('Rate limiter worker started')

    // Start processing for all active pages
    await this.startProcessingForAllPages()

    // Start metrics collection
    this.startMetricsCollection()

    // Start health monitoring
    this.startHealthMonitoring()
  }

  // Stop the worker
  async stop(): Promise<void> {
    this.isRunning = false
    console.log('Rate limiter worker stopped')
  }

  // Start processing for all active pages
  private async startProcessingForAllPages(): Promise<void> {
    try {
      const pages = await this.getActivePages()
      
      for (const page of pages) {
        if (!this.processingPages.has(page.id)) {
          this.startProcessingForPage(page.id)
        }
      }
    } catch (error) {
      console.error('Error starting processing for pages:', error)
    }
  }

  // Start processing for a specific page
  private async startProcessingForPage(pageId: string): Promise<void> {
    if (this.processingPages.has(pageId)) {
      return
    }

    this.processingPages.add(pageId)
    console.log(`Starting processing for page: ${pageId}`)

    // Initialize rate limiter for this page
    const config = await this.configStore.getEffectiveConfig(pageId)
    const rateLimiter = new FacebookMessengerRateLimiter(this.redis, {
      ...config,
      page_id: pageId
    })

    this.rateLimiters.set(pageId, rateLimiter)

    // Start processing loop for this page
    this.processPageQueue(pageId, rateLimiter)
  }

  // Process queue for a specific page
  private async processPageQueue(pageId: string, rateLimiter: FacebookMessengerRateLimiter): Promise<void> {
    while (this.isRunning && this.processingPages.has(pageId)) {
      try {
        // Get next message from queue
        const message = await this.getNextMessageFromQueue(pageId)
        
        if (!message) {
          // No messages, wait a bit
          await new Promise(resolve => setTimeout(resolve, 100))
          continue
        }

        // Process the message
        await this.processMessage(pageId, message, rateLimiter)

      } catch (error) {
        console.error(`Error processing queue for page ${pageId}:`, error)
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
  }

  // Get next message from queue
  private async getNextMessageFromQueue(pageId: string): Promise<any> {
    if (!supabaseAdmin) return null

    try {
      const { data, error } = await supabaseAdmin
        .rpc('get_next_message_from_queue', { page_uuid: pageId })

      if (error) {
        console.error('Error getting next message:', error)
        return null
      }

      return data && data.length > 0 ? data[0] : null
    } catch (error) {
      console.error('Error calling get_next_message_from_queue:', error)
      return null
    }
  }

  // Process individual message
  private async processMessage(pageId: string, message: any, rateLimiter: FacebookMessengerRateLimiter): Promise<void> {
    const startTime = Date.now()
    
    try {
      // Update status to 'sending'
      await this.updateMessageStatus(message.id, 'sending')

      // Check if we're in backoff mode
      if (rateLimiter.getMetrics().current_backoff_sec > 0) {
        console.log(`Page ${pageId} in backoff mode, deferring message ${message.id}`)
        await this.updateMessageStatus(message.id, 'deferred_rate_limit')
        await this.requeueWithDelay(message.id, rateLimiter.getMetrics().current_backoff_sec * 1000)
        return
      }

      // Send message via Facebook API
      const result = await this.sendToFacebook(message, pageId)

      if (result.success) {
        // Message sent successfully
        await this.updateMessageStatus(message.id, 'sent', undefined, result.message_id)
        this.updateMetrics(pageId, 'sent', Date.now() - startTime)
        
        console.log(`Message ${message.id} sent successfully to ${message.recipient_id}`)

      } else {
        // Handle different error types
        if (result.error_code === 613) {
          // Rate limit error - apply backoff
          await this.updateMessageStatus(message.id, 'deferred_rate_limit', 'Facebook API rate limit (613)')
          await this.requeueWithDelay(message.id, 5000)
          
          console.log(`Rate limit hit for page ${pageId}, applying backoff`)
          
        } else if (result.error_code === 10) {
          // Outside messaging window
          await this.updateMessageStatus(message.id, 'blocked_policy', 'Outside 24h window without valid message tag')
          this.updateMetrics(pageId, 'blocked', Date.now() - startTime)
          
        } else {
          // Other errors - retry with backoff
          if (message.retry_count < message.max_retries) {
            await this.updateMessageStatus(message.id, 'queued', result.error_message)
            await this.incrementRetryCount(message.id)
            
            const delayMs = Math.pow(2, message.retry_count + 1) * 1000
            await this.requeueWithDelay(message.id, delayMs)
            
          } else {
            await this.updateMessageStatus(message.id, 'failed', result.error_message)
            this.updateMetrics(pageId, 'failed', Date.now() - startTime)
          }
        }
      }

    } catch (error) {
      console.error(`Error processing message ${message.id}:`, error)
      await this.updateMessageStatus(message.id, 'failed', error instanceof Error ? error.message : 'Unknown error')
      this.updateMetrics(pageId, 'failed', Date.now() - startTime)
    }
  }

  // Send message to Facebook API
  private async sendToFacebook(message: any, pageId: string): Promise<{ success: boolean; message_id?: string; error_code?: number; error_message?: string }> {
    try {
      // Get page access token
      const { data: page } = await supabaseAdmin!
        .from('pages')
        .select('access_token, facebook_page_id')
        .eq('id', pageId)
        .single()

      if (!page) {
        throw new Error('Page not found')
      }

      // Prepare message payload
      const payload: any = {
        recipient: { id: message.recipient_id },
        message: { text: message.message_text }
      }

      // Add message tag if present
      if (message.message_tag) {
        payload.tag = message.message_tag
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

  // Update message status in database
  private async updateMessageStatus(messageId: string, status: string, error_message?: string, facebook_message_id?: string): Promise<void> {
    if (!supabaseAdmin) return

    try {
      const { error } = await supabaseAdmin
        .rpc('update_message_status', {
          message_uuid: messageId,
          new_status: status,
          error_msg: error_message,
          fb_message_id: facebook_message_id
        })

      if (error) {
        console.error('Error updating message status:', error)
      }
    } catch (error) {
      console.error('Error calling update_message_status:', error)
    }
  }

  // Increment retry count
  private async incrementRetryCount(messageId: string): Promise<void> {
    if (!supabaseAdmin) return

    try {
      const { error } = await supabaseAdmin
        .from('message_queue')
        .update({ retry_count: supabaseAdmin.rpc('increment', { x: 1 }) })
        .eq('id', messageId)

      if (error) {
        console.error('Error incrementing retry count:', error)
      }
    } catch (error) {
      console.error('Error updating retry count:', error)
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

  // Get active pages
  private async getActivePages(): Promise<any[]> {
    if (!supabaseAdmin) return []

    try {
      const { data, error } = await supabaseAdmin
        .from('pages')
        .select('id, name, facebook_page_id')
        .not('access_token', 'is', null)

      if (error) {
        console.error('Error getting active pages:', error)
        return []
      }

      return data || []
    } catch (error) {
      console.error('Error getting active pages:', error)
      return []
    }
  }

  // Update metrics for a page
  private updateMetrics(pageId: string, status: 'sent' | 'failed' | 'blocked', processingTimeMs: number): void {
    const metrics = this.metrics.get(pageId) || {
      page_id: pageId,
      messages_processed: 0,
      messages_sent: 0,
      messages_failed: 0,
      messages_blocked: 0,
      average_processing_time_ms: 0,
      last_activity: new Date(),
      queue_length: 0,
      error_rate: 0
    }

    metrics.messages_processed++
    metrics.last_activity = new Date()

    if (status === 'sent') {
      metrics.messages_sent++
    } else if (status === 'failed') {
      metrics.messages_failed++
    } else if (status === 'blocked') {
      metrics.messages_blocked++
    }

    // Update average processing time
    metrics.average_processing_time_ms = 
      (metrics.average_processing_time_ms * (metrics.messages_processed - 1) + processingTimeMs) / metrics.messages_processed

    // Calculate error rate
    const totalErrors = metrics.messages_failed + metrics.messages_blocked
    metrics.error_rate = (totalErrors / metrics.messages_processed) * 100

    this.metrics.set(pageId, metrics)
  }

  // Start metrics collection
  private startMetricsCollection(): void {
    setInterval(async () => {
      try {
        await this.collectAndStoreMetrics()
      } catch (error) {
        console.error('Error collecting metrics:', error)
      }
    }, 60000) // Every minute
  }

  // Collect and store metrics
  private async collectAndStoreMetrics(): Promise<void> {
    if (!supabaseAdmin) return

    for (const [pageId, metrics] of this.metrics) {
      try {
        const rateLimiter = this.rateLimiters.get(pageId)
        const rateLimiterMetrics = rateLimiter ? rateLimiter.getMetrics() : null

        const { error } = await supabaseAdmin
          .from('rate_limiter_metrics')
          .insert({
            page_id: pageId,
            sends_per_sec: rateLimiterMetrics?.sends_per_sec || 0,
            tokens_remaining: rateLimiterMetrics?.tokens_remaining || 0,
            queue_length: metrics.queue_length,
            error_rate: metrics.error_rate,
            error_613_count: rateLimiterMetrics?.error_613_count || 0,
            average_wait_time_ms: metrics.average_processing_time_ms,
            current_backoff_sec: rateLimiterMetrics?.current_backoff_sec || 0,
            baseline_rate_mps: rateLimiterMetrics?.baseline_rate_mps || 20,
            burst_ceiling_mps: rateLimiterMetrics?.burst_ceiling_mps || 40
          })

        if (error) {
          console.error('Error storing metrics:', error)
        }
      } catch (error) {
        console.error(`Error storing metrics for page ${pageId}:`, error)
      }
    }
  }

  // Start health monitoring
  private startHealthMonitoring(): void {
    setInterval(() => {
      this.checkWorkerHealth()
    }, 30000) // Every 30 seconds
  }

  // Check worker health
  private checkWorkerHealth(): void {
    const now = Date.now()
    
    for (const [pageId, metrics] of this.metrics) {
      const timeSinceLastActivity = now - metrics.last_activity.getTime()
      
      if (timeSinceLastActivity > 300000) { // 5 minutes
        console.warn(`Page ${pageId} has been inactive for ${Math.round(timeSinceLastActivity / 60000)} minutes`)
      }
    }
  }

  // Get worker status
  getStatus(): { isRunning: boolean; activePages: string[]; metrics: WorkerMetrics[] } {
    return {
      isRunning: this.isRunning,
      activePages: Array.from(this.processingPages),
      metrics: Array.from(this.metrics.values())
    }
  }
}
