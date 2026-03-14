import { Hono } from 'hono'
import { getAuth } from '@hono/clerk-auth'
import { Polar } from '@polar-sh/sdk'
import db from '../lib/db.js'
import { getUserEmail } from '../lib/clerk.js'

const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN!,
  server: (process.env.POLAR_ENV as 'sandbox' | 'production') || 'sandbox',
})

const POLAR_PRODUCT_ID = process.env.POLAR_PRODUCT_ID!

const app = new Hono()

// Create checkout
app.post('/checkout', async (c) => {
  const auth = getAuth(c)
  if (!auth?.userId) return c.json({ error: 'Unauthorized' }, 401)

  if (!POLAR_PRODUCT_ID) {
    return c.json({ error: 'Product ID not configured' }, 500)
  }

  try {
    // Get user's email from Clerk to pre-fill checkout
    const email = await getUserEmail(auth.userId)

    const checkoutParams: any = {
      products: [POLAR_PRODUCT_ID],
      successUrl: `${process.env.WEB_URL}/?checkout_id={CHECKOUT_ID}`,
      cancelUrl: `${process.env.WEB_URL}/account`,
      metadata: { clerkUserId: auth.userId },
    }

    // Pre-fill email if available
    if (email) {
      checkoutParams.customerEmail = email
    }

    const checkout = await polar.checkouts.create(checkoutParams)

    return c.json({ checkoutUrl: checkout.url })
  } catch (error: any) {
    console.error('Polar checkout error:', error)
    return c.json({ error: 'Failed to create checkout', details: error.message }, 500)
  }
})

// Get status
app.get('/status', (c) => {
  const auth = getAuth(c)
  if (!auth?.userId) return c.json({ error: 'Unauthorized' }, 401)

  const user = db.prepare('SELECT * FROM users WHERE clerkUserId = ?')
    .get(auth.userId) as any

  if (!user) {
    return c.json({ subscribed: false, credits: 0, lifetimeCredits: 0 })
  }

  return c.json({
    subscribed: user.status === 'active',
    credits: user.credits,
    lifetimeCredits: user.lifetime_credits || 0,
    currentPeriodEnd: user.currentPeriodEnd,
    cancelAtPeriodEnd: user.cancelAtPeriodEnd === 1,
  })
})

// Get my user ID (for debugging)
app.get('/me', (c) => {
  const auth = getAuth(c)
  if (!auth?.userId) return c.json({ error: 'Unauthorized' }, 401)
  
  return c.json({ 
    clerkUserId: auth.userId,
    sessionClaims: auth.sessionClaims 
  })
})

// Manual sync - checks Polar for subscription and updates credits
app.post('/sync', async (c) => {
  const auth = getAuth(c)
  if (!auth?.userId) return c.json({ error: 'Unauthorized' }, 401)

  try {
    // Get user's email from Clerk
    const email = await getUserEmail(auth.userId)
    
    if (!email) {
      return c.json({ error: 'Email not found in Clerk' }, 400)
    }

    // Get customer by email
    const customersResult = await polar.customers.list({
      email: email,
    })
    
    // Get all customers from iterator
    const customers: any[] = []
    for await (const customer of customersResult) {
      customers.push(customer)
    }

    if (!customers.length) {
      return c.json({ error: 'No customer found' }, 404)
    }

    const customer = customers[0]
    
    // Get all subscriptions from iterator
    const subsResult = await polar.subscriptions.list({
      customerId: customer.id,
    })
    
    const subscriptions: any[] = []
    for await (const sub of subsResult) {
      subscriptions.push(sub)
    }

    const activeSub = subscriptions.find((s: any) => s.status === 'active')

    if (!activeSub) {
      return c.json({ error: 'No active subscription found' }, 404)
    }

    // Update or create user with credits and email
    db.prepare(`
      INSERT INTO users (clerkUserId, email, credits, polarSubscriptionId, status, currentPeriodStart, currentPeriodEnd)
      VALUES (?, ?, 600, ?, ?, ?, ?)
      ON CONFLICT(clerkUserId) DO UPDATE SET
        email = excluded.email,
        credits = CASE WHEN excluded.status = 'active' AND users.status != 'active' THEN 600 ELSE MIN(1200, credits + 600) END,
        polarSubscriptionId = excluded.polarSubscriptionId,
        status = excluded.status,
        currentPeriodStart = excluded.currentPeriodStart,
        currentPeriodEnd = excluded.currentPeriodEnd
    `).run(
      auth.userId,
      email,
      activeSub.id,
      activeSub.status,
      activeSub.currentPeriodStart,
      activeSub.currentPeriodEnd
    )

    return c.json({
      success: true,
      message: 'Credits synced',
      credits: 600
    })
  } catch (error: any) {
    console.error('Sync error:', error)
    return c.json({ error: 'Sync failed', details: error.message }, 500)
  }
})

// Create customer portal session
app.post('/portal', async (c) => {
  const auth = getAuth(c)
  if (!auth?.userId) return c.json({ error: 'Unauthorized' }, 401)

  try {
    // Get user's email from Clerk
    const email = await getUserEmail(auth.userId)
    
    if (!email) {
      return c.json({ error: 'Email not found in Clerk' }, 400)
    }

    // Get customer by email
    const customersResult: any = await polar.customers.list({
      email: email,
    })
    
    // Handle SDK response structure
    const items = customersResult.items || customersResult.result?.items || []
    const customer = items[0]

    if (!customer) {
      return c.json({ 
        error: 'No subscription found', 
        message: 'Please subscribe first before managing your billing.' 
      }, 404)
    }

    // Check for active subscription
    const subsResult: any = await polar.subscriptions.list({
      customerId: customer.id,
    })
    const subs = subsResult.items || subsResult.result?.items || []
    const hasActiveSub = subs.some((s: any) => s.status === 'active')

    if (!hasActiveSub) {
      return c.json({ 
        error: 'No active subscription', 
        message: 'You need an active subscription to manage billing. Please subscribe first.' 
      }, 400)
    }
    
    // Create customer portal session
    const portal = await polar.customerSessions.create({
      customerId: customer.id,
      returnUrl: `${process.env.WEB_URL}/account`,
    })

    return c.json({ portalUrl: portal.customerPortalUrl })
  } catch (error: any) {
    console.error('Portal error:', error)
    return c.json({ error: 'Failed to create portal session', details: error.message }, 500)
  }
})

// Test - manually add credits (dev only)
app.post('/test-add-credits', async (c) => {
  if (process.env.NODE_ENV === 'production') {
    return c.json({ error: 'Not available in production' }, 403)
  }

  try {
    const { clerkUserId, credits = 600 } = await c.req.json()
    
    if (!clerkUserId) {
      return c.json({ error: 'clerkUserId required' }, 400)
    }

    // Insert or update user with credits
    db.prepare(`
      INSERT INTO users (clerkUserId, credits, polarSubscriptionId, status, currentPeriodStart, currentPeriodEnd)
      VALUES (?, ?, 'manual_test', 'active', datetime('now'), datetime('now', '+1 month'))
      ON CONFLICT(clerkUserId) DO UPDATE SET
        credits = credits + ?,
        status = 'active'
    `).run(clerkUserId, credits, credits)

    // Get updated user
    const user = db.prepare('SELECT * FROM users WHERE clerkUserId = ?').get(clerkUserId)

    return c.json({ 
      success: true, 
      message: `Added ${credits} credits`,
      user
    })
  } catch (error: any) {
    console.error('Add credits error:', error)
    return c.json({ error: 'Failed to add credits', details: error.message }, 500)
  }
})

// Add lifetime credits (admin only - requires ADMIN_API_KEY)
app.post('/add-lifetime-credits', async (c) => {
  const adminKey = c.req.header('x-admin-key')
  
  if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  try {
    const { clerkUserId, credits } = await c.req.json()
    
    if (!clerkUserId) {
      return c.json({ error: 'clerkUserId required' }, 400)
    }

    if (!credits || credits < 1) {
      return c.json({ error: 'credits must be a positive number' }, 400)
    }

    // Insert or update user with lifetime credits
    db.prepare(`
      INSERT INTO users (clerkUserId, lifetime_credits)
      VALUES (?, ?)
      ON CONFLICT(clerkUserId) DO UPDATE SET
        lifetime_credits = lifetime_credits + ?
    `).run(clerkUserId, credits, credits)

    // Get updated user
    const user = db.prepare('SELECT clerkUserId, credits, lifetime_credits FROM users WHERE clerkUserId = ?').get(clerkUserId)

    return c.json({ 
      success: true, 
      message: `Added ${credits} lifetime credits`,
      user
    })
  } catch (error: any) {
    console.error('Add lifetime credits error:', error)
    return c.json({ error: 'Failed to add lifetime credits', details: error.message }, 500)
  }
})

export default app
