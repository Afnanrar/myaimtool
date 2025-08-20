import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Sidebar from '@/components/dashboard/Sidebar'
import { verifyAuth } from '@/lib/auth'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const token = cookies().get('auth-token')
  
  if (!token) {
    redirect('/login')
  }
  
  const auth = await verifyAuth(token.value)
  
  if (!auth) {
    redirect('/login')
  }
  
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar userId={auth.userId} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
