import { useState, useEffect } from 'react'
import { UserButton, Show, useAuth } from '@clerk/react'
import { Link } from 'react-router'
import { ThemeToggle } from '../components/ThemeToggle.tsx'

interface Generation {
  id: string
  lyrics: string
  prompt: string
  audioUrl: string
  createdAt: string
}

function MyMusic() {
  const { userId, isLoaded } = useAuth()
  const [generations, setGenerations] = useState<Generation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isLoaded && userId) fetchGenerations()
  }, [isLoaded, userId])

  const fetchGenerations = async () => {
    try {
      const res = await fetch('/api/generations')
      const data = await res.json()
      
      if (data.error) {
        setError(data.error)
      } else {
        setGenerations(data.generations || [])
      }
    } catch (err) {
      setError('Failed to load your music library')
    } finally {
      setLoading(false)
    }
  }

  const downloadAudio = async (url: string, filename: string) => {
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(blobUrl)
    } catch (err) {
      console.error('Download failed:', err)
      window.open(url, '_blank')
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const truncateLyrics = (lyrics: string, maxLength: number = 120) => {
    if (lyrics.length <= maxLength) return lyrics
    return lyrics.substring(0, maxLength) + '...'
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors">
      {/* Navigation */}
      <nav className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 flex justify-between items-center">
        <Link to="/" className="text-xl font-semibold tracking-tight">
          <span className="text-orange-500">Make</span>Music
        </Link>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <Link 
            to="/studio" 
            className="text-zinc-600 dark:text-zinc-400 hover:text-orange-500 dark:hover:text-orange-400 transition-colors text-sm font-medium"
          >
            Studio
          </Link>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <Show when="signed-out">
          <div className="text-center py-20">
            <h1 className="text-4xl font-bold mb-4">My Library</h1>
            <p className="text-zinc-600 dark:text-zinc-400 mb-8">Please sign in to view your music library</p>
            <Link
              to="/"
              className="inline-block py-3 px-6 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl transition-all"
            >
              Sign In
            </Link>
          </div>
        </Show>

        <Show when="signed-in">
          <div>
            <div className="mb-8">
              <h1 className="text-3xl font-bold mb-2">My Library</h1>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl p-4 text-red-600 dark:text-red-400 mb-6">
                {error}
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-orange-500 border-t-transparent mx-auto mb-4"></div>
                <p className="text-zinc-500 dark:text-zinc-400">Loading your music...</p>
              </div>
            )}

            {/* Empty State */}
            {!loading && !error && generations.length === 0 && (
              <div className="text-center py-16 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
                <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-6">
                  <span className="text-4xl">🎵</span>
                </div>
                <h3 className="text-xl font-semibold mb-2">No music yet</h3>
                <p className="text-zinc-600 dark:text-zinc-400 mb-6 max-w-sm mx-auto">
                  Create your first AI-generated song in the Studio
                </p>
                <Link
                  to="/studio"
                  className="inline-block py-3 px-6 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl transition-all"
                >
                  Go to Studio
                </Link>
              </div>
            )}

            {/* Generations Grid */}
            {!loading && generations.length > 0 && (
              <div className="grid gap-6 md:grid-cols-2">
                {generations.map((gen) => (
                  <div 
                    key={gen.id}
                    className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden hover:border-orange-300 dark:hover:border-orange-700 transition-all shadow-sm hover:shadow-md"
                  >
                    <div className="p-6 space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs text-zinc-500 dark:text-zinc-500 uppercase tracking-wide mb-1">
                            {formatDate(gen.createdAt)}
                          </p>
                          <h3 className="font-semibold text-lg leading-tight" title={gen.prompt}>
                            {gen.prompt}
                          </h3>
                        </div>
                      </div>

                      <div className="bg-zinc-50 dark:bg-zinc-950 rounded-lg p-4 border border-zinc-100 dark:border-zinc-800">
                        <p className="text-zinc-600 dark:text-zinc-400 text-sm italic leading-relaxed">
                          "{truncateLyrics(gen.lyrics)}"
                        </p>
                      </div>

                      <audio
                        controls
                        src={gen.audioUrl}
                        className="w-full h-14 rounded-xl"
                      />

                      <button
                        onClick={() => downloadAudio(gen.audioUrl, `makemusic-${gen.id}.mp3`)}
                        className="w-full py-2.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                      >
                        Download
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Show>
      </main>
    </div>
  )
}

export default MyMusic
