import { useState, useEffect } from 'react'
import { Show, useAuth } from '@clerk/react'
import { Link } from 'react-router'
import { registerAudioElement } from '../lib/audioManager.ts'
import { useApi } from '../hooks/useApi'

interface Generation {
  id: string
  lyrics: string
  prompt: string
  name?: string
  audioUrl: string
  status: 'pending' | 'completed' | 'failed'
  createdAt: string
}

const API_URL = import.meta.env.VITE_API_URL || ''

function MyMusic() {
  const { userId, isLoaded } = useAuth()
  const { fetchWithAuth } = useApi()
  const [generations, setGenerations] = useState<Generation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const filteredGenerations = generations.filter(gen => 
    gen.prompt.toLowerCase().includes(search.toLowerCase()) ||
    gen.lyrics.toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => {
    if (isLoaded && userId) fetchGenerations()
  }, [isLoaded, userId])

  const fetchGenerations = async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/generations`)
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

  const deleteGeneration = async (id: string) => {
    setDeleting(id)
    try {
      const res = await fetchWithAuth(`${API_URL}/api/generations/${id}`, {
        method: 'DELETE',
      })
      
      const data = await res.json()
      
      if (data.error) {
        setError(data.error)
      } else {
        // Remove from local state
        setGenerations(generations.filter(g => g.id !== id))
        setDeleteConfirm(null)
      }
    } catch (err) {
      setError('Failed to delete track')
    } finally {
      setDeleting(null)
    }
  }

  const downloadAudio = (url: string, filename: string) => {
    const safeName = filename.replace(/[^a-zA-Z0-9\-_\s]/g, '').trim() || 'makemusic'
    const link = document.createElement('a')
    link.href = url
    link.download = `${safeName}.mp3`
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr + 'Z').toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors">
      <main className="max-w-6xl mx-auto px-6 py-12">
        <Show when="signed-out">
          <div className="text-center py-20">
            <h1 className="text-4xl font-bold mb-4">Library</h1>
            <p className="text-zinc-600 dark:text-zinc-400 mb-8">Please sign in to view your music library</p>
            <Link
              to="/"
              className="inline-block py-3 px-6 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl transition-all"
            >
              Sign In
            </Link>
          </div>
        </Show>

        <Show when="signed-in">
          <div>
            <div className="mb-8 flex justify-between items-center">
              <h1 className="text-3xl font-bold">Library</h1>
              <Link
                to="/studio"
                className="flex items-center gap-2 py-2.5 px-5 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all"
              >
                <span className="text-lg">+</span>
                <span>New Song</span>
              </Link>
            </div>

            {/* Search */}
            {generations.length > 0 && (
              <div className="mb-6">
                <input
                  type="text"
                  placeholder="Search your songs..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                />
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl p-4 text-red-600 dark:text-red-400 mb-6">
                {error}
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-500 border-t-transparent mx-auto mb-4"></div>
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
                  className="inline-block py-3 px-6 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl transition-all"
                >
                  Go to Studio
                </Link>
              </div>
            )}

            {/* Generations Grid */}
            {!loading && filteredGenerations.length > 0 && (
              <div className="grid gap-6 md:grid-cols-2">
                {filteredGenerations.map((gen) => (
                  <div 
                    key={gen.id}
                    className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden hover:border-green-300 dark:hover:border-green-700 transition-all shadow-sm hover:shadow-md"
                  >
                    <Link to={`/song/${gen.id}`} className="block p-6 space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-zinc-500 dark:text-zinc-500 uppercase tracking-wide mb-1">
                            {formatDate(gen.createdAt)}
                          </p>
                          <h3 className="font-semibold text-lg leading-tight" title={gen.name || gen.prompt}>
                            {gen.name || gen.prompt}
                          </h3>
                        </div>
                        <button
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setDeleteConfirm(gen.id)
                          }}
                          className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-all"
                          title="Delete track"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>

                      {gen.status === 'pending' ? (
                        <div className="flex flex-col items-center gap-3 py-4">
                          <div className="relative">
                            <div className="animate-spin rounded-full h-12 w-12 border-4 border-zinc-200 dark:border-zinc-700 border-t-green-500"></div>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-lg">🎵</span>
                            </div>
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Creating your music...</p>
                            <div className="flex gap-1 justify-center mt-2">
                              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                            </div>
                          </div>
                        </div>
                      ) : gen.status === 'failed' ? (
                        <div className="flex flex-col items-center gap-3 py-4">
                          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-medium text-red-600 dark:text-red-400">Generation failed</p>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Credits refunded</p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <audio
                            controls
                            src={gen.audioUrl}
                            className="w-full h-14 rounded-xl"
                            onClick={(e) => e.stopPropagation()}
                            ref={(el) => {
                              if (el) registerAudioElement(el)
                            }}
                          />

                          <div className="flex gap-3">
                            <button
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                downloadAudio(gen.audioUrl, `${gen.name || gen.prompt || 'makemusic'}.mp3`)
                              }}
                              className="w-full py-2.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                            >
                              Download
                            </button>
                          </div>
                        </>
                      )}
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Show>
      </main>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold">Delete Track?</h3>
            </div>
            <p className="text-zinc-600 dark:text-zinc-400 mb-6">
              This action cannot be undone. The audio file and all associated data will be permanently deleted.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 px-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                disabled={deleting === deleteConfirm}
              >
                Cancel
              </button>
              <button
                onClick={() => deleteGeneration(deleteConfirm)}
                disabled={deleting === deleteConfirm}
                className="flex-1 py-2.5 px-4 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-medium rounded-lg transition-all flex items-center justify-center gap-2"
              >
                {deleting === deleteConfirm ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    Deleting...
                  </>
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
              </div>
            )}

            {/* No Search Results */}
            {!loading && search && filteredGenerations.length === 0 && generations.length > 0 && (
              <div className="text-center py-12">
                <p className="text-zinc-500 dark:text-zinc-400">No songs match "{search}"</p>
                <button
                  onClick={() => setSearch('')}
                  className="mt-2 text-green-500 hover:text-green-600 font-medium"
                >
                  Clear search
                </button>
              </div>
            )}
    </div>
  )
}

export default MyMusic
