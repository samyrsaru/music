import { useEffect } from 'react'
import { SignIn, useAuth } from '@clerk/react'
import { Link, useNavigate } from 'react-router'
import { ThemeToggle } from '../components/ThemeToggle.tsx'

function Home() {
  const { userId, isLoaded } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (isLoaded && userId) {
      navigate('/studio')
    }
  }, [isLoaded, userId, navigate])

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors">
      {/* Navigation */}
      <nav className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 flex justify-between items-center">
        <Link to="/" className="text-xl font-semibold tracking-tight">
          <span className="text-green-500">Make</span>Music
        </Link>
        <div className="flex items-center gap-4">
          <ThemeToggle />
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-16">
        {/* Hero Section */}
        <div className="text-center max-w-2xl mx-auto">
          <div className="mb-8">
            <span className="inline-block text-6xl mb-4">🎵</span>
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6">
              Create music with <span className="text-green-500">AI</span>
            </h1>
            <p className="text-xl text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Turn your lyrics into full songs. Choose your style, add your words, and let AI do the rest.
            </p>
          </div>

          <div className="inline-block">
            <SignIn routing="hash" />
          </div>
        </div>
      </main>
    </div>
  )
}

export default Home
