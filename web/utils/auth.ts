import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserProfile, setUserInfo } from './api'

const defaultLocalUser: UserProfile = {
  uid: 'default_user',
  display_name: 'Default User',
  email: 'local@localhost',
};

export const useAuth = () => {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [mode, setMode] = useState<'local' | null>(null)
  
  useEffect(() => {
    console.log('🏠 Local mode activated');
    setMode('local');
    
    setUser(defaultLocalUser);
    setUserInfo(defaultLocalUser);
    setIsLoading(false);
  }, [])

  return { user, isLoading, mode }
}

export const useRedirectIfNotAuth = () => {
  const { user, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    // Local mode never requires a login, so there is nothing to redirect.
  }, [user, isLoading, router])

  return user
}
