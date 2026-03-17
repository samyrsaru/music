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
  nickname: string
  cost: number
  constraints: {
    lyrics: { min: number; max: number }
    prompt: { min: number; max: number }
  }
}

interface ConfigResponse {
  models: ModelConfig[]
  defaultModel: string
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
  const [credits, setCredits] = useState<number | null>(null)
  const [lifetimeCredits, setLifetimeCredits] = useState(0)
  const [creditsLoaded, setCreditsLoaded] = useState(false)
  const [availableModels, setAvailableModels] = useState<ModelConfig[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [generationId, setGenerationId] = useState<string | null>(null)
  const [generationStatus, setGenerationStatus] = useState<'idle' | 'pending' | 'completed' | 'failed'>('idle')
  const [skipReview, setSkipReview] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('app-settings-skip-review')
      return saved ? JSON.parse(saved) : false
    }
    return false
  })
  const [startingCheckout, setStartingCheckout] = useState(false)
  const navigate = useNavigate()

  // Save skipReview preference to localStorage
  useEffect(() => {
    localStorage.setItem('app-settings-skip-review', JSON.stringify(skipReview))
  }, [skipReview])

  // Check for pre-filled lyrics, style, and model from URL params
  useEffect(() => {
    const prefillLyrics = searchParams.get('lyrics')
    const prefillStyle = searchParams.get('style')
    const prefillModel = searchParams.get('model')

    if (prefillLyrics) {
      setLyrics(prefillLyrics)
      setStep('lyrics')
    }
    if (prefillStyle) {
      setPrompt(prefillStyle)
    }
    if (prefillModel && availableModels.some(m => m.id === prefillModel)) {
      setSelectedModel(prefillModel)
    }
  }, [searchParams, availableModels])

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
      setCreditsLoaded(true)
    } catch (err) {
      console.error('Failed to fetch status:', err)
      setCreditsLoaded(true)
    }
  }

  const fetchConstraints = async () => {
    try {
      const res = await fetch(`${API_URL}/api/generations/config`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as ConfigResponse
      setAvailableModels(data.models)
      setSelectedModel(data.defaultModel)
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
          topic: songIdea,
          model: selectedModel
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

  const startCheckout = async () => {
    setStartingCheckout(true)
    try {
      const res = await fetchWithAuth(`${API_URL}/api/subscription/checkout`, {
        method: 'POST'
      })
      const { checkoutUrl, error } = await res.json()
      if (error) {
        setError(error)
      } else if (checkoutUrl) {
        window.location.href = checkoutUrl
      }
    } catch (err) {
      setError('Failed to start checkout')
    } finally {
      setStartingCheckout(false)
    }
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
    await generateSong(autoLyrics, autoPrompt, songIdea)
  }

  const generateSong = async (songLyrics: string, songPrompt: string, originalConcept?: string) => {
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
          prompt: songPrompt,
          originalIdea: originalConcept || songIdea,
          model: selectedModel
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

  const currentModelConfig = availableModels.find(m => m.id === selectedModel) || availableModels[0]
  const lyricsValid = !currentModelConfig || (lyrics.length >= currentModelConfig.constraints.lyrics.min && lyrics.length <= currentModelConfig.constraints.lyrics.max)
  const promptValid = !currentModelConfig || (prompt.length >= currentModelConfig.constraints.prompt.min && prompt.length <= currentModelConfig.constraints.prompt.max)
  const canGenerate = lyrics.trim() && lyricsValid && promptValid
  const songCost = currentModelConfig?.cost ?? 10

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

                {/* Pro Mode Toggle */}
                {availableModels.length > 0 && (
                  <div className="space-y-2">
                    <button
                      onClick={() => setSelectedModel(selectedModel === 'minimax/music-2.5' ? 'minimax/music-1.5' : 'minimax/music-2.5')}
                      className={`flex items-center justify-between w-full py-2.5 px-4 rounded-lg border transition-all ${
                        selectedModel === 'minimax/music-2.5'
                          ? 'bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800'
                          : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-5 rounded-full relative transition-colors ${
                          selectedModel === 'minimax/music-2.5' ? 'bg-purple-500' : 'bg-zinc-300 dark:bg-zinc-700'
                        }`}>
                          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${
                            selectedModel === 'minimax/music-2.5' ? 'left-5' : 'left-0.5'
                          }`} />
                        </div>
                        <div className="flex flex-col items-start">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-sm font-medium ${
                              selectedModel === 'minimax/music-2.5' ? 'text-purple-700 dark:text-purple-300' : 'text-zinc-700 dark:text-zinc-300'
                            }`}>
                              Pro Mode
                            </span>
                            {/* Info tooltip */}
                            <div className="group relative">
                              <svg className="w-4 h-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 p-3 bg-zinc-900 dark:bg-zinc-800 text-white text-xs rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                                <div className="space-y-2">
                                  <p className="font-medium text-purple-300">Pro Mode Features (50 credits):</p>
                                  <ul className="space-y-1.5 text-zinc-300">
                                    <li className="flex gap-2">
                                      <span className="text-purple-400">•</span>
                                      <span><strong className="text-white">Better vocals</strong> — more natural-sounding singing with realistic timbre, breathing, and pitch transitions</span>
                                    </li>
                                    <li className="flex gap-2">
                                      <span className="text-purple-400">•</span>
                                      <span><strong className="text-white">Better instrumentation</strong> — expanded sound library including orchestral and traditional instruments, with cleaner separation</span>
                                    </li>
                                    <li className="flex gap-2">
                                      <span className="text-purple-400">•</span>
                                      <span><strong className="text-white">Precise structure control</strong> — 14+ section tags let you control exactly how the song is arranged</span>
                                    </li>
                                    <li className="flex gap-2">
                                      <span className="text-purple-400">•</span>
                                      <span><strong className="text-white">Style-aware mixing</strong> — automatic mixing adjustments based on genre (rock distortion, jazz warmth, etc.)</span>
                                    </li>
                                    <li className="flex gap-2">
                                      <span className="text-purple-400">•</span>
                                      <span><strong className="text-white">Up to 3,500 characters</strong> for lyrics</span>
                                    </li>
                                  </ul>
                                </div>
                                <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-zinc-900 dark:border-t-zinc-800"></div>
                              </div>
                            </div>
                          </div>
                          {selectedModel === 'minimax/music-2.5' && (
                            <span className="text-xs text-zinc-500">50 credits</span>
                          )}
                        </div>
                      </div>
                      {selectedModel === 'minimax/music-2.5' && (
                        <span className="text-xs px-2 py-1 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-medium">
                          Active
                        </span>
                      )}
                    </button>
                    {selectedModel === 'minimax/music-2.5' && (
                      <p className="text-xs text-purple-600 dark:text-purple-400 px-1">
                        Up to 3,500 characters for lyrics • Better vocals & instruments
                      </p>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-4 pt-2">
                  {!creditsLoaded ? (
                    <button
                      disabled
                      className="w-full py-4 bg-zinc-300 dark:bg-zinc-700 text-white font-semibold text-lg rounded-xl shadow-none cursor-not-allowed"
                    >
                      <span className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                        Loading...
                      </span>
                    </button>
                  ) : (credits ?? 0) + lifetimeCredits < songCost ? (
                    <button
                      onClick={startCheckout}
                      disabled={startingCheckout}
                      className="w-full py-4 bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-lg rounded-xl shadow-lg hover:shadow-xl transition-all disabled:shadow-none"
                    >
                      {startingCheckout ? (
                        <span className="flex items-center justify-center gap-2">
                          <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                          Redirecting to checkout...
                        </span>
                      ) : (
                        'Get Credits to Generate'
                      )}
                    </button>
                  ) : (
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
                  )}

                  {creditsLoaded && (credits ?? 0) + lifetimeCredits >= songCost && (
                    <>
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
                    </>
                  )}
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
                  {currentModelConfig && (
                    <div className="flex justify-between mt-2">
                      <p className={`text-sm ${lyricsValid ? 'text-zinc-500 dark:text-zinc-500' : 'text-red-500'}`}>
                        {lyrics.length} / {currentModelConfig.constraints.lyrics.max} characters
                      </p>
                      {lyrics.length < currentModelConfig.constraints.lyrics.min && (
                        <p className="text-sm text-red-500">
                          Minimum {currentModelConfig.constraints.lyrics.min} characters required
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
                  {currentModelConfig && (
                    <div className="flex justify-between mt-2">
                      <p className={`text-sm ${promptValid ? 'text-zinc-500 dark:text-zinc-500' : 'text-red-500'}`}>
                        {prompt.length} / {currentModelConfig.constraints.prompt.max} characters
                      </p>
                      {prompt.length < currentModelConfig.constraints.prompt.min && (
                        <p className="text-sm text-red-500">
                          Minimum {currentModelConfig.constraints.prompt.min} characters required
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
                {!creditsLoaded ? (
                  <button
                    disabled
                    className="w-full max-w-md py-4 bg-zinc-300 dark:bg-zinc-700 text-white font-semibold text-lg rounded-xl shadow-none cursor-not-allowed"
                  >
                    <span className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                      Loading...
                    </span>
                  </button>
                ) : (credits ?? 0) + lifetimeCredits < songCost ? (
                  <button
                    onClick={startCheckout}
                    disabled={startingCheckout}
                    className="w-full max-w-md py-4 bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-lg rounded-xl shadow-lg hover:shadow-xl transition-all disabled:shadow-none"
                  >
                    {startingCheckout ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                        Redirecting to checkout...
                      </span>
                    ) : (
                      'Get Credits to Generate'
                    )}
                  </button>
                ) : (
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating || !canGenerate}
                    className="w-full max-w-md py-4 bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-lg rounded-xl shadow-lg hover:shadow-xl transition-all disabled:shadow-none"
                  >
                    {isGenerating ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                        {generationStatus === 'pending' ? 'Waiting for AI...' : 'Crafting Your Track...'}
                      </span>
                    ) : (
                      'Make It Sing ✨'
                    )}
                  </button>
                )}

                {creditsLoaded && (credits ?? 0) + lifetimeCredits >= songCost && (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Each song costs {songCost} credits
                  </p>
                )}

                <p className="text-xs text-zinc-400 dark:text-zinc-600">
                  {(credits ?? 0) + lifetimeCredits} credits remaining
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
                      <a
                        href={audioUrl}
                        download={`song-${generationId}.mp3`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-semibold rounded-xl transition-all text-center"
                      >
                        Download ↓
                      </a>
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
