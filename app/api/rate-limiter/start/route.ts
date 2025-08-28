import { NextRequest, NextResponse } from 'next/server'
import { RateLimiterWorkerSupabase } from '../../../../lib/rate-limiter-worker-supabase'

// Global worker instance
let worker: RateLimiterWorkerSupabase | null = null

export async function POST(request: NextRequest) {
  try {
    // Check if worker is already running
    if (worker && worker.getStatus().isRunning) {
      return NextResponse.json({
        success: false,
        message: 'Rate limiter worker is already running',
        status: worker.getStatus()
      })
    }

    // Create and start new worker
    worker = new RateLimiterWorkerSupabase()
    await worker.start()

    const status = worker.getStatus()
    
    return NextResponse.json({
      success: true,
      message: 'Rate limiter worker started successfully',
      status
    })

  } catch (error) {
    console.error('Error starting rate limiter worker:', error)
    
    return NextResponse.json({
      success: false,
      message: 'Failed to start rate limiter worker',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function GET() {
  try {
    if (!worker) {
      return NextResponse.json({
        success: false,
        message: 'No rate limiter worker instance found',
        status: null
      })
    }

    const status = worker.getStatus()
    
    return NextResponse.json({
      success: true,
      status
    })

  } catch (error) {
    console.error('Error getting worker status:', error)
    
    return NextResponse.json({
      success: false,
      message: 'Failed to get worker status',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    if (!worker) {
      return NextResponse.json({
        success: false,
        message: 'No rate limiter worker instance found'
      })
    }

    await worker.stop()
    worker = null
    
    return NextResponse.json({
      success: true,
      message: 'Rate limiter worker stopped successfully'
    })

  } catch (error) {
    console.error('Error stopping rate limiter worker:', error)
    
    return NextResponse.json({
      success: false,
      message: 'Failed to stop rate limiter worker',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
