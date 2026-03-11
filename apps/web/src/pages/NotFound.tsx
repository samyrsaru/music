import { Show, SignInButton, UserButton } from '@clerk/react'
import { Link } from 'react-router'
import { ThemeToggle } from '../components/ThemeToggle.tsx'

function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors">
      {/* Navigation */}
      <nav className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 flex justify-between items-center">
        <Show when="signed-in">
          <Link to="/studio" className="text-xl font-semibold tracking-tight">
            <span className="text-green-500">Make</span>Music
          </Link>
        </Show>
        <Show when="signed-out">
          <Link to="/" className="text-xl font-semibold tracking-tight">
            <span className="text-green-500">Make</span>Music
          </Link>
        </Show>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <Show when="signed-in">
            <UserButton />
          </Show>
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-green-500 dark:hover:text-green-400 transition-colors">
                Sign In
              </button>
            </SignInButton>
          </Show>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-20">
        <div className="text-center">
          <div className="text-8xl font-bold text-green-500 mb-4">404</div>
          <h1 className="text-3xl font-bold mb-4">Page Not Found</h1>
          <p className="text-zinc-600 dark:text-zinc-400 mb-8 max-w-md mx-auto">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/studio"
              className="inline-block py-3 px-6 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl transition-all"
            >
              Go to Studio
            </Link>
            <Link
              to="/library"
              className="inline-block py-3 px-6 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
            >
              View Library
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}

export default NotFound
