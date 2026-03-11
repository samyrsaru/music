import { Polar } from '@polar-sh/sdk'
import db from './db.js'

const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN!,
  server: (process.env.POLAR_ENV as 'sandbox' | 'production') || 'sandbox',
})

const POLLING_INTERVAL_MS = parseInt(process.env.POLAR_POLLING_INTERVAL_MS || '300000') // Default 5 minutes
const SYNC_LOOKBACK_HOURS = parseInt(process.env.POLAR_SYNC_LOOKBACK_HOURS || '24') // Check last 24 hours on startup

// Track if webhook event was already processed
export function isWebhookProcessed(eventId: string): boolean {
  const result = db.prepare('SELECT 1 FROM webhook_events WHERE id = ?').get(eventId)
  return !!result
}

// Mark webhook event as processed
export function markWebhookProcessed(eventId: string, type: string, payload: any) {
  db.prepare(`
    INSERT INTO webhook_events (id, type, payload, processedAt)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO NOTHING
  `).run(eventId, type, JSON.stringify(payload))
}

// Get last successful sync time
function getLastSyncTime(): Date | null {
  const result = db.prepare('SELECT lastSuccessfulSyncAt FROM sync_state WHERE id = 1').get() as any
  return result?.lastSuccessfulSyncAt ? new Date(result.lastSuccessfulSyncAt) : null
}

// Update sync state
function updateSyncState(success: boolean, error?: string) {
  const now = new Date().toISOString()
  
  if (success) {
    db.prepare(`
      UPDATE sync_state 
      SET lastSyncAt = ?, lastSuccessfulSyncAt = ?, syncCount = syncCount + 1, lastError = NULL, updatedAt = ?
      WHERE id = 1
    `).run(now, now, now)
  } else {
    db.prepare(`
      UPDATE sync_state 
      SET lastSyncAt = ?, errorCount = errorCount + 1, lastError = ?, updatedAt = ?
      WHERE id = 1
    `).run(now, error || 'Unknown error', now)
  }
}

// Get clerkUserId for a subscription (from metadata or by matching email)
async function getClerkUserIdForSubscription(subscription: any): Promise<{ clerkUserId: string; matchedBy: 'metadata' | 'email' } | null> {
  // First try metadata
  let clerkUserId = subscription.metadata?.clerkUserId
  if (clerkUserId) {
    const user = db.prepare('SELECT * FROM users WHERE clerkUserId = ?').get(clerkUserId) as any
    if (user) {
      return { clerkUserId, matchedBy: 'metadata' }
    }
    console.log(`  ⚠️  Subscription ${subscription.id} has clerkUserId ${clerkUserId} but no matching user in DB`)
    return null
  }
  
  // Try matching by email
  if (subscription.customerId) {
    try {
      const customer = await polar.customers.get({ id: subscription.customerId })
      if (customer.email) {
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(customer.email) as any
        if (user) {
          console.log(`  ✅ Matched subscription ${subscription.id} to user via email ${customer.email}`)
          return { clerkUserId: user.clerkUserId, matchedBy: 'email' }
        }
        console.log(`  ⚠️  No user found with email ${customer.email}`)
      }
    } catch (err: any) {
      console.log(`  ⚠️  Failed to fetch customer for subscription ${subscription.id}: ${err.message}`)
    }
  }
  
  return null
}

// Sync a single subscription
async function syncSubscription(subscription: any, clerkUserId: string): Promise<{ action: string; clerkUserId: string } | null> {
  
  const existingUser = db.prepare('SELECT * FROM users WHERE clerkUserId = ?')
    .get(clerkUserId) as any
  
  // Normalize dates for comparison (handle different formats)
  const normalizeDate = (date: any): number => {
    if (!date) return 0
    try {
      // Convert to timestamp for comparison (ignore milliseconds)
      return Math.floor(new Date(date).getTime() / 1000)
    } catch {
      return 0
    }
  }
  
  const existingPeriodEnd = normalizeDate(existingUser?.currentPeriodEnd)
  const newPeriodEnd = normalizeDate(subscription.currentPeriodEnd)
  const existingCancelAtEnd = existingUser?.cancelAtPeriodEnd === 1
  const newCancelAtEnd = !!subscription.cancelAtPeriodEnd
  
  const hasChanged = !existingUser || 
    existingUser.polarSubscriptionId !== subscription.id ||
    existingUser.status !== subscription.status ||
    existingPeriodEnd !== newPeriodEnd ||
    existingCancelAtEnd !== newCancelAtEnd
  
  if (!hasChanged) {
    return { action: 'in_sync', clerkUserId } // Signal no changes needed
  }
  
  if (existingUser) {
    console.log(`  📝 Changes detected for ${clerkUserId}:`)
    if (existingUser.polarSubscriptionId !== subscription.id) {
      console.log(`     - Subscription ID: ${existingUser.polarSubscriptionId} -> ${subscription.id}`)
    }
    if (existingUser.status !== subscription.status) {
      console.log(`     - Status: ${existingUser.status} -> ${subscription.status}`)
    }
    if (existingPeriodEnd !== newPeriodEnd) {
      console.log(`     - Period End: ${existingUser.currentPeriodEnd} -> ${subscription.currentPeriodEnd}`)
    }
    if (existingCancelAtEnd !== newCancelAtEnd) {
      console.log(`     - Cancel at period end: ${existingCancelAtEnd} -> ${newCancelAtEnd}`)
    }
  }
  
  // Handle different subscription statuses
  let credits = existingUser?.credits || 0
  
  switch (subscription.status) {
    case 'active':
      // Reset credits to 100 for new active subscription or renewal
      if (!existingUser || existingUser.currentPeriodEnd !== subscription.currentPeriodEnd) {
        credits = 100
      }
      break
      
    case 'canceled':
    case 'past_due':
    case 'unpaid':
    case 'incomplete_expired':
      // Don't reset credits, but mark status
      break
      
    case 'incomplete':
      // New subscription still being set up
      break
      
    default:
      console.log(`  ℹ️  Unknown subscription status: ${subscription.status}`)
  }
  
  // Validate and convert values for SQLite
  const values = {
    clerkUserId: String(clerkUserId),
    credits: Number(credits) || 0,
    polarSubscriptionId: String(subscription.id || ''),
    status: String(subscription.status || ''),
    currentPeriodStart: subscription.currentPeriodStart ? String(subscription.currentPeriodStart) : null,
    currentPeriodEnd: subscription.currentPeriodEnd ? String(subscription.currentPeriodEnd) : null,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd ? 1 : 0
  }
  
  db.prepare(`
    INSERT INTO users (clerkUserId, credits, polarSubscriptionId, status, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(clerkUserId) DO UPDATE SET
      credits = COALESCE(excluded.credits, users.credits),
      polarSubscriptionId = excluded.polarSubscriptionId,
      status = excluded.status,
      currentPeriodStart = excluded.currentPeriodStart,
      currentPeriodEnd = excluded.currentPeriodEnd,
      cancelAtPeriodEnd = COALESCE(excluded.cancelAtPeriodEnd, users.cancelAtPeriodEnd)
  `).run(
    values.clerkUserId,
    values.credits,
    values.polarSubscriptionId,
    values.status,
    values.currentPeriodStart,
    values.currentPeriodEnd,
    values.cancelAtPeriodEnd
  )
  
  return { action: subscription.status, clerkUserId }
}

// Main sync function - can be called on startup or on schedule
export async function syncAllSubscriptions(options: { fullSync?: boolean; since?: Date } = {}) {
  const startTime = Date.now()
  const syncType = options.fullSync ? 'full' : 'incremental'
  
  console.log(`🔄 Starting ${syncType} subscription sync...`)
  
  try {
    // Get subscriptions from Polar
    const listParams: any = {}
    
    // If incremental sync, only get recently updated subscriptions
    if (!options.fullSync && !options.since) {
      const lastSync = getLastSyncTime()
      if (lastSync) {
        // Get subscriptions updated since last sync (with 1 hour buffer for safety)
        const since = new Date(lastSync.getTime() - 60 * 60 * 1000)
        listParams.updatedAfter = since.toISOString()
        console.log(`  📅 Fetching subscriptions updated after ${since.toISOString()}`)
      }
    }
    
    if (options.since) {
      listParams.updatedAfter = options.since.toISOString()
    }
    
    const subsResult = await polar.subscriptions.list(listParams)
    
    let processedCount = 0
    let createdCount = 0
    let updatedCount = 0
    const actions: Record<string, number> = {}
    
    // Collect all subscriptions first to prioritize active ones
    const allSubscriptions: any[] = []
    for await (const page of subsResult as any) {
      const pageData = page.result || page
      const items = pageData.items || []
      allSubscriptions.push(...items)
    }
    
    // Group by clerkUserId and prioritize active subscriptions
    const userSubscriptions = new Map<string, { subscription: any; clerkUserId: string }>()
    
    for (const subscription of allSubscriptions) {
      const match = await getClerkUserIdForSubscription(subscription)
      if (!match) continue
      
      const { clerkUserId } = match
      const existing = userSubscriptions.get(clerkUserId)
      // Keep active subscription, or if none exists yet
      if (!existing || (subscription.status === 'active' && existing.subscription.status !== 'active')) {
        userSubscriptions.set(clerkUserId, { subscription, clerkUserId })
      }
    }
    
    // Process only the prioritized subscriptions
    let inSyncCount = 0
    
    for (const { subscription, clerkUserId } of userSubscriptions.values()) {
      processedCount++
      
      const result = await syncSubscription(subscription, clerkUserId)
      
      if (result) {
        if (result.action === 'in_sync') {
          inSyncCount++
          continue
        }
        
        if (!actions[result.action]) {
          actions[result.action] = 0
        }
        actions[result.action]++
        
        const existingUser = db.prepare('SELECT * FROM users WHERE clerkUserId = ?')
          .get(result.clerkUserId) as any
        
        if (existingUser?.polarSubscriptionId === subscription.id) {
          updatedCount++
        } else {
          createdCount++
        }
      }
    }
    
    // Log summary of in-sync subscriptions
    if (inSyncCount > 0 && inSyncCount === processedCount) {
      console.log(`  ✓ All subscriptions in sync`)
    }
    
    // Update sync state
    updateSyncState(true)
    
    const duration = Date.now() - startTime
    console.log(`✅ Sync completed in ${duration}ms:`)
    console.log(`   Processed: ${processedCount} subscriptions`)
    console.log(`   Created: ${createdCount}, Updated: ${updatedCount}`)
    if (Object.keys(actions).length > 0) {
      console.log(`   Actions: ${JSON.stringify(actions)}`)
    }
    
    return {
      success: true,
      processed: processedCount,
      created: createdCount,
      updated: updatedCount,
      actions,
      duration,
    }
  } catch (error: any) {
    const duration = Date.now() - startTime
    console.error(`❌ Sync failed after ${duration}ms:`, error.message)
    
    updateSyncState(false, error.message)
    
    return {
      success: false,
      error: error.message,
      duration,
    }
  }
}

// Start scheduled polling
let pollingInterval: NodeJS.Timeout | null = null

export function startPolling() {
  if (pollingInterval) {
    console.log('⚠️  Polling already running')
    return
  }
  
  console.log(`⏰ Starting Polar polling every ${POLLING_INTERVAL_MS}ms (${POLLING_INTERVAL_MS / 60000} minutes)`)
  
  // Run initial sync with lookback period to catch missed events during downtime
  const lookbackHours = SYNC_LOOKBACK_HOURS
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000)
  console.log(`🔍 Initial sync: looking back ${lookbackHours} hours to catch missed events`)
  
  syncAllSubscriptions({ since }).then((result) => {
    if (result.success) {
      console.log('✅ Initial sync completed')
    } else {
      console.error('❌ Initial sync failed:', result.error)
    }
  })
  
  // Set up recurring polling
  pollingInterval = setInterval(async () => {
    console.log('⏰ Running scheduled sync...')
    const result = await syncAllSubscriptions()
    
    if (!result.success) {
      console.error('❌ Scheduled sync failed:', result.error)
    }
  }, POLLING_INTERVAL_MS)
  
  // Handle graceful shutdown
  process.on('SIGTERM', stopPolling)
  process.on('SIGINT', stopPolling)
}

export function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval)
    pollingInterval = null
    console.log('⏹️  Stopped Polar polling')
  }
}

export function isPolling(): boolean {
  return pollingInterval !== null
}

// Get sync status for health checks
export function getSyncStatus() {
  const state = db.prepare('SELECT * FROM sync_state WHERE id = 1').get() as any
  
  return {
    isPolling: isPolling(),
    pollingIntervalMs: POLLING_INTERVAL_MS,
    lastSyncAt: state?.lastSyncAt || null,
    lastSuccessfulSyncAt: state?.lastSuccessfulSyncAt || null,
    syncCount: state?.syncCount || 0,
    errorCount: state?.errorCount || 0,
    lastError: state?.lastError || null,
  }
}

// Legacy function for backward compatibility
export async function syncSubscriptionsOnStartup() {
  console.log('🔄 Running startup sync...')
  
  // Do a full sync on startup with lookback
  const lookbackHours = SYNC_LOOKBACK_HOURS
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000)
  
  const result = await syncAllSubscriptions({ since })
  
  if (result.success) {
    console.log('✅ Startup sync completed successfully')
  } else {
    console.error('❌ Startup sync failed:', result.error)
  }
  
  return result
}
