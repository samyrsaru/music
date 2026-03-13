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

  const features = [
    {
      icon: '🎵',
      title: 'Idea to Song',
      description: 'Start with just an idea or concept. Our AI generates lyrics, selects style, and creates complete songs.'
    },
    {
      icon: '🎨',
      title: 'Multiple Styles',
      description: 'Choose from various music genres including pop, rock, electronic, classical, jazz, and more.'
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

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors">
      {/* Navigation */}
      <nav className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 flex justify-between items-center sticky top-0 bg-zinc-50/80 dark:bg-zinc-950/80 backdrop-blur-sm z-50">
        <Link to="/" className="text-xl font-semibold tracking-tight">
          <span className="text-green-500">Make</span>Music
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
                No credit card required • Free to try • Cancel anytime
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

        {/* CTA Section */}
        <section className="px-6 py-20">
          <div className="max-w-4xl mx-auto text-center">
            <div className="p-8 md:p-12 rounded-3xl bg-gradient-to-br from-green-500 to-emerald-600 text-white">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Ready to Create Your First Song?
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
          <div className="flex items-center gap-2">
            <span className="text-xl font-semibold tracking-tight">
              <span className="text-green-500">Make</span>Music
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm text-zinc-500 dark:text-zinc-500">
            <Link to="/privacy" className="hover:text-green-500 dark:hover:text-green-400 transition-colors">
              Privacy Policy
            </Link>
            <span>© 2025 MakeMusic. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Home