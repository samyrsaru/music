import 'dotenv/config'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { clerkMiddleware, getAuth } from '@hono/clerk-auth'
import { cors } from 'hono/cors'
import subscriptionRoutes from './routes/subscription.js'
import creditsRoutes from './routes/credits.js'
import webhookRoutes from './routes/webhooks.js'
import generationRoutes from './routes/generations.js'
import { startPolling, getSyncStatus } from './lib/sync.js'

console.log('CLERK_SECRET_KEY exists:', !!process.env.CLERK_SECRET_KEY)
console.log('CLERK_PUBLISHABLE_KEY exists:', !!process.env.CLERK_PUBLISHABLE_KEY)

const app = new Hono()

// Start polling for subscription sync (as backup to webhooks)
startPolling()

app.use('*', cors({
  origin: process.env.WEB_URL || 'http://localhost:5173',
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization'],
}))

app.use('*', clerkMiddleware({
  secretKey: process.env.CLERK_SECRET_KEY,
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY
}))

app.get('/', (c) => {
  return c.json({ message: 'MakeMusic API' })
})

app.get('/health', (c) => {
  return c.json({ status: 'ok' })
})

app.get('/health/sync', (c) => {
  return c.json(getSyncStatus())
})

app.get('/protected', (c) => {
  const auth = getAuth(c)
  
  if (!auth?.userId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  
  return c.json({ 
    message: 'Protected endpoint',
    userId: auth.userId 
  })
})

// Mount routes
app.route('/subscription', subscriptionRoutes)
app.route('/credits', creditsRoutes)
app.route('/webhooks', webhookRoutes)
app.route('/generations', generationRoutes)

const port = parseInt(process.env.PORT || '3003')

serve({
  fetch: app.fetch,
  port
}, (info) => {
  console.log(`🚀 API server running at http://localhost:${info.port}`)
})
