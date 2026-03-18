import { Hono } from 'hono'
import { getAuth } from '@hono/clerk-auth'
import Replicate from 'replicate'
import db from '../lib/db.js'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN!,
})

const app = new Hono()

// Model configurations - copied from generations.ts
const AVAILABLE_MODELS = [
  {
    id: 'minimax/music-1.5',
    cost: 10,
    constraints: {
      lyrics: { min: 10, max: 600 },
      prompt: { min: 10, max: 300 }
    }
  },
  {
    id: 'minimax/music-2.5',
    cost: 50,
    constraints: {
      lyrics: { min: 1, max: 3500 },
      prompt: { min: 0, max: 2000 }
    }
  }
]

const DEFAULT_MODEL = 'minimax/music-1.5'

function getModelConfig(modelId: string) {
  return AVAILABLE_MODELS.find(m => m.id === modelId) || AVAILABLE_MODELS[0]
}

// Generate ephemeral music (private mode - no lyrics/prompt stored)
app.post('/generate', async (c) => {
  const auth = getAuth(c)
  if (!auth?.userId) return c.json({ error: 'Unauthorized' }, 401)

  const { lyrics, prompt, model: modelId } = await c.req.json()
  
  const modelConfig = getModelConfig(modelId || DEFAULT_MODEL)
  
  // Validation
  const lyricsLength = lyrics?.length || 0
  const promptLength = prompt?.length || 0
  
  if (lyricsLength < modelConfig.constraints.lyrics.min) {
    return c.json({ 
      error: `Lyrics must be at least ${modelConfig.constraints.lyrics.min} characters`,
      field: 'lyrics'
    }, 400)
  }
  
  if (lyricsLength > modelConfig.constraints.lyrics.max) {
    return c.json({ 
      error: `Lyrics must be no more than ${modelConfig.constraints.lyrics.max} characters`,
      field: 'lyrics'
    }, 400)
  }
  
  if (promptLength < modelConfig.constraints.prompt.min) {
    return c.json({
      error: `Prompt must be at least ${modelConfig.constraints.prompt.min} characters`,
      field: 'prompt'
    }, 400)
  }

  if (promptLength > modelConfig.constraints.prompt.max) {
    return c.json({ 
      error: `Prompt must be no more than ${modelConfig.constraints.prompt.max} characters`,
      field: 'prompt'
    }, 400)
  }

  // Check credits
  const user = db.prepare('SELECT credits, lifetime_credits FROM users WHERE clerkUserId = ?')
    .get(auth.userId) as any

  const songCost = modelConfig.cost
  const totalCredits = (user?.credits || 0) + (user?.lifetime_credits || 0)
  if (!user || totalCredits < songCost) {
    return c.json({ error: 'Insufficient credits' }, 402)
  }

  // Deduct credits
  const subscriptionDeduction = Math.min(user.credits, songCost)
  const lifetimeDeduction = songCost - subscriptionDeduction

  if (subscriptionDeduction > 0) {
    db.prepare('UPDATE users SET credits = credits - ? WHERE clerkUserId = ?')
      .run(subscriptionDeduction, auth.userId)
  }
  if (lifetimeDeduction > 0) {
    db.prepare('UPDATE users SET lifetime_credits = lifetime_credits - ? WHERE clerkUserId = ?')
      .run(lifetimeDeduction, auth.userId)
  }

  const generationId = crypto.randomUUID()
  
  console.log(`🔒 [EPHEMERAL] Generation started for user: ${auth.userId.substring(0, 8)}...`)
  console.log(`   Generation ID: ${generationId}`)

  try {
    // Create pending ephemeral generation record (NO lyrics/prompt stored!)
    db.prepare(`
      INSERT INTO ephemeral_generations (id, clerkUserId, status, model, createdAt)
      VALUES (?, ?, 'pending', ?, datetime('now'))
    `).run(generationId, auth.userId, modelConfig.id)

    // Start async generation with webhook
    const input = {
      lyrics: lyrics,
      prompt: prompt || 'pop music'
    }

    // Use the unified webhook endpoint for all generations
    // If REPLICATE_WEBHOOK_URL is set and includes the webhook path, use it directly
    // Otherwise, construct it from the request URL
    const webhookUrl = process.env.REPLICATE_WEBHOOK_URL?.includes('/api/webhooks/replicate') 
      ? process.env.REPLICATE_WEBHOOK_URL
      : `${process.env.REPLICATE_WEBHOOK_URL || c.req.url.replace('/api/ephemeral/generate', '')}/api/webhooks/replicate`

    console.log(`🔗 [EPHEMERAL] Webhook URL: ${webhookUrl}`)

    const prediction = await replicate.predictions.create({
      model: modelConfig.id,
      input,
      webhook: webhookUrl,
      webhook_events_filter: ["completed"]
    })

    // Store the replicate prediction ID
    db.prepare(`
      UPDATE ephemeral_generations 
      SET replicateId = ?
      WHERE id = ?
    `).run(prediction.id, generationId)

    console.log(`⏳ [EPHEMERAL] Prediction ${prediction.id} started`)

    const creditsRemaining = totalCredits - songCost

    return c.json({
      success: true,
      generationId,
      status: 'pending',
      creditsRemaining,
      message: 'Ephemeral generation started. Download within 1 hour.'
    })

  } catch (error: any) {
    console.error(`❌ [EPHEMERAL] Failed to start generation:`, error.message)
    
    // Refund credits
    db.prepare('UPDATE users SET lifetime_credits = lifetime_credits + ? WHERE clerkUserId = ?')
      .run(songCost, auth.userId)
    
    // Clean up pending generation
    db.prepare('DELETE FROM ephemeral_generations WHERE id = ?').run(generationId)
    
    return c.json({ error: 'Failed to start generation', details: error.message }, 500)
  }
})

// Get ephemeral generation status
app.get('/status/:id', async (c) => {
  const auth = getAuth(c)
  if (!auth?.userId) return c.json({ error: 'Unauthorized' }, 401)

  const id = c.req.param('id')
  
  const generation = db.prepare(`
    SELECT id, status, audioUrl, model, createdAt
    FROM ephemeral_generations 
    WHERE id = ? AND clerkUserId = ?
  `).get(id, auth.userId) as any

  if (!generation) {
    return c.json({ error: 'Generation not found' }, 404)
  }

  // Calculate expiration time (1 hour from creation) - handle both SQLite format and ISO8601 format
  const createdAtStr = generation.createdAt.endsWith('Z') ? generation.createdAt : generation.createdAt + 'Z'
  const createdAt = new Date(createdAtStr)
  const expiresAt = new Date(createdAt.getTime() + 60 * 60 * 1000)
  const now = new Date()
  const isExpired = now > expiresAt
  
  console.log(`[EPHEMERAL STATUS] id=${id}, rawCreatedAt=${generation.createdAt}, parsedCreatedAt=${createdAt.toISOString()}, expiresAt=${expiresAt.toISOString()}, now=${now.toISOString()}, isExpired=${isExpired}`)

  return c.json({
    id: generation.id,
    status: isExpired ? 'expired' : generation.status,
    audioUrl: generation.audioUrl,
    model: generation.model,
    createdAt: generation.createdAt,
    expiresAt: expiresAt.toISOString(),
    isExpired
  })
})

// Note: Webhook handling is done in /api/webhooks/replicate
// Both ephemeral and regular generations use the same unified endpoint

export default app
