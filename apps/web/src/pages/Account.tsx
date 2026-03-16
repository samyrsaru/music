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

                </div>

                {/* Subscription Section */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
                  <h2 className="text-lg font-semibold mb-6">Subscription</h2>
                  
                  {status?.subscribed ? (
                    <div className="space-y-6">
                      {/* Treble Plan Benefits */}
                      <div className="p-4 border-2 border-green-500 dark:border-green-600 rounded-xl bg-green-50/50 dark:bg-green-950/10 relative overflow-hidden">
                        <div className="absolute top-0 right-0 bg-green-500 text-white text-xs font-semibold px-3 py-1 rounded-bl-lg">
                          {status.cancelAtPeriodEnd ? 'CANCELS SOON' : 'CURRENT'}
                        </div>
                        <div className="flex items-center gap-2 mb-3">
                          <span className={`w-2 h-2 rounded-full ${status.cancelAtPeriodEnd ? 'bg-yellow-500' : 'bg-green-500'} animate-pulse`}></span>
                          <span className="font-semibold text-zinc-900 dark:text-zinc-100">Treble</span>
                        </div>
<p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-1">$5</p>
                         <p className="text-sm text-zinc-500 mb-4">per month + VAT</p>
                        <ul className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
                          <li className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            600 credits/month
                          </li>
                          <li className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Rollover credits (max 600)
                          </li>
                          <li className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Cancel anytime
                          </li>
                        </ul>
                      </div>
                      
                      <p className="text-zinc-600 dark:text-zinc-400">
                        {status.cancelAtPeriodEnd ? (
                          <>Your subscription will cancel on {formatDate(status.currentPeriodEnd!)}. You can still use your credits until then.</>
                        ) : (
                          <>Your subscription renews on {formatDate(status.currentPeriodEnd!)}. 600 credits/month with rollover (max 1200 total balance).</>
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
                  ) : status?.currentPeriodEnd ? (
                    // Canceled subscription with remaining credits
                    <div className="space-y-6">
                      <div className="p-4 border-2 border-yellow-500 dark:border-yellow-600 rounded-xl bg-yellow-50/50 dark:bg-yellow-950/10 relative overflow-hidden">
                        <div className="absolute top-0 right-0 bg-yellow-500 text-white text-xs font-semibold px-3 py-1 rounded-bl-lg">
                          CANCELED
                        </div>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
                          <span className="font-semibold text-zinc-900 dark:text-zinc-100">Treble</span>
                        </div>
                        <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-1">$0</p>
                        <p className="text-sm text-zinc-500 mb-4">until {formatDate(status.currentPeriodEnd)}</p>
                        <ul className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
                          <li className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            {status.credits} credits remaining
                          </li>
                          <li className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Expires {formatDate(status.currentPeriodEnd)}
                          </li>
                        </ul>
                      </div>
                      
                      <p className="text-zinc-600 dark:text-zinc-400">
                        Your subscription was canceled. You can still use your {status.credits} credits until {formatDate(status.currentPeriodEnd)}.
                      </p>
                      <button
                        onClick={startCheckout}
                        disabled={startingCheckout}
                        className="w-full py-3 px-4 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-semibold rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-green-500/25 hover:shadow-green-500/40"
                      >
                        {startingCheckout ? 'Redirecting...' : 'Reactivate Treble — $5/month + VAT'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Plan Comparison */}
                      <div className="grid md:grid-cols-2 gap-4">
                        {/* Free Plan */}
                        <div className="p-4 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 relative overflow-hidden">
                          <div className="absolute top-0 right-0 bg-zinc-400 text-white text-xs font-semibold px-3 py-1 rounded-bl-lg">
                            CURRENT
                          </div>
                          <div className="flex items-center gap-2 mb-3">
                            <span className="w-2 h-2 bg-zinc-400 rounded-full"></span>
                            <span className="font-medium text-zinc-700 dark:text-zinc-300">Free</span>
                          </div>
                          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-1">$0</p>
                          <p className="text-sm text-zinc-500 mb-4">forever</p>
                          <ul className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
                            <li className="flex items-center gap-2">
                              <span className="text-zinc-400">-</span> 50 credits on signup
                            </li>
                            <li className="flex items-center gap-2">
                              <span className="text-zinc-400">-</span> No monthly credits
                            </li>
                          </ul>
                        </div>

                        {/* Treble Plan */}
                        <div className="p-4 border-2 border-green-500 dark:border-green-600 rounded-xl bg-green-50/50 dark:bg-green-950/10 relative overflow-hidden">
                          <div className="absolute top-0 right-0 bg-green-500 text-white text-xs font-semibold px-3 py-1 rounded-bl-lg">
                            POPULAR
                          </div>
                          <div className="flex items-center gap-2 mb-3">
                            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                            <span className="font-semibold text-zinc-900 dark:text-zinc-100">Treble</span>
                          </div>
<p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-1">$5</p>
                         <p className="text-sm text-zinc-500 mb-4">per month + VAT</p>
                         <ul className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
                             <li className="flex items-center gap-2">
                               <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                               </svg>
                               600 credits/month
                             </li>
                             <li className="flex items-center gap-2">
                               <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                               </svg>
                               Rollover credits (max 600)
                             </li>
                             <li className="flex items-center gap-2">
                               <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                               </svg>
                               Cancel anytime
                             </li>
                           </ul>
                         </div>
                       </div>
 
                       {/* CTA Button */}
                       <button
                         onClick={startCheckout}
                         disabled={startingCheckout}
                         className="w-full py-3 px-4 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-semibold rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-green-500/25 hover:shadow-green-500/40"
                       >
                         {startingCheckout ? 'Redirecting...' : 'Upgrade to Treble — $5/month + VAT'}
                      </button>
                      <p className="text-center text-xs text-zinc-500">
                        Secure checkout powered by Polar
                      </p>
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
