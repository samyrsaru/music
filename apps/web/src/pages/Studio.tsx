import { useState, useEffect } from 'react'
import { UserButton, Show, useAuth } from '@clerk/react'
import { Link } from 'react-router'
import { ThemeToggle } from '../components/ThemeToggle.tsx'

const EXAMPLE_LYRICS = `[Verse]
In the hush of night, we find our space,
Wrapped in moonlight's gentle embrace.
Your whisper's soft, like a velvet song,
In this tender moment, where we both belong.

[Chorus]
Just you and me, in this lazy jazz,
Our souls entwined, nothing else we ask.
In this serenade, we sway and sigh,
Lost in this love, beneath the starry sky.

[Bridge]
Your voice, a lullaby, soothes my soul,
In this night, together, we feel whole.
Each moment shared, a timeless flight,
In this gentle jazz, we find our light.

[Outro]
As dawn approaches, and stars fade away,
In your arms, I wish to forever stay.`

const EXAMPLE_PROMPT = "Jazz, Smooth Jazz, Romantic, Dreamy"

interface ModelConstraints {
  lyrics: { min: number; max: number }
  prompt: { min: number; max: number }
}

// Generation modes - ready for instrumental support later
const GENERATION_MODES = {
  LYRICS: 'lyrics',
  INSTRUMENTAL: 'instrumental'
} as const

function Studio() {
  const { userId, isLoaded } = useAuth()
  const [mode, setMode] = useState<typeof GENERATION_MODES[keyof typeof GENERATION_MODES]>(GENERATION_MODES.LYRICS)
  const [lyrics, setLyrics] = useState(EXAMPLE_LYRICS)
  const [prompt, setPrompt] = useState(EXAMPLE_PROMPT)
  const [isGenerating, setIsGenerating] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [credits, setCredits] = useState(0)
  const [constraints, setConstraints] = useState<ModelConstraints | null>(null)
  
  // Lyrics helper state
  const [showLyricsHelper, setShowLyricsHelper] = useState(false)
  const [lyricsTopic, setLyricsTopic] = useState('')
  const [lyricsMood, setLyricsMood] = useState('')
  const [isGeneratingLyrics, setIsGeneratingLyrics] = useState(false)

  useEffect(() => {
    // Only fetch when auth is loaded to avoid race conditions
    if (isLoaded && userId) {
      fetchStatus()
      fetchConstraints()
    }
  }, [isLoaded, userId])

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/subscription/status')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setCredits(data.credits)
    } catch (err) {
      console.error('Failed to fetch status:', err)
    }
  }

  const fetchConstraints = async () => {
    try {
      const res = await fetch('/api/generations/config')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setConstraints(data.constraints)
    } catch (err) {
      console.error('Failed to fetch constraints:', err)
    }
  }

  const loadExample = () => {
    setLyrics(EXAMPLE_LYRICS)
    setPrompt(EXAMPLE_PROMPT)
  }

  const generateLyrics = async () => {
    if (!lyricsTopic.trim()) return
    
    setIsGeneratingLyrics(true)
    try {
      const res = await fetch('/api/generations/lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          topic: lyricsTopic,
          mood: lyricsMood || undefined 
        })
      })
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      
      if (data.lyrics) {
        setLyrics(data.lyrics)
        setShowLyricsHelper(false)
        setLyricsTopic('')
        setLyricsMood('')
      } else if (data.error) {
        setError(data.error)
      }
    } catch (err) {
      setError('Failed to generate lyrics')
    } finally {
      setIsGeneratingLyrics(false)
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

  const handleGenerate = async () => {
    if (mode === GENERATION_MODES.LYRICS && !lyrics.trim()) return
    
    setIsGenerating(true)
    setError('')
    setAudioUrl(null)
    
    try {
      const res = await fetch('/api/generations/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          lyrics: mode === GENERATION_MODES.LYRICS ? lyrics : undefined,
          prompt 
        })
      })
      
      if (!res.ok) {
        if (res.status === 401) {
          setError('Session expired. Please sign in again.')
          return
        }
        throw new Error(`HTTP ${res.status}`)
      }
      
      const data = await res.json()
      
      if (data.error) {
        setError(data.error)
      } else {
        setAudioUrl(data.audioUrl)
        setCredits(data.creditsRemaining)
      }
    } catch (err: any) {
      setError('Failed to start generation')
    } finally {
      setIsGenerating(false)
    }
  }

  const lyricsValid = !constraints || (lyrics.length >= constraints.lyrics.min && lyrics.length <= constraints.lyrics.max)
  const promptValid = !constraints || (prompt.length >= constraints.prompt.min && prompt.length <= constraints.prompt.max)

  // For now, only lyrics mode is functional
  const canGenerate = mode === GENERATION_MODES.LYRICS 
    ? (lyrics.trim() && lyricsValid && promptValid)
    : promptValid

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
            to="/my-music" 
            className="text-zinc-600 dark:text-zinc-400 hover:text-orange-500 dark:hover:text-orange-400 transition-colors text-sm font-medium"
          >
            My Library
          </Link>
          <span className="text-sm font-medium text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30 px-3 py-1 rounded-full">
            {credits} credits
          </span>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <Show when="signed-out">
          <div className="text-center py-20">
            <h1 className="text-4xl font-bold mb-4">Studio</h1>
            <p className="text-zinc-600 dark:text-zinc-400 mb-8">Please sign in to use the music generator</p>
            <Link
              to="/"
              className="inline-block py-3 px-6 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl transition-all"
            >
              Sign In
            </Link>
          </div>
        </Show>

        <Show when="signed-in">
          <div className="space-y-8">
            <div>
              <h1 className="text-3xl font-bold mb-2">Studio</h1>
              <p className="text-zinc-600 dark:text-zinc-400">Create AI-generated music with your own lyrics</p>
            </div>

            {/* Mode Selection - Ready for instrumental mode */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-2 shadow-sm">
              <div className="flex gap-2">
                <button
                  onClick={() => setMode(GENERATION_MODES.LYRICS)}
                  className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all ${
                    mode === GENERATION_MODES.LYRICS
                      ? 'bg-orange-500 text-white'
                      : 'bg-transparent text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  With Lyrics
                </button>
                <button
                  disabled
                  className="flex-1 py-3 px-4 rounded-xl font-medium bg-transparent text-zinc-400 cursor-not-allowed"
                  title="Instrumental mode coming soon"
                >
                  Instrumental (Soon)
                </button>
              </div>
            </div>

            {/* Lyrics Section */}
            {mode === GENERATION_MODES.LYRICS && (
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <label htmlFor="lyrics" className="block font-semibold text-lg">
                    Your Lyrics
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowLyricsHelper(!showLyricsHelper)}
                      disabled={isGenerating}
                      className="text-sm bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-900/50 px-3 py-1.5 rounded-lg disabled:opacity-50 font-medium transition-all"
                    >
                      {showLyricsHelper ? 'Hide Helper' : 'Help Me Write'}
                    </button>
                    <button
                      onClick={loadExample}
                      disabled={isGenerating}
                      className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-orange-500 disabled:opacity-50 font-medium"
                    >
                      Reset to Example
                    </button>
                  </div>
                </div>

                {/* Lyrics Helper */}
                {showLyricsHelper && (
                  <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 mb-4">
                    <h4 className="font-semibold mb-3">Generate Lyrics Ideas</h4>
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={lyricsTopic}
                        onChange={(e) => setLyricsTopic(e.target.value)}
                        placeholder="What is your song about? (e.g., summer love, heartbreak, adventure)"
                        className="w-full px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                      <input
                        type="text"
                        value={lyricsMood}
                        onChange={(e) => setLyricsMood(e.target.value)}
                        placeholder="What mood? (optional) (e.g., happy, melancholic, energetic)"
                        className="w-full px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                      <button
                        onClick={generateLyrics}
                        disabled={!lyricsTopic.trim() || isGeneratingLyrics}
                        className="w-full py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all"
                      >
                        {isGeneratingLyrics ? (
                          <span className="flex items-center justify-center gap-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                            Creating Ideas...
                          </span>
                        ) : (
                          'Generate Ideas'
                        )}
                      </button>
                    </div>
                  </div>
                )}

                <textarea
                  id="lyrics"
                  value={lyrics}
                  onChange={(e) => setLyrics(e.target.value)}
                  placeholder="Enter your lyrics here or use the helper above..."
                  disabled={isGenerating}
                  className="w-full h-56 px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none disabled:opacity-50 transition-all"
                />
                {constraints && (
                  <div className="flex justify-between mt-2">
                    <p className={`text-sm ${lyricsValid ? 'text-zinc-500 dark:text-zinc-500' : 'text-red-500'}`}>
                      {lyrics.length} / {constraints.lyrics.max} characters
                    </p>
                    {lyrics.length < constraints.lyrics.min && (
                      <p className="text-sm text-red-500">
                        Minimum {constraints.lyrics.min} characters required
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Prompt Input */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
              <label htmlFor="prompt" className="block font-semibold text-lg mb-4">
                Style
              </label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the style, mood, instruments..."
                disabled={isGenerating}
                className="w-full h-24 px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none disabled:opacity-50 transition-all"
              />
              {constraints && (
                <div className="flex justify-between mt-2">
                  <p className={`text-sm ${promptValid ? 'text-zinc-500 dark:text-zinc-500' : 'text-red-500'}`}>
                    {prompt.length} / {constraints.prompt.max} characters
                  </p>
                  {prompt.length < constraints.prompt.min && (
                    <p className="text-sm text-red-500">
                      Minimum {constraints.prompt.min} characters required
                    </p>
                  )}
                </div>
              )}
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">
                Examples: Jazz, Pop, Electronic, Rock, Classical, Lo-fi, Upbeat, Melancholic
              </p>
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
                disabled={isGenerating || credits < 1 || !canGenerate}
                className="w-full max-w-md py-4 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-lg rounded-xl shadow-lg hover:shadow-xl transition-all disabled:shadow-none"
              >
                {isGenerating ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                    Generating...
                  </span>
                ) : credits < 1 ? (
                  'No Credits - Subscribe to Generate'
                ) : (
                  'Generate Music (1 credit)'
                )}
              </button>
              <p className="text-sm text-zinc-500 dark:text-zinc-500">
                {credits} credits remaining
              </p>
            </div>

            {/* Result */}
            {audioUrl && (
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
                    controls 
                    src={audioUrl}
                    className="w-full h-14 rounded-xl"
                  />
                  <button 
                    onClick={() => downloadAudio(audioUrl, 'makemusic-generation.mp3')}
                    className="w-full py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold rounded-xl hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-all"
                  >
                    Download
                  </button>
                </div>
              </div>
            )}
          </div>
        </Show>
      </main>
    </div>
  )
}

export default Studio
