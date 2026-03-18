import { useState, useEffect } from 'react'
import { Show, useAuth } from '@clerk/react'
import { Link, useParams } from 'react-router'
import { registerAudioElement } from '../lib/audioManager.ts'
import { useApi } from '../hooks/useApi'
import { ExpirationTimer } from '../components/ExpirationTimer.tsx'

const API_URL = import.meta.env.VITE_API_URL || ''

interface EphemeralData {
  lyrics: string
  prompt: string
  originalIdea?: string
  createdAt: number
}

interface GenerationStatus {
  id: string
  status: string
  audioUrl: string | null
  model: string
  createdAt: string
  expiresAt: string
  isExpired: boolean
}

function EphemeralSong() {
  const { id } = useParams<{ id: string }>()
  const { isLoaded } = useAuth()
  const { fetchWithAuth } = useApi()
  
  const [data, setData] = useState<EphemeralData | null>(null)
  const [hasSessionData, setHasSessionData] = useState(false)
  const [status, setStatus] = useState<GenerationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [polling, setPolling] = useState(false)

  // Load data on mount - wait for auth to be ready first
  useEffect(() => {
    if (!id || !isLoaded) return
    
    // Try to load lyrics/prompt from sessionStorage (for display only)
    const songs = JSON.parse(sessionStorage.getItem('ephemeral-songs') || '{}')
    const myData = songs[id]
    
    if (myData) {
      setData(myData)
      setHasSessionData(true)
    } else {
      // No session data, but we can still fetch status from server
      setHasSessionData(false)
    }
    
    // Always fetch status from server (includes audioUrl)
    fetchStatus()
  }, [id, isLoaded])

  const fetchStatus = async () => {
    if (!id) return
    
    try {
      const res = await fetchWithAuth(`${API_URL}/api/ephemeral/status/${id}`)
      
      if (!res.ok) {
        const err = await res.json()
        setError(err.error || 'Failed to load song status')
        setLoading(false)
        setPolling(false)
        return
      }
      
      const result = await res.json() as GenerationStatus
      setStatus(result)
      setLoading(false)
      
      // Continue polling if pending
      if (result.status === 'pending' && !result.isExpired) {
        setPolling(true)
        setTimeout(() => fetchStatus(), 5000)
      } else {
        setPolling(false)
      }
    } catch (err) {
      console.error('Failed to fetch status:', err)
      setLoading(false)
      // Retry on error if still pending
      setTimeout(() => fetchStatus(), 5000)
    }
  }

  const formatDate = (dateStr: string) => {
    // Handle both ISO8601 format (with Z) and old SQLite format (without Z)
    const isoStr = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z'
    return new Date(isoStr).toLocaleString(undefined, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  }

  const [isDownloading, setIsDownloading] = useState(false)

  const handleDownload = async () => {
    if (!status?.audioUrl || !id) return
    
    setIsDownloading(true)
    try {
      // Fetch the audio file client-side
      const response = await fetch(status.audioUrl)
      if (!response.ok) throw new Error('Failed to fetch audio')
      
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      
      // Create a temporary link and trigger download
      const link = document.createElement('a')
      link.href = url
      link.download = `private-song-${id}.mp3`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      // Clean up the object URL
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Download failed:', err)
      // Fallback: open in new tab
      window.open(status.audioUrl, '_blank')
    } finally {
      setIsDownloading(false)
    }
  }

  // Determine current state
  const isExpired = status?.isExpired
  const isPending = status?.status === 'pending' && !isExpired
  const isCompleted = status?.status === 'completed' && !isExpired
  const isFailed = status?.status === 'failed'

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors">
      <main className="max-w-4xl mx-auto px-6 py-12">
        <Show when="signed-out">
          <div className="text-center py-20">
            <h1 className="text-4xl font-bold mb-4">Private Song</h1>
            <p className="text-zinc-600 dark:text-zinc-400 mb-8">Please sign in to view private songs</p>
            <Link
              to="/"
              className="inline-block py-3 px-6 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl transition-all"
            >
              Sign In
            </Link>
          </div>
        </Show>

        <Show when="signed-in">
          {/* Loading */}
          {loading && (
            <div className="text-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-green-500 border-t-transparent mx-auto mb-6"></div>
              <p className="text-zinc-500 dark:text-zinc-400">Loading...</p>
            </div>
          )}

          {/* Error / Not Found */}
          {!loading && error && (
            <div className="text-center py-20">
              <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-4xl">❌</span>
              </div>
              <h2 className="text-2xl font-bold mb-2">Song Not Found</h2>
              <p className="text-zinc-600 dark:text-zinc-400 mb-6">
                This private song may have expired or doesn't exist.
              </p>
              <Link
                to="/studio"
                className="inline-block py-3 px-6 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl transition-all"
              >
                Create New Song
              </Link>
            </div>
          )}

          {/* Expired */}
          {!loading && !error && isExpired && (
            <div className="text-center py-20">
              <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-4xl">⏰</span>
              </div>
              <h2 className="text-2xl font-bold mb-2">This private song has expired</h2>
              <p className="text-zinc-600 dark:text-zinc-400 mb-6">
                Private songs are only available for 1 hour and have been permanently deleted.
              </p>
              <Link
                to="/studio"
                className="inline-block py-3 px-6 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl transition-all"
              >
                Create New Song
              </Link>
            </div>
          )}

          {/* Main Content */}
          {!loading && !error && !isExpired && status && (
            <div className="space-y-8">
              {/* Warning Banner */}
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">⚠️</span>
                  <div className="flex-1">
                    <h3 className="font-semibold text-amber-800 dark:text-amber-400">
                      Private Mode - Download Required
                    </h3>
                    <p className="text-sm text-amber-700 dark:text-amber-500 mt-1">
                      This song is not saved to your library. Download within{' '}
                      <ExpirationTimer 
                        createdAt={status.createdAt} 
                        className="inline"
                      />{' '}
                      or it will be lost forever.
                    </p>
                  </div>
                </div>
              </div>

              {/* Session Data Warning (if opened in new tab) */}
              {!hasSessionData && (
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-xl">ℹ️</span>
                    <div>
                      <h3 className="font-semibold text-blue-800 dark:text-blue-400">
                        Lyrics Not Available
                      </h3>
                      <p className="text-sm text-blue-700 dark:text-blue-500 mt-1">
                        This song was opened in a new tab or browser session. The audio is still available for download, but the lyrics and style information are only visible in the original tab.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Header */}
              <div>
                <Link 
                  to="/studio" 
                  className="text-sm text-zinc-500 dark:text-zinc-500 hover:text-green-500 dark:hover:text-green-400 transition-colors mb-2 inline-block"
                >
                  ← Back to Studio
                </Link>
                <h1 className="text-3xl md:text-4xl font-bold mb-2">
                  {hasSessionData && data?.originalIdea ? data.originalIdea : 'Private Song'}
                </h1>
                <div className="flex items-center gap-3">
                  <p className="text-zinc-500 dark:text-zinc-500">
                    Created on {formatDate(status.createdAt)}
                  </p>
                  {status.model === 'minimax/music-2.5' ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                      Pro
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                      Standard
                    </span>
                  )}
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                    Private
                  </span>
                </div>
              </div>

              {/* Pending State */}
              {isPending && (
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 shadow-sm">
                  <div className="flex flex-col items-center gap-4 text-center">
                    <div className="relative">
                      <div className="animate-spin rounded-full h-16 w-16 border-4 border-zinc-200 dark:border-zinc-700 border-t-green-500"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-2xl">🎵</span>
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">Creating your private song...</h3>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                        This usually takes 1-2 minutes
                      </p>
                    </div>
                    <div className="flex gap-1 mt-2">
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                    </div>
                    {polling && (
                      <p className="text-xs text-zinc-400">Checking status...</p>
                    )}
                  </div>
                </div>
              )}

              {/* Failed State */}
              {isFailed && (
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 shadow-sm">
                  <div className="flex flex-col items-center gap-4 text-center">
                    <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg text-red-600 dark:text-red-400">Generation failed</h3>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Your credits have been refunded</p>
                    </div>
                    <Link
                      to="/studio"
                      className="mt-2 py-3 px-6 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl transition-all"
                    >
                      Try Again in Studio
                    </Link>
                  </div>
                </div>
              )}

              {/* Completed State */}
              {isCompleted && status.audioUrl && (
                <>
                  <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">✅</span>
                      <div>
                        <h3 className="font-semibold text-green-800 dark:text-green-400">
                          Your song is ready!
                        </h3>
                        <p className="text-sm text-green-700 dark:text-green-500 mt-1">
                          Download now - link expires in{' '}
                          <ExpirationTimer createdAt={status.createdAt} />
                        </p>
                      </div>
                    </div>
                  </div>

                  <audio
                    controls
                    src={status.audioUrl}
                    className="w-full h-16 rounded-xl"
                    ref={(el) => {
                      if (el) registerAudioElement(el)
                    }}
                  />

                  <button
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="w-full py-4 bg-green-500 hover:bg-green-600 disabled:bg-green-400 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    {isDownloading ? (
                      <>
                        <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                        Downloading...
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download MP3
                      </>
                    )}
                  </button>
                </>
              )}

              {/* Lyrics Display - Only if we have session data */}
              {hasSessionData && data && (
                <>
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 shadow-sm">
                    <h2 className="text-xl font-semibold mb-6">Lyrics</h2>
                    <div className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300 leading-relaxed font-mono text-sm">
                      {data.lyrics}
                    </div>
                  </div>

                  {/* Style Info */}
                  <div className="bg-zinc-100 dark:bg-zinc-800/50 rounded-xl p-6">
                    <h3 className="text-sm font-semibold text-zinc-500 dark:text-zinc-500 uppercase tracking-wide mb-2">
                      Style
                    </h3>
                    <p className="text-lg">{data.prompt}</p>
                  </div>

                  {/* Original Idea */}
                  {data.originalIdea && (
                    <div className="bg-zinc-100 dark:bg-zinc-800/50 rounded-xl p-6">
                      <h3 className="text-sm font-semibold text-zinc-500 dark:text-zinc-500 uppercase tracking-wide mb-2">
                        Original Idea
                      </h3>
                      <p className="text-zinc-600 dark:text-zinc-400">{data.originalIdea}</p>
                    </div>
                  )}
                </>
              )}

              {/* Info Footer */}
              <div className="pt-8 border-t border-zinc-200 dark:border-zinc-800">
                <p className="text-sm text-zinc-500 dark:text-zinc-500">
                  This is a private song that won't appear in your library. 
                  Private songs are automatically deleted after 1 hour.
                </p>
              </div>
            </div>
          )}
        </Show>
      </main>
    </div>
  )
}

export default EphemeralSong
