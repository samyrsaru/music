import { useState, useEffect } from 'react'
import { Show, useAuth } from '@clerk/react'
import { Link, useParams, useNavigate } from 'react-router'
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

function Song() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { userId, isLoaded } = useAuth()
  const { fetchWithAuth } = useApi()
  const [generation, setGeneration] = useState<Generation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState('')
  const [isSavingName, setIsSavingName] = useState(false)
  const [nameError, setNameError] = useState('')

  const NAME_MIN_LENGTH = 1
  const NAME_MAX_LENGTH = 60

  useEffect(() => {
    if (isLoaded && userId && id) fetchGeneration()
  }, [isLoaded, userId, id])

  useEffect(() => {
    if (!generation || generation.status !== 'pending') return
    
    const interval = setInterval(() => {
      fetchGeneration()
    }, 3000)

    return () => clearInterval(interval)
  }, [generation?.status])

  const fetchGeneration = async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/generations/${id}`)
      const data = await res.json()
      
      if (data.error) {
        setError(data.error)
      } else {
        console.log('Generation data:', data)
        console.log('Name:', data.name, 'Prompt:', data.prompt)
        setGeneration(data)
      }
    } catch (err) {
      setError('Failed to load song')
    } finally {
      setLoading(false)
    }
  }

  const goToStudioWithPreset = () => {
    if (!generation) return
    const params = new URLSearchParams({
      lyrics: generation.lyrics,
      style: generation.prompt
    })
    navigate(`/studio?${params.toString()}`)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr + 'Z').toLocaleString(undefined, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  }

  const saveName = async () => {
    const trimmed = editedName.trim()
    
    if (trimmed.length < NAME_MIN_LENGTH) {
      setNameError(`Name must be at least ${NAME_MIN_LENGTH} character`)
      return
    }
    if (trimmed.length > NAME_MAX_LENGTH) {
      setNameError(`Name must be less than ${NAME_MAX_LENGTH} characters`)
      return
    }
    
    setNameError('')
    if (!id) return
    
    setIsSavingName(true)
    try {
      const res = await fetchWithAuth(`${API_URL}/api/generations/${id}/name`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editedName.trim() })
      })
      
      if (res.ok) {
        setGeneration({ ...generation!, name: editedName.trim() })
        setIsEditingName(false)
      }
    } catch (err) {
      console.error('Failed to save name:', err)
    } finally {
      setIsSavingName(false)
    }
  }

  const startEditingName = () => {
    setEditedName(generation?.name || '')
    setIsEditingName(true)
  }

  const cancelEditingName = () => {
    setIsEditingName(false)
    setEditedName('')
  }

  const deleteGeneration = async () => {
    if (!id) return
    
    setDeleting(true)
    try {
      const res = await fetchWithAuth(`${API_URL}/api/generations/${id}`, {
        method: 'DELETE',
      })
      
      const data = await res.json()
      
      if (data.error) {
        setError(data.error)
      } else {
        navigate('/library')
      }
    } catch (err) {
      setError('Failed to delete song')
    } finally {
      setDeleting(false)
      setDeleteConfirm(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors">
      <main className="max-w-4xl mx-auto px-6 py-12">
        <Show when="signed-out">
          <div className="text-center py-20">
            <h1 className="text-4xl font-bold mb-4">Song Details</h1>
            <p className="text-zinc-600 dark:text-zinc-400 mb-8">Please sign in to view songs</p>
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
              <p className="text-zinc-500 dark:text-zinc-400">Loading song...</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-center py-20">
              <div className="w-20 h-20 bg-red-100 dark:bg-red-950/30 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-4xl">😕</span>
              </div>
              <h2 className="text-2xl font-bold mb-2">Oops!</h2>
              <p className="text-zinc-600 dark:text-zinc-400 mb-6">{error}</p>
              <Link
                to="/library"
                className="inline-block py-3 px-6 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
              >
                Back to Library
              </Link>
            </div>
          )}

          {/* Song Details */}
          {!loading && !error && generation && (
            <div className="space-y-8">
              {/* Header */}
              <div>
                  <Link 
                    to="/library" 
                    className="text-sm text-zinc-500 dark:text-zinc-500 hover:text-green-500 dark:hover:text-green-400 transition-colors mb-2 inline-block"
                  >
                    ← Back to Library
                  </Link>
                {isEditingName ? (
                  <div className="mb-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editedName}
                        onChange={(e) => {
                          setEditedName(e.target.value)
                          setNameError('')
                        }}
                        className="text-3xl md:text-4xl font-bold bg-transparent border-b-2 border-green-500 focus:outline-none w-full"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveName()
                          if (e.key === 'Escape') cancelEditingName()
                        }}
                      />
                      <button
                        onClick={saveName}
                        disabled={isSavingName}
                        className="text-green-500 hover:text-green-600 disabled:opacity-50"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                      <button
                        onClick={cancelEditingName}
                        className="text-zinc-500 hover:text-zinc-600"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      {nameError ? (
                        <p className="text-sm text-red-500">{nameError}</p>
                      ) : (
                        <span></span>
                      )}
                      <span className="text-sm text-zinc-500">
                        {editedName.length} / {NAME_MAX_LENGTH}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 group">
                    <h1 className="text-3xl md:text-4xl font-bold mb-2">{generation.name || generation.prompt}</h1>
                    <button
                      onClick={startEditingName}
                      className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-green-500 transition-opacity mb-2"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </div>
                )}
                <p className="text-zinc-500 dark:text-zinc-500">
                  Created on {formatDate(generation.createdAt)}
                </p>
              </div>

              {/* Audio Player or Pending State */}
              {generation.status === 'pending' ? (
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 shadow-sm">
                  <div className="flex flex-col items-center gap-4 text-center">
                    <div className="relative">
                      <div className="animate-spin rounded-full h-16 w-16 border-4 border-zinc-200 dark:border-zinc-700 border-t-green-500"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-2xl">🎵</span>
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">Creating your music...</h3>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">This usually takes 1-2 minutes</p>
                    </div>
                    <div className="flex gap-1 mt-2">
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                    </div>
                  </div>
                </div>
              ) : generation.status === 'failed' ? (
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
              ) : (
                <>
                  <audio
                    controls
                    src={generation.audioUrl}
                    className="w-full h-16 rounded-xl"
                    ref={(el) => {
                      if (el) registerAudioElement(el)
                    }}
                  />

                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row gap-4">
                    <button
                      onClick={() => {
                        console.log('Download clicked - name:', generation.name, 'prompt:', generation.prompt)
                        const filename = `${generation.name?.trim() || generation.prompt || 'makemusic'}.mp3`
                        console.log('Filename:', filename)
                        window.open(generation.audioUrl, '_blank')
                      }}
                      className="flex-1 py-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold rounded-xl hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-all flex items-center justify-center gap-2"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download
                    </button>
                    <button
                      onClick={goToStudioWithPreset}
                      className="flex-1 py-4 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Remix in Studio
                    </button>
                  </div>
                </>
              )}

              {/* Lyrics */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 shadow-sm">
                <h2 className="text-xl font-semibold mb-6">Lyrics</h2>
                <div className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300 leading-relaxed font-mono text-sm">
                  {generation.lyrics}
                </div>
              </div>

              {/* Style Info */}
              <div className="bg-zinc-100 dark:bg-zinc-800/50 rounded-xl p-6">
                <h3 className="text-sm font-semibold text-zinc-500 dark:text-zinc-500 uppercase tracking-wide mb-2">
                  Style
                </h3>
                <p className="text-lg">{generation.prompt}</p>
              </div>

              {/* Delete Button */}
              <div className="pt-8 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  onClick={() => setDeleteConfirm(true)}
                  className="flex items-center gap-2 px-4 py-2 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-all text-sm font-medium"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete Song
                </button>
              </div>
            </div>
          )}
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
              <h3 className="text-lg font-semibold">Delete Song?</h3>
            </div>
            <p className="text-zinc-600 dark:text-zinc-400 mb-6">
              This action cannot be undone. The audio file and all associated data will be permanently deleted.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(false)}
                className="flex-1 py-2.5 px-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={deleteGeneration}
                disabled={deleting}
                className="flex-1 py-2.5 px-4 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-medium rounded-lg transition-all flex items-center justify-center gap-2"
              >
                {deleting ? (
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
    </div>
  )
}

export default Song
