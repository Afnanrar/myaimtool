import jwt from 'jsonwebtoken'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { AuthUser } from '@/types'

export async function verifyAuth(req: NextRequest | string): Promise<AuthUser | null> {
  try {
    let token: string
    
    if (typeof req === 'string') {
      token = req
    } else {
      const cookieStore = cookies()
      const authToken = cookieStore.get('auth-token')
      
      if (!authToken) {
        return null
      }
      
      token = authToken.value
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: string
      facebookId: string
      accessToken: string
    }
    
    return decoded
  } catch (error) {
    console.error('Auth verification failed:', error)
    return null
  }
}
