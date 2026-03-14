import { useState, useEffect } from 'react'
import { Show, useAuth, useUser } from '@clerk/react'
import { Link } from 'react-router'
import { useApi } from '../hooks/useApi'

interface SubscriptionStatus {
  subscribed: boolean
  credits: number
  lifetimeCredits: number
  currentPeriodEnd?: string
  cancelAtPeriodEnd?: boolean
}

const API_URL = import.meta.env.VITE_API_URL || ''

function Account() {
  const { userId, isLoaded } = useAuth()
  const { user } = useUser()
  const { fetchWithAuth } = useApi()
  const [status, setStatus] = useState<SubscriptionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [managingSubscription, setManagingSubscription] = useState(false)
  const [startingCheckout, setStartingCheckout] = useState(false)

  useEffect(() => {
    if (isLoaded && userId) {
      fetchStatus()
    }
  }, [isLoaded, userId])

  const fetchStatus = async () => {
    setLoading(true)
    try {
      const res = await fetchWithAuth(`${API_URL}/api/subscription/status`)
      const data = await res.json()
      setStatus(data)
    } catch (err) {
      setError('Failed to load account information')
    } finally {
      setLoading(false)
    }
  }

  const manageSubscription = async () => {
    setManagingSubscription(true)
    try {
      const res = await fetchWithAuth(`${API_URL}/api/subscription/portal`, {
        method: 'POST'
      })
      const { portalUrl, error } = await res.json()
      if (error) {
        setError(error)
      } else if (portalUrl) {
        window.location.href = portalUrl
      }
    } catch (err) {
      setError('Failed to open billing portal')
    } finally {
      setManagingSubscription(false)
    }
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

  const formatDate = (dateStr: string) => {
    return new Date(dateStr + 'Z').toLocaleDateString(undefined, {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors">
      <main className="max-w-4xl mx-auto px-6 py-12">
        <Show when="signed-out">
          <div className="text-center py-20">
            <h1 className="text-4xl font-bold mb-4">Account</h1>
            <p className="text-zinc-600 dark:text-zinc-400 mb-8">Please sign in to view your account</p>
            <Link
              to="/"
              className="inline-block py-3 px-6 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl transition-all"
            >
              Sign In
            </Link>
          </div>
        </Show>

        <Show when="signed-in">
          <div>
            <h1 className="text-3xl font-bold mb-8">Account</h1>

            {error && (
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl p-4 text-red-600 dark:text-red-400 mb-6">
                {error}
              </div>
            )}

            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-500 border-t-transparent mx-auto mb-4"></div>
                <p className="text-zinc-500 dark:text-zinc-400">Loading account...</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Profile Section */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
                  <h2 className="text-lg font-semibold mb-4">Profile</h2>
                  <div className="flex items-center gap-4">
                    {user?.imageUrl ? (
                      <img 
                        src={user.imageUrl} 
                        alt="Profile" 
                        className="w-16 h-16 rounded-full"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-zinc-200 dark:bg-zinc-800 rounded-full flex items-center justify-center">
                        <span className="text-2xl">👤</span>
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-lg">{user?.fullName || user?.username || 'User'}</p>
                      <p className="text-zinc-500 dark:text-zinc-500 text-sm">{user?.primaryEmailAddress?.emailAddress}</p>
                    </div>
                  </div>
                </div>

                {/* Credits Section */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
                  <h2 className="text-lg font-semibold mb-4">Credits</h2>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-green-500">{status?.credits || 0}</span>
                    <span className="text-zinc-500 dark:text-zinc-500">subscription credits</span>
                  </div>
                  {(status?.lifetimeCredits || 0) > 0 && (
                    <div className="flex items-baseline gap-2 mt-2">
                      <span className="text-2xl font-bold text-blue-500">+{status!.lifetimeCredits}</span>
                      <span className="text-zinc-500 dark:text-zinc-500">lifetime credits (never expire)</span>
                    </div>
                  )}
                  {status?.currentPeriodEnd && (
                    <p className="text-sm text-zinc-500 dark:text-zinc-500 mt-2">
                      Subscription credits reset on {formatDate(status.currentPeriodEnd)}. 
                      Unused credits roll over (max 1200 total).
                    </p>
                  )}
                </div>

                {/* Subscription Section */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
                  <h2 className="text-lg font-semibold mb-4">Subscription</h2>
                  
                  {status?.subscribed ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${status.cancelAtPeriodEnd ? 'bg-yellow-500' : 'bg-green-500'}`}></span>
                        <span className="font-medium">
                          Basic Plan - {status.cancelAtPeriodEnd ? 'Cancels Soon' : 'Active'}
                        </span>
                      </div>
                      <p className="text-zinc-600 dark:text-zinc-400">
                        {status.cancelAtPeriodEnd ? (
                          <>Your subscription will cancel on {formatDate(status.currentPeriodEnd!)}. You can still use your credits until then.</>
                        ) : (
                          <>You have unlimited access to generate music.</>
                        )}
                      </p>
                      <button
                        onClick={manageSubscription}
                        disabled={managingSubscription}
                        className="py-2.5 px-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all disabled:opacity-50"
                      >
                        {managingSubscription ? 'Opening...' : 'Manage Subscription'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-zinc-400 rounded-full"></span>
                        <span className="font-medium">Free Plan</span>
                      </div>
                      <p className="text-zinc-600 dark:text-zinc-400">
                        Upgrade to Basic for $5/month and get 600 credits (up to 60 songs).
                      </p>
                      <button
                        onClick={startCheckout}
                        disabled={startingCheckout}
                        className="py-2.5 px-4 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg transition-all disabled:opacity-50"
                      >
                        {startingCheckout ? 'Redirecting...' : 'Upgrade to Basic'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </Show>
      </main>
    </div>
  )
}

export default Account
