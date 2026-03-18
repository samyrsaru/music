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

    const webhookUrl = process.env.REPLICATE_WEBHOOK_URL || 
      `${c.req.url.replace('/generate', '')}/webhook`

    console.log(`🔗 [EPHEMERAL] Using webhook URL: ${webhookUrl}`)

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

  // Calculate expiration time (1 hour from creation)
  const createdAt = new Date(generation.createdAt)
  const expiresAt = new Date(createdAt.getTime() + 60 * 60 * 1000)
  const isExpired = new Date() > expiresAt

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

// Webhook endpoint for ephemeral generations
app.post('/webhook', async (c) => {
  const payload = await c.req.json()
  
  console.log(`🔔 [EPHEMERAL WEBHOOK] Received:`, JSON.stringify(payload, null, 2))
  
  const { id: replicateId, status: replicateStatus, output } = payload
  
  if (!replicateId) {
    console.error(`❌ [EPHEMERAL WEBHOOK] Missing prediction ID`)
    return c.json({ error: 'Missing prediction ID' }, 400)
  }

  // Find the ephemeral generation by replicate ID
  const generation = db.prepare(`
    SELECT * FROM ephemeral_generations WHERE replicateId = ?
  `).get(replicateId) as any

  if (!generation) {
    console.log(`ℹ️ [EPHEMERAL WEBHOOK] Generation not found for replicateId: ${replicateId} (might be a regular generation)`)
    return c.json({ error: 'Generation not found' }, 404)
  }

  if (replicateStatus === 'succeeded') {
    try {
      // Extract audio URL from output
      let audioUrl: string | null = null
      
      if (typeof output === 'string') {
        audioUrl = output
      } else if (Array.isArray(output) && output.length > 0) {
        audioUrl = String(output[0])
      } else if (output && typeof output === 'object') {
        if (output.url) {
          audioUrl = typeof output.url === 'function' ? output.url() : String(output.url)
        } else if (output.output) {
          if (Array.isArray(output.output) && output.output.length > 0) {
            audioUrl = String(output.output[0])
          } else {
            audioUrl = String(output.output)
          }
        } else if (output.audio) {
          audioUrl = String(output.audio)
        } else {
          const values = Object.values(output)
          const urlValue = values.find(v => typeof v === 'string' && (v.startsWith('http://') || v.startsWith('https://')))
          if (urlValue) audioUrl = urlValue as string
        }
      }

      if (!audioUrl) {
        throw new Error('No audio URL in webhook payload')
      }

      console.log(`✅ [EPHEMERAL WEBHOOK] Generation completed! URL: ${audioUrl.substring(0, 60)}...`)

      // Update generation status - NO R2 UPLOAD for ephemeral!
      db.prepare(`
        UPDATE ephemeral_generations 
        SET status = 'completed', 
            audioUrl = ?
        WHERE id = ?
      `).run(audioUrl, generation.id)

      console.log(`💾 [EPHEMERAL WEBHOOK] Generation ${generation.id} marked as completed`)

    } catch (error: any) {
      console.error(`❌ [EPHEMERAL WEBHOOK] Failed to process:`, error.message)
      
      db.prepare(`
        UPDATE ephemeral_generations 
        SET status = 'failed'
        WHERE id = ?
      `).run(generation.id)
    }
  } else if (replicateStatus === 'failed' || replicateStatus === 'canceled') {
    console.error(`❌ [EPHEMERAL WEBHOOK] Generation failed: ${replicateStatus}`)
    
    db.prepare(`
      UPDATE ephemeral_generations 
      SET status = 'failed'
      WHERE id = ?
    `).run(generation.id)
    
    // Refund credits
    const modelConfig = getModelConfig(generation.model || DEFAULT_MODEL)
    db.prepare('UPDATE users SET lifetime_credits = lifetime_credits + ? WHERE clerkUserId = ?')
      .run(modelConfig.cost, generation.clerkUserId)
    
    console.log(`💰 [EPHEMERAL WEBHOOK] ${modelConfig.cost} credits refunded`)
  }

  return c.json({ success: true })
})

export default app
