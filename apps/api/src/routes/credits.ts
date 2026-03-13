import { Hono } from 'hono'
import { getAuth } from '@hono/clerk-auth'
import db from '../lib/db.js'

const app = new Hono()

// Simulate using credits
app.post('/use', (c) => {
  const auth = getAuth(c)
  if (!auth?.userId) return c.json({ error: 'Unauthorized' }, 401)

  const { amount = '1' } = c.req.query()
  const creditsToUse = parseInt(amount, 10)
  
  const user = db.prepare('SELECT credits, lifetime_credits FROM users WHERE clerkUserId = ?')
    .get(auth.userId) as any

  const totalCredits = (user?.credits || 0) + (user?.lifetime_credits || 0)
  if (!user || totalCredits < creditsToUse) {
    return c.json({ error: 'Insufficient credits' }, 400)
  }

  // Deduct from subscription credits first, then lifetime credits
  const subscriptionDeduction = Math.min(user.credits, creditsToUse)
  const lifetimeDeduction = creditsToUse - subscriptionDeduction

  if (subscriptionDeduction > 0) {
    db.prepare('UPDATE users SET credits = credits - ? WHERE clerkUserId = ?')
      .run(subscriptionDeduction, auth.userId)
  }
  if (lifetimeDeduction > 0) {
    db.prepare('UPDATE users SET lifetime_credits = lifetime_credits - ? WHERE clerkUserId = ?')
      .run(lifetimeDeduction, auth.userId)
  }

  return c.json({ 
    success: true, 
    remaining: totalCredits - creditsToUse 
  })
})

export default app
