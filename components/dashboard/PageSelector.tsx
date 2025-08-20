'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, Plus, Check } from 'lucide-react'

interface Page {
  id: string
  name: string
  access_token: string
}

interface PageSelectorProps {
  onPageSelect: (page: Page) => void
  selectedPage: Page | null
}

export default function PageSelector({ onPageSelect, selectedPage }: PageSelectorProps) {
  const [pages, setPages] = useState<Page[]>([])
  const [loading, setLoading] = useState(true)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  
  useEffect(() => {
    loadPages()
  }, [])
  
  const loadPages = async () => {
    try {
      const response = await fetch('/api/facebook/pages')
      const data = await response.json()
      setPages(data.pages || [])
      
      // Auto-select first page if none selected
      if (data.pages?.length > 0 && !selectedPage) {
        onPageSelect(data.pages[0])
      }
    } catch (error) {
      console.error('Failed to load pages:', error)
    } finally {
      setLoading(false)
    }
  }
  
  const connectNewPage = async () => {
    window.location.href = '/api/auth/login'
  }
  
  return (
    <div className="relative">
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="w-full flex items-center justify-between px-4 py-2 bg-white border rounded-lg hover:bg-gray-50"
        disabled={loading}
      >
        <div className="flex items-center">
          {loading ? (
            <span className="text-gray-500">Loading pages...</span>
          ) : selectedPage ? (
            <>
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold mr-2">
                {selectedPage.name.charAt(0)}
              </div>
              <span className="font-medium">{selectedPage.name}</span>
            </>
          ) : (
            <span className="text-gray-500">Select a page</span>
          )}
        </div>
        <ChevronDown className="h-4 w-4 text-gray-500" />
      </button>
      
      {dropdownOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setDropdownOpen(false)}
          />
          <div className="absolute top-full left-0 right-0 mt-2 bg-white border rounded-lg shadow-lg z-20">
            <div className="py-2 max-h-60 overflow-y-auto">
              {pages.map((page) => (
                <button
                  key={page.id}
                  onClick={() => {
                    onPageSelect(page)
                    setDropdownOpen(false)
                  }}
                  className="w-full flex items-center px-4 py-2 hover:bg-gray-50"
                >
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold mr-3">
                    {page.name.charAt(0)}
                  </div>
                  <span className="flex-1 text-left">{page.name}</span>
                  {selectedPage?.id === page.id && (
                    <Check className="h-4 w-4 text-green-500" />
                  )}
                </button>
              ))}
            </div>
            
            <div className="border-t">
              <button
                onClick={connectNewPage}
                className="w-full flex items-center px-4 py-2 text-blue-600 hover:bg-gray-50"
              >
                <Plus className="h-4 w-4 mr-2" />
                Connect New Page
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
