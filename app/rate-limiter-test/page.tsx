'use client'

import { useState, useEffect } from 'react'

interface WorkerStatus {
  isRunning: boolean
  metrics: {
    active_pages: number
    total_messages_processed: number
    total_messages_sent: number
    total_messages_failed: number
    average_processing_time_ms: number
    last_activity: string
    uptime_seconds: number
  }
  activePages: string[]
}

export default function RateLimiterTestPage() {
  const [status, setStatus] = useState<WorkerStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  // Fetch status on component mount
  useEffect(() => {
    fetchStatus()
  }, [])

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/rate-limiter/start')
      const data = await response.json()
      if (data.success) {
        setStatus(data.status)
      }
    } catch (error) {
      console.error('Error fetching status:', error)
    }
  }

  const startWorker = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/rate-limiter/start', { method: 'POST' })
      const data = await response.json()
      
      if (data.success) {
        setStatus(data.status)
        setMessage('Worker started successfully!')
      } else {
        setMessage(data.message)
      }
    } catch (error) {
      setMessage('Error starting worker')
      console.error('Error starting worker:', error)
    } finally {
      setLoading(false)
    }
  }

  const stopWorker = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/rate-limiter/start', { method: 'DELETE' })
      const data = await response.json()
      
      if (data.success) {
        setStatus(null)
        setMessage('Worker stopped successfully!')
      } else {
        setMessage(data.message)
      }
    } catch (error) {
      setMessage('Error stopping worker')
      console.error('Error stopping worker:', error)
    } finally {
      setLoading(false)
    }
  }

  const refreshStatus = async () => {
    await fetchStatus()
    setMessage('Status refreshed')
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">
            Rate Limiter Test Dashboard
          </h1>

          {/* Status Message */}
          {message && (
            <div className={`mb-6 p-4 rounded-lg ${
              message.includes('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
            }`}>
              {message}
            </div>
          )}

          {/* Control Buttons */}
          <div className="flex gap-4 mb-6">
            <button
              onClick={startWorker}
              disabled={loading || (status?.isRunning)}
              className={`px-6 py-3 rounded-lg font-medium ${
                status?.isRunning
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {loading ? 'Starting...' : 'Start Worker'}
            </button>

            <button
              onClick={stopWorker}
              disabled={loading || !status?.isRunning}
              className={`px-6 py-3 rounded-lg font-medium ${
                !status?.isRunning
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }`}
            >
              {loading ? 'Stopping...' : 'Stop Worker'}
            </button>

            <button
              onClick={refreshStatus}
              disabled={loading}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
            >
              Refresh Status
            </button>
          </div>

          {/* Worker Status */}
          {status && (
            <div className="bg-gray-50 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Worker Status</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Basic Status */}
                <div>
                  <h3 className="text-lg font-medium text-gray-700 mb-3">Basic Status</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Status:</span>
                      <span className={`font-medium ${
                        status.isRunning ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {status.isRunning ? 'Running' : 'Stopped'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Active Pages:</span>
                      <span className="font-medium">{status.metrics.active_pages}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Uptime:</span>
                      <span className="font-medium">
                        {Math.floor(status.metrics.uptime_seconds / 60)}m {status.metrics.uptime_seconds % 60}s
                      </span>
                    </div>
                  </div>
                </div>

                {/* Message Processing */}
                <div>
                  <h3 className="text-lg font-medium text-gray-700 mb-3">Message Processing</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total Processed:</span>
                      <span className="font-medium">{status.metrics.total_messages_processed}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Successfully Sent:</span>
                      <span className="font-medium text-green-600">{status.metrics.total_messages_sent}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Failed:</span>
                      <span className="font-medium text-red-600">{status.metrics.total_messages_failed}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Avg Processing Time:</span>
                      <span className="font-medium">{status.metrics.average_processing_time_ms.toFixed(2)}ms</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Active Pages */}
              {status.activePages.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-lg font-medium text-gray-700 mb-3">Active Pages</h3>
                  <div className="flex flex-wrap gap-2">
                    {status.activePages.map((pageId) => (
                      <span
                        key={pageId}
                        className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium"
                      >
                        {pageId.slice(0, 8)}...
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Last Activity */}
              <div className="mt-6">
                <h3 className="text-lg font-medium text-gray-700 mb-3">Last Activity</h3>
                <div className="text-gray-600">
                  {status.metrics.last_activity ? new Date(status.metrics.last_activity).toLocaleString() : 'Never'}
                </div>
              </div>
            </div>
          )}

          {/* Instructions */}
          <div className="bg-blue-50 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-blue-900 mb-4">How to Use</h2>
            <div className="text-blue-800 space-y-2">
              <p>1. <strong>Start Worker:</strong> Click "Start Worker" to begin processing the message queue</p>
              <p>2. <strong>Monitor Status:</strong> Watch the real-time metrics and status updates</p>
              <p>3. <strong>Stop Worker:</strong> Click "Stop Worker" to halt processing when needed</p>
              <p>4. <strong>Database Setup:</strong> Make sure you've run the rate-limiter-supabase-schema.sql in your Supabase SQL editor</p>
            </div>
          </div>

          {/* Database Schema Info */}
          <div className="mt-6 bg-yellow-50 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-yellow-900 mb-4">Database Setup Required</h2>
            <div className="text-yellow-800 space-y-2">
              <p>Before using the rate limiter, you need to:</p>
              <ol className="list-decimal list-inside space-y-1 ml-4">
                <li>Go to your Supabase SQL Editor</li>
                <li>Run the <code className="bg-yellow-100 px-2 py-1 rounded">rate-limiter-supabase-schema.sql</code> file</li>
                <li>This will create all necessary tables and functions</li>
                <li>No external Redis setup required!</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
