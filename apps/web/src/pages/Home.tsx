import { useEffect, useState, useRef } from 'react'
import { SignIn, SignInButton, useAuth } from '@clerk/react'
import { Link, useNavigate } from 'react-router'
import { ThemeToggle } from '../components/ThemeToggle.tsx'

interface DemoSong {
  id: string
  title: string
  description: string
  style: string
  audioUrl: string
  cover: string
}

function Home() {
  const { userId, isLoaded } = useAuth()
  const navigate = useNavigate()
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState<Record<string, number>>({})
  const [duration, setDuration] = useState<Record<string, number>>({})
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const activeSongRef = useRef<string | null>(null)

  useEffect(() => {
    if (isLoaded && userId) {
      navigate('/studio')
    }
  }, [isLoaded, userId, navigate])

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-500 border-t-transparent"></div>
      </div>
    )
  }

  const features = [
    {
      icon: '🎵',
      title: 'Idea to Song',
      description: 'Start with just an idea or concept. Our AI generates lyrics, selects style, and creates complete songs.'
    },
    {
      icon: '🎨',
      title: 'Multiple Styles',
      description: 'Try the same lyrics with different styles — pop, rock, electronic, jazz, and more. Endless variations from one idea.'
    },
    {
      icon: '⚡',
      title: 'Instant Creation',
      description: 'Generate unique songs in seconds. No musical experience or expensive equipment required.'
    },
    {
      icon: '💾',
      title: 'Your Music Library',
      description: 'Save, organize, and revisit all your AI-generated creations in your personal library.'
    },
    {
      icon: '🎤',
      title: 'Custom Lyrics',
      description: 'Write your own lyrics or let the AI help. Full creative control over your songs.'
    },
    {
      icon: '🔄',
      title: 'Unlimited Remixes',
      description: 'Not satisfied? Generate variations until you find the perfect sound.'
    },
    {
      icon: '🎬',
      title: 'Perfect for Content Creators',
      description: 'Create original background music for your YouTube vlogs, podcasts, TikToks, and videos.'
    }
  ]

  const steps = [
    {
      number: '1',
      title: 'Share Your Idea',
      description: 'Start with a concept, mood, or story you want to express through music.'
    },
    {
      number: '2',
      title: 'Generate Lyrics & Style',
      description: 'We craft the perfect lyrics and select the ideal musical style for your idea.'
    },
    {
      number: '3',
      title: 'Create Your Song',
      description: 'Generate a complete, unique song ready to listen and share.'
    }
  ]

  const demoSongs: DemoSong[] = [
    {
      id: 'demo-1',
      title: 'Demo Track 1',
      description: 'Dark ambient, moody, eerie piano, haunting atmospheric pads',
      style: 'Dark Ambient',
      audioUrl: 'https://r2-public.likeahe.ro/music/demo/1.mp3',
      cover: '🌑'
    },
    {
      id: 'demo-2',
      title: 'Demo Track 2',
      description: 'Scary movie style, creepy',
      style: 'Horror / Thriller',
      audioUrl: 'https://r2-public.likeahe.ro/music/demo/2.mp3',
      cover: '👻'
    }
  ]

  const formatTime = (time: number) => {
    if (!time || isNaN(time)) return '0:00'
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const handlePlay = (song: DemoSong) => {
    if (playingId === song.id) {
      // Pause current
      audioRef.current?.pause()
      setPlayingId(null)
    } else if (activeSongRef.current === song.id && audioRef.current) {
      // Resume the same song
      audioRef.current.play()
      setPlayingId(song.id)
    } else {
      // Stop previous and start new
      if (audioRef.current) {
        audioRef.current.pause()
      }
      
      const newAudio = new Audio(song.audioUrl)
      
      // Track time updates
      newAudio.addEventListener('timeupdate', () => {
        setCurrentTime(prev => ({ ...prev, [song.id]: newAudio.currentTime }))
      })
      
      // Track duration once loaded
      newAudio.addEventListener('loadedmetadata', () => {
        setDuration(prev => ({ ...prev, [song.id]: newAudio.duration }))
      })
      
      newAudio.onended = () => {
        setPlayingId(null)
        setCurrentTime(prev => ({ ...prev, [song.id]: 0 }))
      }
      
      newAudio.play()
      audioRef.current = newAudio
      activeSongRef.current = song.id
      setPlayingId(song.id)
      
      // Set initial duration if already loaded
      if (newAudio.duration) {
        setDuration(prev => ({ ...prev, [song.id]: newAudio.duration }))
      }
    }
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>, song: DemoSong) => {
    if (!audioRef.current || !duration[song.id]) return
    
    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const percentage = clickX / rect.width
    const newTime = percentage * duration[song.id]
    
    audioRef.current.currentTime = newTime
    setCurrentTime(prev => ({ ...prev, [song.id]: newTime }))
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors">
      {/* Navigation */}
      <nav className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 flex justify-between items-center sticky top-0 bg-zinc-50/80 dark:bg-zinc-950/80 backdrop-blur-sm z-50">
        <Link to="/" className="text-xl font-semibold tracking-tight">
          <span className="text-green-500 font-bold">sound</span><span className="text-zinc-900 dark:text-zinc-100">.likeahe.ro</span>
        </Link>
        <div className="flex items-center gap-4">
          <ThemeToggle />
        </div>
      </nav>

      <main>
        {/* Hero Section */}
        <section className="relative px-6 py-20 md:py-32 overflow-hidden">
          {/* Background decoration */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-1/2 -right-1/4 w-96 h-96 bg-green-500/10 rounded-full blur-3xl"></div>
            <div className="absolute -bottom-1/2 -left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
          </div>

          <div className="relative max-w-5xl mx-auto">
            <div className="text-center max-w-3xl mx-auto">
              <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
                Create{' '}
                <span className="bg-gradient-to-r from-green-500 to-emerald-400 bg-clip-text text-transparent">
                  Music
                </span>{' '}
                in Seconds
              </h1>

              <p className="text-xl md:text-2xl text-zinc-600 dark:text-zinc-400 leading-relaxed mb-10 max-w-2xl mx-auto">
                Start with an idea and we'll transform it into complete songs with lyrics and style. Just describe your vision and we'll handle the rest.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <div className="inline-block">
                  <SignIn routing="hash" />
                </div>
              </div>

              <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-500">
                Your first song is on us — no credit card required
              </p>
            </div>

            {/* Visual Wave Animation */}
            <div className="mt-16 flex justify-center gap-1 h-16 items-end">
              {[...Array(20)].map((_, i) => (
                <div
                  key={i}
                  className="w-2 bg-green-500/30 rounded-full animate-pulse"
                  style={{
                    height: `${Math.random() * 60 + 20}%`,
                    animationDelay: `${i * 0.1}s`,
                    animationDuration: `${0.8 + Math.random() * 0.4}s`
                  }}
                ></div>
              ))}
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="px-6 py-20 bg-zinc-100/50 dark:bg-zinc-900/50">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Everything You Need to Create Music
              </h2>
              <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
                Professional-grade AI music generation made simple. No musical background required.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className="group p-6 rounded-2xl bg-white dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 hover:border-green-500/50 dark:hover:border-green-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-green-500/5"
                >
                  <div className="text-4xl mb-4 group-hover:scale-110 transition-transform duration-300">
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                  <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="px-6 py-20">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                How It Works
              </h2>
              <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
                Creating your first AI-generated song is easier than you think.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {steps.map((step, index) => (
                <div key={index} className="relative text-center">
                  <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-green-500 text-white flex items-center justify-center text-2xl font-bold">
                    {step.number}
                  </div>
                  <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
                  <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    {step.description}
                  </p>
                  {index < steps.length - 1 && (
                    <div className="hidden md:block absolute top-8 left-[60%] w-[80%] h-0.5 bg-gradient-to-r from-green-500/50 to-transparent"></div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Demo Songs Section */}
        <section className="px-6 py-20 bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Hear What AI Can Create
              </h2>
              <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
                Listen to sample songs generated by our AI. Each one is unique and created from simple text prompts.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
              {demoSongs.map((song) => (
                <div
                  key={song.id}
                  className="group p-6 rounded-2xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:border-green-500/50 dark:hover:border-green-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-green-500/5"
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center text-3xl shadow-lg shadow-green-500/20">
                      {song.cover}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-lg truncate">{song.title}</h3>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 truncate">{song.style}</p>
                    </div>
                  </div>
                  
                  <p className="text-zinc-600 dark:text-zinc-400 text-sm mb-4">
                    {song.description}
                  </p>

                  <button
                    onClick={() => handlePlay(song)}
                    className="w-full py-3 px-4 bg-zinc-100 dark:bg-zinc-700 hover:bg-green-500 hover:text-white dark:hover:bg-green-500 rounded-xl font-medium transition-all flex items-center justify-center gap-2 group-hover:shadow-md"
                  >
                    {playingId === song.id ? (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                        </svg>
                        <span>Pause</span>
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                        <span>Preview Song</span>
                      </>
                    )}
                  </button>

                  {/* Progress Bar */}
                  {(duration[song.id] || playingId === song.id) && (
                    <div className="mt-4 space-y-2">
                      <div 
                        className="h-1 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden cursor-pointer group/progress"
                        onClick={(e) => handleSeek(e, song)}
                      >
                        <div 
                          className="h-full bg-green-500 transition-all duration-100 relative"
                          style={{ 
                            width: duration[song.id] 
                              ? `${(currentTime[song.id] || 0) / duration[song.id] * 100}%` 
                              : '0%' 
                          }}
                        >
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-green-500 rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity shadow-sm"></div>
                        </div>
                      </div>
                      <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
                        <span>{formatTime(currentTime[song.id] || 0)}</span>
                        <span>{formatTime(duration[song.id] || 0)}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section className="px-6 py-20 bg-zinc-100/50 dark:bg-zinc-900/50">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Simple, Transparent Pricing
              </h2>
              <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
                Start free, upgrade when you're ready. No hidden fees, cancel anytime.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
              {/* Free Plan */}
              <div className="p-8 rounded-2xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:border-green-500/50 dark:hover:border-green-500/50 transition-all">
                <div className="mb-6">
                  <h3 className="text-xl font-semibold mb-2">Free</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold">$0</span>
                    <span className="text-zinc-500">forever</span>
                  </div>
                </div>
                <ul className="space-y-3 mb-8">
                  <li className="flex items-center gap-3 text-zinc-600 dark:text-zinc-400">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    50 credits on signup
                  </li>
                  <li className="flex items-center gap-3 text-zinc-600 dark:text-zinc-400">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Access to all features
                  </li>
                  <li className="flex items-center gap-3 text-zinc-600 dark:text-zinc-400">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    No credit card required
                  </li>
                </ul>
              </div>

              {/* Treble Plan */}
              <div className="p-8 rounded-2xl bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-2 border-green-500 dark:border-green-600 relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-green-500 text-white text-xs font-bold px-4 py-1 rounded-bl-lg">
                  POPULAR
                </div>
                <div className="mb-6">
                  <h3 className="text-xl font-semibold mb-2">Treble</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold">$5</span>
                    <span className="text-zinc-500">/month + VAT</span>
                  </div>
                </div>
                <ul className="space-y-3">
                  <li className="flex items-center gap-3 text-zinc-600 dark:text-zinc-400">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    600 credits/month
                  </li>
                  <li className="flex items-center gap-3 text-zinc-600 dark:text-zinc-400">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Rollover up to 600 credits
                  </li>
                  <li className="flex items-center gap-3 text-zinc-600 dark:text-zinc-400">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Cancel anytime
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-10 text-center">
              <SignInButton mode="modal">
                <button className="py-3 px-8 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-green-500/25 hover:shadow-green-500/40 text-lg">
                  Get Started Free
                </button>
              </SignInButton>
            </div>

            <p className="text-center text-sm text-zinc-500 dark:text-zinc-500 mt-6">
              10 credits = 1 song generation. Secure checkout powered by Polar.
            </p>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="px-6 py-20">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Frequently Asked Questions
              </h2>
            </div>

            <div className="space-y-6">
              <div className="p-6 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                <h3 className="font-semibold text-lg mb-2">How does the credit system work?</h3>
                <p className="text-zinc-600 dark:text-zinc-400">
                  Each song generation costs 10 credits. You receive 50 credits when you sign up for free. With Treble ($5/month + VAT), you get 600 credits each month.
                </p>
              </div>

              <div className="p-6 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                <h3 className="font-semibold text-lg mb-2">Do credits expire?</h3>
                <p className="text-zinc-600 dark:text-zinc-400">
                  Free signup credits never expire. Treble subscription credits last for the billing month, but unused credits rollover up to 600. If you cancel, any remaining credits last until your subscription period ends.
                </p>
              </div>

              <div className="p-6 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                <h3 className="font-semibold text-lg mb-2">What happens if I cancel my subscription?</h3>
                <p className="text-zinc-600 dark:text-zinc-400">
                  You keep all remaining credits until the end of your current billing period. Your subscription won't renew, and you'll revert to the free plan afterward.
                </p>
              </div>

              <div className="p-6 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                <h3 className="font-semibold text-lg mb-2">Can I use the generated music commercially?</h3>
                <p className="text-zinc-600 dark:text-zinc-400">
                  Our AI music generation is powered by third-party providers. Commercial usage rights depend on their current terms, which may change. Please review the current terms of our AI provider before using music commercially. We recommend checking the Terms of Service for the latest information.
                </p>
              </div>

              <div className="p-6 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                <h3 className="font-semibold text-lg mb-2">Who owns the songs I generate?</h3>
                <p className="text-zinc-600 dark:text-zinc-400">
                  You retain ownership of your input prompts and ideas. However, the AI-generated output is subject to the terms of our third-party AI providers. Ownership rights may vary based on their policies, which are subject to change. See our Terms of Service for details.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="px-6 py-20">
          <div className="max-w-4xl mx-auto text-center">
            <div className="p-8 md:p-12 rounded-3xl bg-gradient-to-br from-green-500 to-emerald-600 text-white">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Generate Your First Songs for Free
              </h2>
              <p className="text-lg text-white/90 mb-8 max-w-2xl mx-auto">
                Join thousands of creators who are already making music with AI. Start for free today.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <div className="inline-block">
                  <SignIn routing="hash" />
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 px-6 py-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex flex-col md:flex-row items-center gap-4 text-xs text-zinc-400 dark:text-zinc-600">
            <Link to="/privacy" className="hover:text-green-500 dark:hover:text-green-400 transition-colors">
              Privacy Policy
            </Link>
            <span className="hidden md:inline">·</span>
            <Link to="/terms" className="hover:text-green-500 dark:hover:text-green-400 transition-colors">
              Terms of Service
            </Link>
            <span className="hidden md:inline">·</span>
            <div>Music generated using AI technology</div>
            <span className="hidden md:inline">·</span>
            <div>A <a href="https://lerimas.com" target="_blank" rel="noopener noreferrer" className="hover:text-green-500 transition-colors">lerimas.com</a> app</div>
          </div>
          <div className="text-sm text-zinc-500 dark:text-zinc-500">
            © 2026 <span className="text-green-500 font-bold">sound</span><span className="text-zinc-900 dark:text-zinc-100">.likeahe.ro</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Home