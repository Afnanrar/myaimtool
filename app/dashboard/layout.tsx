import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Sidebar from '@/components/dashboard/Sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const token = cookies().get('auth-token')
  
  if (!token) {
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
