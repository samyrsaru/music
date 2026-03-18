import { useState, useEffect } from 'react'

interface ExpirationTimerProps {
  createdAt: string // ISO date string
  expiresAfterMs?: number // default: 1 hour (3600000)
  className?: string
}

export function ExpirationTimer({ createdAt, expiresAfterMs = 3600000, className = '' }: ExpirationTimerProps) {
  const [timeLeft, setTimeLeft] = useState<string>('')
  const [isExpired, setIsExpired] = useState(false)
  const [isUrgent, setIsUrgent] = useState(false)

  useEffect(() => {
    const created = new Date(createdAt).getTime()
    const expiresAt = created + expiresAfterMs
    
    const updateTimer = () => {
      const now = Date.now()
      const diff = expiresAt - now
      
      if (diff <= 0) {
        setIsExpired(true)
        setTimeLeft('Expired')
        return
      }
      
      // Show urgency when < 10 minutes
      setIsUrgent(diff < 10 * 60 * 1000)
      
      const minutes = Math.floor(diff / 60000)
      const seconds = Math.floor((diff % 60000) / 1000)
      setTimeLeft(`${minutes}:${seconds.toString().padStart(2, '0')}`)
    }
    
    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    
    return () => clearInterval(interval)
  }, [createdAt, expiresAfterMs])

  if (isExpired) {
    return (
      <span className={`text-red-600 font-bold ${className}`}>Expired</span>
    )
  }

  return (
    <span className={`font-mono font-bold ${isUrgent ? 'text-red-600 animate-pulse' : 'text-amber-600'} ${className}`}>
      {timeLeft}
    </span>
  )
}

export function useExpirationStatus(createdAt: string, expiresAfterMs: number = 3600000) {
  const [isExpired, setIsExpired] = useState(false)
  const [isUrgent, setIsUrgent] = useState(false)
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    const created = new Date(createdAt).getTime()
    const expiresAt = created + expiresAfterMs
    
    const updateTimer = () => {
      const now = Date.now()
      const diff = expiresAt - now
      
      if (diff <= 0) {
        setIsExpired(true)
        setIsUrgent(false)
        setTimeLeft('Expired')
        return
      }
      
      setIsExpired(false)
      setIsUrgent(diff < 10 * 60 * 1000)
      
      const minutes = Math.floor(diff / 60000)
      const seconds = Math.floor((diff % 60000) / 1000)
      setTimeLeft(`${minutes}:${seconds.toString().padStart(2, '0')}`)
    }
    
    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    
    return () => clearInterval(interval)
  }, [createdAt, expiresAfterMs])

  return { isExpired, isUrgent, timeLeft }
}
