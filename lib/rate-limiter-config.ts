import { supabaseAdmin } from './supabase'

export interface RateLimiterGlobalConfig {
  id: string
  baseline_rate_mps: number
  burst_ceiling_mps: number
  hard_guardrail_mps: number
  recipient_min_gap_sec: number
  backoff_max_sec: number
  updated_at: Date
}

export interface RateLimiterPageConfig {
  id: string
  page_id: string
  baseline_rate_mps?: number
  burst_ceiling_mps?: number
  hard_guardrail_mps?: number
  recipient_min_gap_sec?: number
  backoff_max_sec?: number
  enabled: boolean
  updated_at: Date
}

export class RateLimiterConfigStore {
  private static instance: RateLimiterConfigStore
  private globalConfig: RateLimiterGlobalConfig
  private pageConfigs: Map<string, RateLimiterPageConfig> = new Map()
  private lastUpdate: Date = new Date(0)

  private constructor() {
    // Default configuration matching the spec
    this.globalConfig = {
      id: 'default',
      baseline_rate_mps: 20,
      burst_ceiling_mps: 40,
      hard_guardrail_mps: 250,
      recipient_min_gap_sec: 2,
      backoff_max_sec: 60,
      updated_at: new Date()
    }
  }

  static getInstance(): RateLimiterConfigStore {
    if (!RateLimiterConfigStore.instance) {
      RateLimiterConfigStore.instance = new RateLimiterConfigStore()
    }
    return RateLimiterConfigStore.instance
  }

  // Get configuration for a specific page
  async getPageConfig(pageId: string): Promise<RateLimiterPageConfig> {
    // Check if we need to refresh configs
    await this.refreshConfigsIfNeeded()

    const pageConfig = this.pageConfigs.get(pageId)
    
    if (pageConfig && pageConfig.enabled) {
      // Merge page-specific overrides with global config
      return {
        ...this.globalConfig,
        ...pageConfig,
        page_id: pageId
      }
    }

    // Return global config if no page-specific config
    return {
      ...this.globalConfig,
      page_id: pageId
    }
  }

  // Get global configuration
  async getGlobalConfig(): Promise<RateLimiterGlobalConfig> {
    await this.refreshConfigsIfNeeded()
    return { ...this.globalConfig }
  }

  // Update global configuration
  async updateGlobalConfig(config: Partial<RateLimiterGlobalConfig>): Promise<void> {
    if (!supabaseAdmin) {
      throw new Error('Database not configured')
    }

    const { error } = await supabaseAdmin
      .from('rate_limiter_configs')
      .upsert({
        id: 'global',
        ...config,
        updated_at: new Date().toISOString()
      })

    if (error) {
      throw new Error(`Failed to update global config: ${error.message}`)
    }

    // Update local cache
    this.globalConfig = { ...this.globalConfig, ...config }
    this.lastUpdate = new Date()
  }

  // Update page-specific configuration
  async updatePageConfig(pageId: string, config: Partial<RateLimiterPageConfig>): Promise<void> {
    if (!supabaseAdmin) {
      throw new Error('Database not configured')
    }

    const { error } = await supabaseAdmin
      .from('rate_limiter_page_configs')
      .upsert({
        page_id: pageId,
        ...config,
        updated_at: new Date().toISOString()
      })

    if (error) {
      throw new Error(`Failed to update page config: ${error.message}`)
    }

    // Update local cache
    const existing = this.pageConfigs.get(pageId) || {
      id: pageId,
      page_id: pageId,
      enabled: true,
      updated_at: new Date()
    }
    
    this.pageConfigs.set(pageId, { ...existing, ...config })
    this.lastUpdate = new Date()
  }

  // Refresh configurations from database
  private async refreshConfigsIfNeeded(): Promise<void> {
    const now = new Date()
    const timeSinceLastUpdate = now.getTime() - this.lastUpdate.getTime()
    
    // Refresh every 30-60 seconds as per spec
    if (timeSinceLastUpdate < 30000) { // 30 seconds
      return
    }

    try {
      await this.loadConfigsFromDatabase()
      this.lastUpdate = now
    } catch (error) {
      console.error('Failed to refresh rate limiter configs:', error)
      // Continue with cached configs
    }
  }

  // Load configurations from database
  private async loadConfigsFromDatabase(): Promise<void> {
    if (!supabaseAdmin) {
      return
    }

    try {
      // Load global config
      const { data: globalData } = await supabaseAdmin
        .from('rate_limiter_configs')
        .select('*')
        .eq('id', 'global')
        .single()

      if (globalData) {
        this.globalConfig = {
          ...this.globalConfig,
          ...globalData,
          updated_at: new Date(globalData.updated_at)
        }
      }

      // Load page-specific configs
      const { data: pageData } = await supabaseAdmin
        .from('rate_limiter_page_configs')
        .select('*')
        .eq('enabled', true)

      if (pageData) {
        this.pageConfigs.clear()
        pageData.forEach(config => {
          this.pageConfigs.set(config.page_id, {
            ...config,
            updated_at: new Date(config.updated_at)
          })
        })
      }

    } catch (error) {
      console.error('Error loading rate limiter configs:', error)
    }
  }

  // Get all page configurations
  async getAllPageConfigs(): Promise<RateLimiterPageConfig[]> {
    await this.refreshConfigsIfNeeded()
    return Array.from(this.pageConfigs.values())
  }

  // Check if a page has rate limiting enabled
  async isPageEnabled(pageId: string): Promise<boolean> {
    const config = await this.getPageConfig(pageId)
    return config.enabled !== false
  }

  // Get effective configuration for a page (merged with global)
  async getEffectiveConfig(pageId: string): Promise<RateLimiterGlobalConfig> {
    const pageConfig = await this.getPageConfig(pageId)
    
    return {
      id: pageId,
      baseline_rate_mps: pageConfig.baseline_rate_mps || this.globalConfig.baseline_rate_mps,
      burst_ceiling_mps: pageConfig.burst_ceiling_mps || this.globalConfig.burst_ceiling_mps,
      hard_guardrail_mps: pageConfig.hard_guardrail_mps || this.globalConfig.hard_guardrail_mps,
      recipient_min_gap_sec: pageConfig.recipient_min_gap_sec || this.globalConfig.recipient_min_gap_sec,
      backoff_max_sec: pageConfig.backoff_max_sec || this.globalConfig.backoff_max_sec,
      updated_at: pageConfig.updated_at
    }
  }
}
