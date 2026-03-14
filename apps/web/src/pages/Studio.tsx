import { useState, useEffect } from 'react'
import { Show, useAuth } from '@clerk/react'
import { Link, useSearchParams, useNavigate } from 'react-router'
import { registerAudioElement } from '../lib/audioManager.ts'
import { useApi } from '../hooks/useApi'

const API_URL = import.meta.env.VITE_API_URL || ''

// Blob animation keyframes
const blobStyles = `
  @keyframes blob-morph {
    0%, 100% {
      border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%;
    }
    25% {
      border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%;
    }
    50% {
      border-radius: 50% 60% 30% 60% / 30% 50% 70% 40%;
    }
    75% {
      border-radius: 60% 40% 60% 30% / 70% 40% 50% 60%;
    }
  }
  @keyframes blob-pulse {
    0%, 100% {
      transform: scale(1);
      opacity: 0.2;
    }
    50% {
      transform: scale(1.1);
      opacity: 0.3;
    }
  }
`

interface ModelConfig {
  id: string
  cost: number
  constraints: {
    lyrics: { min: number; max: number }
    prompt: { min: number; max: number }
  }
}

function Studio() {
  const { userId, isLoaded } = useAuth()
  const { fetchWithAuth } = useApi()
  const [searchParams] = useSearchParams()
  const [step, setStep] = useState<'input' | 'lyrics' | 'generating'>('input')
  const [songIdea, setSongIdea] = useState('')
  const [lyrics, setLyrics] = useState('')
  const [prompt, setPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isGeneratingLyrics, setIsGeneratingLyrics] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [credits, setCredits] = useState(0)
  const [lifetimeCredits, setLifetimeCredits] = useState(0)
  const [modelConfig, setModelConfig] = useState<ModelConfig | null>(null)
  const [generationId, setGenerationId] = useState<string | null>(null)
  const [generationStatus, setGenerationStatus] = useState<'idle' | 'pending' | 'completed' | 'failed'>('idle')
  const [skipReview, setSkipReview] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('app-settings-skip-review')
      return saved ? JSON.parse(saved) : false
    }
    return false
  })
  const navigate = useNavigate()

  // Save skipReview preference to localStorage
  useEffect(() => {
    localStorage.setItem('app-settings-skip-review', JSON.stringify(skipReview))
  }, [skipReview])

  // Check for pre-filled lyrics and style from URL params
  useEffect(() => {
    const prefillLyrics = searchParams.get('lyrics')
    const prefillStyle = searchParams.get('style')
    
    if (prefillLyrics) {
      setLyrics(prefillLyrics)
      setStep('lyrics')
    }
    if (prefillStyle) {
      setPrompt(prefillStyle)
    }
  }, [searchParams])

  useEffect(() => {
    if (isLoaded && userId) {
      fetchStatus()
      fetchConstraints()
    }
  }, [isLoaded, userId])

  const fetchStatus = async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/subscription/status`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setCredits(data.credits)
      setLifetimeCredits(data.lifetimeCredits || 0)
    } catch (err) {
      console.error('Failed to fetch status:', err)
    }
  }

  const fetchConstraints = async () => {
    try {
      const res = await fetch(`${API_URL}/api/generations/config`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setModelConfig(data)
    } catch (err) {
      console.error('Failed to fetch constraints:', err)
    }
  }

  const generateLyricsFromIdea = async () => {
    if (!songIdea.trim()) return
    
    setIsGeneratingLyrics(true)
    setStep('generating')
    try {
      const res = await fetchWithAuth(`${API_URL}/api/generations/lyrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: songIdea
        })
      })
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      
      if (data.lyrics) {
        setLyrics(data.lyrics)
        if (data.style) {
          setPrompt(data.style)
        }
        if (skipReview) {
          // Auto-generate without showing review step - stay on generating step
          handleAutoGenerate(data.lyrics, data.style || '')
        } else {
          setStep('lyrics')
        }
      } else if (data.error) {
        setError(data.error)
        setStep('input')
      }
    } catch (err) {
      setError('Failed to generate lyrics')
      setStep('input')
    } finally {
      setIsGeneratingLyrics(false)
    }
  }

  const goToLyricsDirectly = () => {
    setStep('lyrics')
  }

  const goBackToInput = () => {
    setStep('input')
    setError('')
    setGenerationStatus('idle')
    setGenerationId(null)
    setAudioUrl(null)
  }

  const pollGenerationStatus = async (id: string) => {
    const poll = async () => {
      try {
        const res = await fetchWithAuth(`${API_URL}/api/generations/status/${id}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        
        const data = await res.json()
        setGenerationStatus(data.status)
        
        if (data.status === 'completed') {
          setAudioUrl(data.audioUrl)
          setIsGenerating(false)
          setGenerationId(null)
        } else if (data.status === 'failed') {
          setError('Generation failed. Credits have been refunded.')
          setIsGenerating(false)
          setGenerationId(null)
          fetchStatus() // Refresh credits
        } else {
          // Still pending, poll again in 3 seconds
          setTimeout(() => poll(), 3000)
        }
      } catch (err) {
        console.error('Failed to poll status:', err)
        setTimeout(() => poll(), 3000)
      }
    }
    
    poll()
  }

  const handleGenerate = async () => {
    if (!lyrics.trim()) return
    await generateSong(lyrics, prompt)
  }

  const handleAutoGenerate = async (autoLyrics: string, autoPrompt: string) => {
    await generateSong(autoLyrics, autoPrompt)
  }

  const generateSong = async (songLyrics: string, songPrompt: string) => {
    setIsGenerating(true)
    setError('')
    setAudioUrl(null)
    setGenerationStatus('pending')

    try {
      const res = await fetchWithAuth(`${API_URL}/api/generations/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lyrics: songLyrics,
          prompt: songPrompt
        })
      })

      if (!res.ok) {
        if (res.status === 401) {
          setError('Session expired. Please sign in again.')
          setIsGenerating(false)
          setGenerationStatus('idle')
          setStep('input')
          return
        }
        throw new Error(`HTTP ${res.status}`)
      }

      const data = await res.json()

      if (data.error) {
        setError(data.error)
        setIsGenerating(false)
        setGenerationStatus('idle')
        setStep('input')
      } else {
        setGenerationId(data.generationId)
        fetchStatus()
        // Navigate to song page to view status
        navigate(`/song/${data.generationId}`)
        // Start polling for status
        pollGenerationStatus(data.generationId)
      }
    } catch (err: any) {
      setError('Failed to start generation')
      setIsGenerating(false)
      setGenerationStatus('idle')
      setStep('input')
    }
  }

  const lyricsValid = !modelConfig || (lyrics.length >= modelConfig.constraints.lyrics.min && lyrics.length <= modelConfig.constraints.lyrics.max)
  const promptValid = !modelConfig || (prompt.length >= modelConfig.constraints.prompt.min && prompt.length <= modelConfig.constraints.prompt.max)
  const canGenerate = lyrics.trim() && lyricsValid && promptValid
  const songCost = modelConfig?.cost ?? 10

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors">
      <style>{blobStyles}</style>
      <main className="max-w-4xl mx-auto px-6 py-12">
        <Show when="signed-out">
          <div className="text-center py-20">
            <h1 className="text-4xl font-bold mb-4">Studio</h1>
            <p className="text-zinc-600 dark:text-zinc-400 mb-8">Please sign in to use the music generator</p>
            <Link
              to="/"
              className="inline-block py-3 px-6 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl transition-all"
            >
              Sign In
            </Link>
          </div>
        </Show>

        <Show when="signed-in">
          {/* Step 1: Simple Input */}
          {step === 'input' && (
            <div className="max-w-2xl mx-auto">
              <div className="text-center mb-12">
                <h1 className="text-4xl font-bold mb-4">Create your jam</h1>
                <p className="text-zinc-600 dark:text-zinc-400">Give us the spark, we'll write the fire</p>
              </div>

              <div className="space-y-4">
                <textarea
                  value={songIdea}
                  onChange={(e) => setSongIdea(e.target.value)}
                  placeholder="e.g., A love song about summer nights, jazz style, romantic and dreamy..."
                  className="w-full h-32 px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none shadow-sm transition-all"
                />

                {/* Examples */}
                <div className="flex flex-wrap gap-2">
                  <span className="text-sm text-zinc-500 dark:text-zinc-500 py-1">Try:</span>
                  {[
                    'Jazz love song, romantic and dreamy',
                    'Upbeat pop about dancing all night',
                    'Melancholic acoustic about rain',
                    'Electronic dance track, energetic',
                    'Lofi hip hop for studying'
                  ].map((example) => (
                    <button
                      key={example}
                      onClick={() => setSongIdea(example)}
                      className="text-xs px-3 py-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 rounded-full transition-colors"
                    >
                      {example}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-4 pt-2">
                  <button
                    onClick={generateLyricsFromIdea}
                    disabled={!songIdea.trim() || isGeneratingLyrics}
                    className="w-full py-4 bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-lg rounded-xl shadow-lg hover:shadow-xl transition-all disabled:shadow-none"
                  >
                    {isGeneratingLyrics ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                        Writing Your Song...
                      </span>
                    ) : (
                      skipReview ? 'Surprise Me' : 'Write My Lyrics ✍️'
                    )}
                  </button>

                  <div className="flex items-center justify-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={skipReview}
                        onChange={(e) => setSkipReview(e.target.checked)}
                        className="w-4 h-4 rounded border-zinc-300 text-green-500 focus:ring-green-500"
                      />
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">Skip review & generate directly</span>
                    </label>
                  </div>

                  <button
                    onClick={goToLyricsDirectly}
                    className="text-zinc-500 dark:text-zinc-400 hover:text-green-500 dark:hover:text-green-400 text-sm font-medium transition-colors"
                  >
                    I already have lyrics →
                  </button>
                </div>

                {error && (
                  <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl p-4 text-red-600 dark:text-red-400">
                    {error}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Loading State */}
          {step === 'generating' && (
            <div className="max-w-2xl mx-auto text-center py-20">
              {/* Liquid Morphing Blob */}
              <div className="relative w-32 h-32 mx-auto mb-8">
                {/* Main blob */}
                <div 
                  className="absolute inset-0 bg-gradient-to-br from-green-400 via-green-500 to-green-600 opacity-90"
                  style={{
                    borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%',
                    animation: 'blob-morph 4s ease-in-out infinite'
                  }}
                />
                {/* Secondary blob */}
                <div 
                  className="absolute inset-2 bg-gradient-to-br from-green-300 via-green-400 to-green-500 opacity-70"
                  style={{
                    borderRadius: '40% 60% 70% 30% / 40% 70% 30% 60%',
                    animation: 'blob-morph 4s ease-in-out infinite reverse'
                  }}
                />
                {/* Inner blob */}
                <div 
                  className="absolute inset-4 bg-gradient-to-br from-green-200 via-green-300 to-green-400 opacity-60"
                  style={{
                    borderRadius: '30% 70% 60% 40% / 70% 40% 60% 30%',
                    animation: 'blob-morph 3s ease-in-out infinite'
                  }}
                />
                {/* Glow effect */}
                <div 
                  className="absolute -inset-4 bg-green-500 opacity-20 blur-xl"
                  style={{
                    borderRadius: '50%',
                    animation: 'blob-pulse 3s ease-in-out infinite'
                  }}
                />
              </div>
              <h2 className="text-2xl font-bold mb-2">Writing your masterpiece...</h2>
              <p className="text-zinc-600 dark:text-zinc-400">This will just take a moment</p>
            </div>
          )}

          {/* Step 2: Lyrics & Generate */}
          {step === 'lyrics' && (
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold mb-2">Review & Generate</h1>
                  <p className="text-zinc-600 dark:text-zinc-400">Edit the lyrics if needed, then create your music</p>
                </div>
                <button
                  onClick={goBackToInput}
                  className="text-zinc-500 dark:text-zinc-400 hover:text-green-500 dark:hover:text-green-400 text-sm font-medium transition-colors"
                >
                  ← Start Over
                </button>
              </div>

              {/* Lyrics & Style Section */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
                {/* Lyrics */}
                <div className="mb-6">
                  <div className="flex justify-between items-center mb-4">
                    <label htmlFor="lyrics" className="block font-semibold text-lg">
                      Lyrics
                    </label>
                    <div className="flex items-center gap-3">
                      {lyrics && (
                        <button
                          onClick={() => setLyrics('')}
                          disabled={isGenerating}
                          className="text-sm text-zinc-500 hover:text-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Clear
                        </button>
                      )}
                      <span className="text-sm text-zinc-500 dark:text-zinc-500">
                        Edit as needed
                      </span>
                    </div>
                  </div>

                  <textarea
                    id="lyrics"
                    value={lyrics}
                    onChange={(e) => setLyrics(e.target.value)}
                    placeholder="Enter your lyrics here..."
                    disabled={isGenerating}
                    className="w-full h-64 px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none disabled:opacity-50 transition-all"
                  />
                  {modelConfig && (
                    <div className="flex justify-between mt-2">
                      <p className={`text-sm ${lyricsValid ? 'text-zinc-500 dark:text-zinc-500' : 'text-red-500'}`}>
                        {lyrics.length} / {modelConfig.constraints.lyrics.max} characters
                      </p>
                      {lyrics.length < modelConfig.constraints.lyrics.min && (
                        <p className="text-sm text-red-500">
                          Minimum {modelConfig.constraints.lyrics.min} characters required
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className="border-t border-zinc-200 dark:border-zinc-800 my-6"></div>

                {/* Style */}
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <label htmlFor="prompt" className="block font-semibold text-lg">
                      Style
                    </label>
                    {prompt && (
                      <button
                        onClick={() => setPrompt('')}
                        disabled={isGenerating}
                        className="text-sm text-zinc-500 hover:text-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <textarea
                    id="prompt"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe the style, mood, instruments..."
                    disabled={isGenerating}
                    className="w-full h-28 px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none disabled:opacity-50 transition-all"
                  />
                  {modelConfig && (
                    <div className="flex justify-between mt-2">
                      <p className={`text-sm ${promptValid ? 'text-zinc-500 dark:text-zinc-500' : 'text-red-500'}`}>
                        {prompt.length} / {modelConfig.constraints.prompt.max} characters
                      </p>
                      {prompt.length < modelConfig.constraints.prompt.min && (
                        <p className="text-sm text-red-500">
                          Minimum {modelConfig.constraints.prompt.min} characters required
                        </p>
                      )}
                    </div>
                  )}
                  <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">
                    Examples: Jazz, Pop, Electronic, Rock, Classical, Lo-fi, Upbeat, Melancholic
                  </p>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl p-4 text-red-600 dark:text-red-400">
                  {error}
                </div>
              )}

              {/* Generate Button */}
              <div className="flex flex-col items-center gap-4">
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || (credits + lifetimeCredits) < songCost || !canGenerate}
                  className="w-full max-w-md py-4 bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-lg rounded-xl shadow-lg hover:shadow-xl transition-all disabled:shadow-none"
                >
                  {isGenerating ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                      {generationStatus === 'pending' ? 'Waiting for AI...' : 'Crafting Your Track...'}
                    </span>
                  ) : credits + lifetimeCredits < songCost ? (
                      'No Credits - Subscribe to Generate'
                    ) : (
                      'Make It Sing ✨'
                    )}
                </button>

                {credits + lifetimeCredits >= songCost && (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Each song costs {songCost} credits
                  </p>
                )}

                <p className="text-xs text-zinc-400 dark:text-zinc-600">
                  {credits + lifetimeCredits} credits remaining
                  {lifetimeCredits > 0 && ` (${lifetimeCredits} lifetime)`}
                </p>
              </div>

              {/* Result */}
              {generationStatus === 'pending' && generationId && (
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 shadow-lg">
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
                      <p className="text-sm text-green-500 mt-2">Navigating to song page...</p>
                    </div>
                    <div className="flex gap-1 mt-2">
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                    </div>
                  </div>
                </div>
              )}

              {audioUrl && generationStatus === 'completed' && (
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 shadow-lg">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                      <span className="text-2xl">🎉</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">Your music is ready!</h3>
                      <p className="text-sm text-zinc-500 dark:text-zinc-500">Listen and download below</p>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <audio 
                      key={audioUrl}
                      controls 
                      src={audioUrl}
                      className="w-full h-14 rounded-xl"
                      ref={(el) => {
                        if (el) registerAudioElement(el)
                      }}
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          // Open in new tab - works best on mobile
                          window.open(audioUrl, '_blank')
                        }}
                        className="flex-1 py-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-semibold rounded-xl transition-all"
                      >
                        Download ↓
                      </button>
                      <button 
                        onClick={() => navigate(`/song/${generationId}`)}
                        className="flex-1 py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl transition-all"
                      >
                        View Full Page
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </Show>
      </main>
    </div>
  )
}

export default Studio
