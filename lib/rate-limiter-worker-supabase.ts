import { FacebookMessengerRateLimiterSupabase, RateLimiterConfig } from './rate-limiter-supabase'
import { supabaseAdmin } from './supabase'

export interface WorkerMetrics {
  active_pages: number
  total_messages_processed: number
  total_messages_sent: number
  total_messages_failed: number
  average_processing_time_ms: number
  last_activity: Date
  uptime_seconds: number
}

export class RateLimiterWorkerSupabase {
  private workers: Map<string, FacebookMessengerRateLimiterSupabase> = new Map()
  private isRunning: boolean = false
  private startTime: Date = new Date()
  private metrics: WorkerMetrics = {
    active_pages: 0,
    total_messages_processed: 0,
    total_messages_sent: 0,
    total_messages_failed: 0,
    average_processing_time_ms: 0,
    last_activity: new Date(),
    uptime_seconds: 0
  }

  constructor() {
    console.log('Rate Limiter Worker (Supabase) initialized')
  }

  // Start the worker service
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Worker is already running')
      return
    }

    this.isRunning = true
    this.startTime = new Date()
    console.log('Starting Rate Limiter Worker...')

    try {
      // Start processing for all active pages
      await this.startProcessingForAllPages()
      
      // Start metrics collection
      this.startMetricsCollection()
      
      // Start health monitoring
      this.startHealthMonitoring()
      
      console.log('Rate Limiter Worker started successfully')
    } catch (error) {
      console.error('Error starting worker:', error)
      this.isRunning = false
      throw error
    }
  }

  // Stop the worker service
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('Worker is not running')
      return
    }

    console.log('Stopping Rate Limiter Worker...')
    this.isRunning = false
    
    // Stop all page workers
    for (const [pageId, worker] of this.workers) {
      console.log(`Stopping worker for page ${pageId}`)
      // Workers will naturally stop when the main loop ends
    }
    
    this.workers.clear()
    console.log('Rate Limiter Worker stopped')
  }

  // Start processing for all active pages
  private async startProcessingForAllPages(): Promise<void> {
    try {
      // Get all pages that have rate limiter enabled
      const { data: pages, error } = await supabaseAdmin!
        .from('rate_limiter_page_configs')
        .select('page_id')
        .eq('enabled', true)

      if (error) {
        console.error('Error fetching active pages:', error)
        return
      }

      if (!pages || pages.length === 0) {
        console.log('No active pages found for rate limiting')
        return
      }

      console.log(`Found ${pages.length} active pages for rate limiting`)

      // Start processing for each page
      for (const page of pages) {
        await this.startProcessingForPage(page.page_id)
      }

      this.metrics.active_pages = pages.length
    } catch (error) {
      console.error('Error starting processing for all pages:', error)
    }
  }

  // Start processing for a specific page
  async startProcessingForPage(pageId: string): Promise<void> {
    if (this.workers.has(pageId)) {
      console.log(`Worker for page ${pageId} is already running`)
      return
    }

    try {
      // Get page configuration
      const config = await this.getPageConfig(pageId)
      if (!config) {
        console.log(`No configuration found for page ${pageId}, skipping`)
        return
      }

      // Create rate limiter for this page
      const rateLimiter = new FacebookMessengerRateLimiterSupabase(config)
      
      // Store the worker
      this.workers.set(pageId, rateLimiter)
      
      // Start processing in background
      this.processPageQueue(pageId, rateLimiter)
      
      console.log(`Started rate limiter worker for page ${pageId}`)
      
    } catch (error) {
      console.error(`Error starting worker for page ${pageId}:`, error)
    }
  }

  // Get configuration for a specific page
  private async getPageConfig(pageId: string): Promise<RateLimiterConfig | null> {
    try {
      // Get global config
      const { data: globalConfig, error: globalError } = await supabaseAdmin!
        .from('rate_limiter_configs')
        .select('*')
        .eq('id', 'global')
        .single()

      if (globalError) {
        console.error('Error fetching global config:', globalError)
        return null
      }

      // Get page-specific config (if any)
      const { data: pageConfig, error: pageError } = await supabaseAdmin!
        .from('rate_limiter_page_configs')
        .select('*')
        .eq('page_id', pageId)
        .single()

      // Merge global and page configs
      const config: RateLimiterConfig = {
        page_id: pageId,
        baseline_rate_mps: pageConfig?.baseline_rate_mps || globalConfig.baseline_rate_mps,
        burst_ceiling_mps: pageConfig?.burst_ceiling_mps || globalConfig.burst_ceiling_mps,
        hard_guardrail_mps: pageConfig?.hard_guardrail_mps || globalConfig.hard_guardrail_mps,
        recipient_min_gap_sec: pageConfig?.recipient_min_gap_sec || globalConfig.recipient_min_gap_sec,
        backoff_max_sec: pageConfig?.backoff_max_sec || globalConfig.backoff_max_sec
      }

      return config
    } catch (error) {
      console.error(`Error getting config for page ${pageId}:`, error)
      return null
    }
  }

  // Process queue for a specific page
  private async processPageQueue(pageId: string, rateLimiter: FacebookMessengerRateLimiterSupabase): Promise<void> {
    console.log(`Starting queue processing for page ${pageId}`)
    
    while (this.isRunning && this.workers.has(pageId)) {
      try {
        // Get next message from queue
        const message = await this.getNextMessageFromQueue(pageId)
        if (!message) {
          // No messages, wait a bit
          await new Promise(resolve => setTimeout(resolve, 1000))
          continue
        }

        const startTime = Date.now()
        
        // Process the message through rate limiter
        await this.processMessage(pageId, message, rateLimiter)
        
        const processingTime = Date.now() - startTime
        
        // Update metrics
        this.metrics.total_messages_processed++
        this.metrics.last_activity = new Date()
        
        // Update average processing time
        const currentAvg = this.metrics.average_processing_time_ms
        this.metrics.average_processing_time_ms = 
          (currentAvg * (this.metrics.total_messages_processed - 1) + processingTime) / this.metrics.total_messages_processed

        // Rate limiting delay
        await new Promise(resolve => setTimeout(resolve, 100))

      } catch (error) {
        console.error(`Error processing queue for page ${pageId}:`, error)
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
    }
    
    console.log(`Stopped queue processing for page ${pageId}`)
  }

  // Get next message from queue using Supabase function
  private async getNextMessageFromQueue(pageId: string): Promise<any> {
    try {
      const { data, error } = await supabaseAdmin!
        .rpc('get_next_message_from_queue', { page_uuid: pageId })

      if (error) {
        console.error('Error getting next message from queue:', error)
        return null
      }

      if (!data || data.length === 0) {
        return null
      }

      return data[0]
    } catch (error) {
      console.error('Error calling get_next_message_from_queue:', error)
      return null
    }
  }

  // Process individual message
  private async processMessage(pageId: string, message: any, rateLimiter: FacebookMessengerRateLimiterSupabase): Promise<void> {
    try {
      // Mark message as sending
      await this.updateMessageStatus(message.id, 'sending')
      
      // Process through rate limiter
      await rateLimiter.processMessage(message)
      
      // Update metrics based on final status
      const { data: updatedMessage } = await supabaseAdmin!
        .from('message_queue')
        .select('status')
        .eq('id', message.id)
        .single()

      if (updatedMessage) {
        if (updatedMessage.status === 'sent') {
          this.metrics.total_messages_sent++
        } else if (updatedMessage.status === 'failed') {
          this.metrics.total_messages_failed++
        }
      }

    } catch (error) {
      console.error(`Error processing message ${message.id}:`, error)
      
      // Mark message as failed
      await this.updateMessageStatus(message.id, 'failed', error instanceof Error ? error.message : 'Unknown error')
      this.metrics.total_messages_failed++
    }
  }

  // Update message status using Supabase function
  private async updateMessageStatus(messageId: string, status: string, errorMessage?: string, facebookMessageId?: string): Promise<void> {
    try {
      const { error } = await supabaseAdmin!
        .rpc('update_message_status', {
          message_uuid: messageId,
          new_status: status,
          error_msg: errorMessage,
          fb_message_id: facebookMessageId
        })

      if (error) {
        console.error('Error updating message status:', error)
      }
    } catch (error) {
      console.error('Error calling update_message_status:', error)
    }
  }

  // Get active pages
  getActivePages(): string[] {
    return Array.from(this.workers.keys())
  }

  // Update metrics
  private updateMetrics(): void {
    this.metrics.uptime_seconds = Math.floor((Date.now() - this.startTime.getTime()) / 1000)
  }

  // Start metrics collection
  private startMetricsCollection(): void {
    setInterval(() => {
      this.updateMetrics()
      this.collectAndStoreMetrics()
    }, 30000) // Every 30 seconds
  }

  // Collect and store metrics in database
  private async collectAndStoreMetrics(): Promise<void> {
    try {
      for (const [pageId, worker] of this.workers) {
        const workerMetrics = worker.getMetrics()
        
        const { error } = await supabaseAdmin!
          .from('rate_limiter_metrics')
          .insert({
            page_id: pageId,
            sends_per_sec: workerMetrics.sends_per_sec,
            tokens_remaining: workerMetrics.tokens_remaining,
            queue_length: workerMetrics.queue_length,
            error_rate: workerMetrics.error_rate,
            error_613_count: workerMetrics.error_613_count,
            average_wait_time_ms: workerMetrics.average_wait_time_ms,
            current_backoff_sec: workerMetrics.current_backoff_sec,
            baseline_rate_mps: workerMetrics.sends_per_sec,
            burst_ceiling_mps: workerMetrics.tokens_remaining
          })

        if (error) {
          console.error(`Error storing metrics for page ${pageId}:`, error)
        }
      }
    } catch (error) {
      console.error('Error collecting metrics:', error)
    }
  }

  // Start health monitoring
  private startHealthMonitoring(): void {
    setInterval(() => {
      this.checkWorkerHealth()
    }, 60000) // Every minute
  }

  // Check worker health
  private async checkWorkerHealth(): Promise<void> {
    try {
      // Check if workers are responsive
      for (const [pageId, worker] of this.workers) {
        const metrics = worker.getMetrics()
        
        // Log health status
        console.log(`Page ${pageId} health:`, {
          queue_length: metrics.queue_length,
          tokens_remaining: metrics.tokens_remaining,
          current_backoff: metrics.current_backoff_sec
        })
      }

      // Store health event
      await supabaseAdmin!
        .from('rate_limiter_events')
        .insert({
          event_type: 'health_check',
          event_data: {
            active_pages: this.metrics.active_pages,
            total_messages_processed: this.metrics.total_messages_processed,
            uptime_seconds: this.metrics.uptime_seconds
          },
          severity: 'info'
        })

    } catch (error) {
      console.error('Error in health check:', error)
    }
  }

  // Get worker status
  getStatus(): { isRunning: boolean; metrics: WorkerMetrics; activePages: string[] } {
    return {
      isRunning: this.isRunning,
      metrics: { ...this.metrics },
      activePages: this.getActivePages()
    }
  }

  // Add message to queue (for testing or manual addition)
  async addMessageToQueue(pageId: string, recipientId: string, message: string, messageTag?: string): Promise<string> {
    try {
      const idempotencyKey = `${pageId}-${recipientId}-${Date.now()}`
      
      const { data, error } = await supabaseAdmin!
        .from('message_queue')
        .insert({
          page_id: pageId,
          recipient_id: recipientId,
          message_text: message,
          message_tag: messageTag,
          idempotency_key: idempotencyKey,
          status: 'queued'
        })
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to add message to queue: ${error.message}`)
      }

      console.log(`Message added to queue: ${data.id}`)
      return data.id
    } catch (error) {
      console.error('Error adding message to queue:', error)
      throw error
    }
  }
}
