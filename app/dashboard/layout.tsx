import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Sidebar from '@/components/dashboard/Sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const token = cookies().get('auth-token')
  
  console.log('Dashboard layout - Token exists:', !!token)
  
  if (!token) {
    console.log('Dashboard layout - No token, redirecting to login')
    redirect('/login')
  }
  
  try {
    // Verify the token is valid
    const jwt = require('jsonwebtoken')
    const decoded = jwt.verify(
      token.value,
      process.env.JWT_SECRET || 'your-secret-key-change-this'
    )
    console.log('Dashboard layout - Token verified successfully')
  } catch (error) {
    console.error('Dashboard layout - Token verification failed:', error)
    redirect('/login')
  }
  
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar userId={token.value} />
      <main className="flex-1 overflow-y-auto bg-gray-50">
        {children}
      </main>
    </div>
  )
}
