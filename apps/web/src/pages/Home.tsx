import { useState, useEffect } from 'react'
import { SignIn, Show, UserButton, useAuth } from '@clerk/react'
import { Link } from 'react-router'
import { ThemeToggle } from '../components/ThemeToggle.tsx'

function Home() {
  const { userId, isLoaded } = useAuth()
  const [status, setStatus] = useState<any>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isLoaded && userId) fetchStatus()
  }, [isLoaded, userId])

  const fetchStatus = async () => {
    setStatusLoading(true)
    try {
      const res = await fetch('/api/subscription/status')
      const data = await res.json()
      setStatus(data)
    } catch (err) {
      console.error('Failed to fetch status:', err)
    } finally {
      setStatusLoading(false)
    }
  }

  const subscribe = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/subscription/checkout', { method: 'POST' })
      const { checkoutUrl, error } = await res.json()
      if (error) {
        setMessage(error)
      } else {
        window.location.href = checkoutUrl
      }
    } catch (err) {
      setMessage('Failed to create checkout')
    } finally {
      setLoading(false)
    }
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
          <Show when="signed-in">
            <Link 
              to="/studio" 
              className="text-zinc-600 dark:text-zinc-400 hover:text-orange-500 dark:hover:text-orange-400 transition-colors text-sm font-medium"
            >
              Studio
            </Link>
            <Link 
              to="/my-music" 
              className="text-zinc-600 dark:text-zinc-400 hover:text-orange-500 dark:hover:text-orange-400 transition-colors text-sm font-medium"
            >
              My Library
            </Link>
            {status?.subscribed && (
              <span className="text-sm font-medium text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30 px-3 py-1 rounded-full">
                {status.credits} credits
              </span>
            )}
            <UserButton />
          </Show>
          <Show when="signed-out">
            <Link
              to="/studio"
              className="text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-orange-500 dark:hover:text-orange-400 transition-colors"
            >
              Sign In
            </Link>
          </Show>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-16">
        {/* Hero Section */}
        <Show when="signed-out">
          <div className="text-center max-w-2xl mx-auto">
            <div className="mb-8">
              <span className="inline-block text-6xl mb-4">🎵</span>
              <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6">
                Create music with <span className="text-orange-500">AI</span>
              </h1>
              <p className="text-xl text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Turn your lyrics into full songs. Choose your style, add your words, and let AI do the rest.
              </p>
            </div>
            
            <div className="inline-block bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl p-8">
              <SignIn routing="hash" />
            </div>
          </div>
        </Show>

        {/* Dashboard */}
        <Show when="signed-in">
          <div className="max-w-xl mx-auto">
            <div className="text-center mb-12">
              <h1 className="text-4xl font-bold tracking-tight mb-3">
                Welcome back
              </h1>
              <p className="text-zinc-600 dark:text-zinc-400">
                Ready to create something new?
              </p>
            </div>

            {statusLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-orange-500 border-t-transparent mx-auto mb-4"></div>
                <p className="text-zinc-500 dark:text-zinc-400">Loading your account...</p>
              </div>
            ) : !status?.subscribed ? (
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 shadow-lg">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-100 dark:bg-orange-900/30 rounded-full mb-6">
                    <span className="text-3xl">💎</span>
                  </div>
                  <h2 className="text-2xl font-bold mb-2">Upgrade to Pro</h2>
                  <p className="text-zinc-600 dark:text-zinc-400 mb-6">
                    Get 100 credits per month to generate unlimited music
                  </p>
                  <div className="text-4xl font-bold text-orange-500 mb-6">
                    $10<span className="text-lg text-zinc-500 font-normal">/month</span>
                  </div>
                  <button 
                    onClick={subscribe}
                    disabled={loading}
                    className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all"
                  >
                    {loading ? 'Loading...' : 'Subscribe Now'}
                  </button>
                  {message && (
                    <p className="mt-4 text-red-500 text-sm">{message}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 shadow-lg text-center">
                  <div className="inline-flex items-center justify-center w-20 h-20 bg-orange-100 dark:bg-orange-900/30 rounded-full mb-6">
                    <span className="text-4xl">🎵</span>
                  </div>
                  <div className="text-6xl font-bold text-orange-500 mb-2">
                    {status.credits}
                  </div>
                  <p className="text-zinc-600 dark:text-zinc-400 mb-6">credits available</p>
                  
                  <Link
                    to="/studio"
                    className="inline-block w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl transition-all"
                  >
                    Open Studio
                  </Link>
                </div>

                {status.currentPeriodEnd && (
                  <p className="text-center text-sm text-zinc-500 dark:text-zinc-500">
                    Credits reset on {new Date(status.currentPeriodEnd).toLocaleDateString()}
                  </p>
                )}
              </div>
            )}
          </div>
        </Show>
      </main>
    </div>
  )
}

export default Home
