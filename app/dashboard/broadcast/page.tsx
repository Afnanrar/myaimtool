'use client'

import BroadcastForm from '@/components/dashboard/BroadcastForm'
import PageSelector from '@/components/dashboard/PageSelector'
import { useState } from 'react'

interface Page {
  id: string
  name: string
  access_token: string
}

export default function BroadcastPage() {
  const [selectedPage, setSelectedPage] = useState<Page | null>(null)
  
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Broadcast Messages</h1>
        <p className="text-gray-600 mt-2">Send messages to multiple recipients at once</p>
      </div>
      
      <div className="mb-6">
        <PageSelector
          onPageSelect={setSelectedPage}
          selectedPage={selectedPage}
        />
      </div>
      
      {selectedPage ? (
        <BroadcastForm pageId={selectedPage.id} />
      ) : (
        <div className="text-center py-12 text-gray-500">
          Please select a page to send broadcasts
        </div>
      )}
    </div>
  )
}
