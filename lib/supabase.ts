import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types'

// Create a build-safe Supabase client
const createSupabaseClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    // Return a mock client during build time
    return null
  }
  
  return createClient<Database>(supabaseUrl, supabaseKey)
}

const createSupabaseAdminClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    // Return a mock client during build time
    return null
  }
  
  return createClient<Database>(supabaseUrl, supabaseKey)
}

export const supabase = createSupabaseClient()
export const supabaseAdmin = createSupabaseAdminClient()
