import type { ReactNode } from 'react'
import { useState } from 'react'
import { UserButton, useAuth } from '@clerk/react'
import { Link, Outlet } from 'react-router'
import { ThemeToggle } from '../components/ThemeToggle.tsx'

export function Header() {
  const { isSignedIn } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <nav className="border-b border-zinc-200 dark:border-zinc-800 px-4 sm:px-6 py-4">
      <div className="flex justify-between items-center">
        <Link to={isSignedIn ? "/studio" : "/"} className="text-xl font-semibold tracking-tight">
          <span className="text-green-500 font-bold">sound</span><span className="text-zinc-900 dark:text-zinc-100">.likeahe.ro</span>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden sm:flex items-center gap-4">
          <ThemeToggle />
          {isSignedIn && (
            <>
              <Link
                to="/studio"
                className="text-zinc-600 dark:text-zinc-400 hover:text-green-500 dark:hover:text-green-400 transition-colors text-sm font-semibold py-2"
              >
                Studio
              </Link>
              <Link
                to="/library"
                className="text-zinc-600 dark:text-zinc-400 hover:text-green-500 dark:hover:text-green-400 transition-colors text-sm font-semibold py-2"
              >
                Library
              </Link>
              <Link
                to="/account"
                className="text-zinc-600 dark:text-zinc-400 hover:text-green-500 dark:hover:text-green-400 transition-colors text-sm font-semibold py-2"
              >
                Account
              </Link>
            </>
          )}
          <UserButton />
        </div>

        {/* Mobile Navigation */}
        <div className="flex sm:hidden items-center gap-2">
          <ThemeToggle />
          {isSignedIn && (
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-green-500 dark:hover:text-green-400 transition-colors"
              aria-label="Toggle menu"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          )}
          <UserButton />
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {isSignedIn && mobileMenuOpen && (
        <div className="sm:hidden mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
          <Link
            to="/studio"
            onClick={() => setMobileMenuOpen(false)}
            className="block text-zinc-600 dark:text-zinc-400 hover:text-green-500 dark:hover:text-green-400 transition-colors text-sm font-semibold py-3"
          >
            Studio
          </Link>
          <Link
            to="/library"
            onClick={() => setMobileMenuOpen(false)}
            className="block text-zinc-600 dark:text-zinc-400 hover:text-green-500 dark:hover:text-green-400 transition-colors text-sm font-semibold py-3"
          >
            Library
          </Link>
          <Link
            to="/account"
            onClick={() => setMobileMenuOpen(false)}
            className="block text-zinc-600 dark:text-zinc-400 hover:text-green-500 dark:hover:text-green-400 transition-colors text-sm font-semibold py-3"
          >
            Account
          </Link>
        </div>
      )}
    </nav>
  )
}

export function Layout({ children }: { children?: ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors">
      <Header />
      {children ?? <Outlet />}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 px-6 py-4 text-center text-sm text-zinc-500 dark:text-zinc-500 space-y-2">
        <div>
          <Link to="/privacy" className="hover:text-green-500 dark:hover:text-green-400 transition-colors">
            Privacy Policy
          </Link>
        </div>
        <div className="text-xs opacity-75">
          Music generated using AI technology
        </div>
      </footer>
    </div>
  )
}
