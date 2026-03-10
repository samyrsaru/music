import { useCallback, useRef } from 'react'
import { useAuth } from '@clerk/react'

export function useApi() {
  const { getToken, userId } = useAuth()
  const lastRequestTime = useRef<number>(0)
  const MIN_REQUEST_INTERVAL = 500 // 500ms between requests

  const fetchWithAuth = useCallback(async (url: string, options: RequestInit = {}) => {
    // Rate limiting - prevent rapid successive requests
    const now = Date.now()
    const timeSinceLastRequest = now - lastRequestTime.current
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest))
    }
    lastRequestTime.current = Date.now()

    // Get fresh token if user is logged in
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {})
    }

    if (userId) {
      try {
        const token = await getToken()
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }
      } catch (err) {
        console.error('Failed to get auth token:', err)
      }
    }

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include'
    })

    return response
  }, [getToken, userId])

  return { fetchWithAuth }
}
