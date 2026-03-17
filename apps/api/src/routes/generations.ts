import { Hono } from 'hono'
import { getAuth } from '@hono/clerk-auth'
import Replicate from 'replicate'
import db from '../lib/db.js'
import { uploadAudioToR2, downloadAudioFromUrl, getSignedAudioUrl, deleteAudioFromR2 } from '../lib/r2.js'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN!,
})

const app = new Hono()

// Model configuration - centralized constraints and pricing
const MODEL_CONFIG = {
  id: 'minimax/music-1.5',
  cost: 10, // Credits per song generation
  constraints: {
    lyrics: {
      min: 10,
      max: 600,
    },
    prompt: {
      min: 10,
      max: 300,
    }
  }
}

// Helper function to clean LLM output
function cleanLlmOutput(output: any): string {
  let text: string
  
  if (typeof output === 'string') {
    text = output
  } else if (Array.isArray(output) && output.length > 0) {
    text = output.join('')
  } else if (output && typeof output === 'object') {
    text = output.output || output.text || JSON.stringify(output)
  } else {
    text = String(output)
  }
  
  // Remove common prefixes and artifacts
  text = text.trim()
  text = text.replace(/^(assistant|system|user)\s*[:\-]?\s*/gi, '')
  text = text.replace(/^(here are|here is|sure,? here are|sure,? here is)[\s\w]*?:?\s*/i, '')
  text = text.replace(/^["']|["']$/g, '').trim()
  text = text.replace(/^(the style is|style:|here is|here are)[\s\w]*?:?\s*/i, '')
  text = text.replace(/^\[?INST\]?\s*/i, '')
  text = text.replace(/\s*\[\/INST\]\s*$/i, '')
  
  return text
}

// Helper function to validate lyrics format
function validateLyrics(lyrics: string): boolean {
  // Must have at least one verse and one chorus
  const hasVerse = /\[Verse\]/i.test(lyrics)
  const hasChorus = /\[Chorus\]/i.test(lyrics)
  const length = lyrics.length
  
  return hasVerse && hasChorus && length >= MODEL_CONFIG.constraints.lyrics.min && length <= MODEL_CONFIG.constraints.lyrics.max
}

// Get model configuration
app.get('/config', (c) => {
  return c.json(MODEL_CONFIG)
})

// Generate music - Async with webhook
app.post('/generate', async (c) => {
  const auth = getAuth(c)
  if (!auth?.userId) return c.json({ error: 'Unauthorized' }, 401)

  const { lyrics, prompt, originalIdea } = await c.req.json()
  
  // Server-side validation using model constraints
  const lyricsLength = lyrics?.length || 0
  const promptLength = prompt?.length || 0
  
  if (lyricsLength < MODEL_CONFIG.constraints.lyrics.min) {
    return c.json({ 
      error: `Lyrics must be at least ${MODEL_CONFIG.constraints.lyrics.min} characters`,
      field: 'lyrics'
    }, 400)
  }
  
  if (lyricsLength > MODEL_CONFIG.constraints.lyrics.max) {
    return c.json({ 
      error: `Lyrics must be no more than ${MODEL_CONFIG.constraints.lyrics.max} characters`,
      field: 'lyrics'
    }, 400)
  }
  
  if (promptLength < MODEL_CONFIG.constraints.prompt.min) {
    return c.json({
      error: `Prompt must be at least ${MODEL_CONFIG.constraints.prompt.min} characters`,
      field: 'prompt'
    }, 400)
  }

  if (promptLength > MODEL_CONFIG.constraints.prompt.max) {
    return c.json({ 
      error: `Prompt must be no more than ${MODEL_CONFIG.constraints.prompt.max} characters`,
      field: 'prompt'
    }, 400)
  }

  const user = db.prepare('SELECT credits, lifetime_credits FROM users WHERE clerkUserId = ?')
    .get(auth.userId) as any

  const songCost = MODEL_CONFIG.cost
  const totalCredits = (user?.credits || 0) + (user?.lifetime_credits || 0)
  if (!user || totalCredits < songCost) {
    return c.json({ error: 'Insufficient credits' }, 402)
  }

  // Deduct from subscription credits first, then lifetime credits
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

  const { name } = await c.req.json()
  
  const generationId = crypto.randomUUID()
  
  console.log(`🎵 [START] Generation started for user: ${auth.userId.substring(0, 8)}...`)
  console.log(`   Generation ID: ${generationId}`)
  console.log(`   Lyrics: ${lyrics.substring(0, 50)}...`)
  console.log(`   Prompt: ${prompt || 'pop music'}`)
  console.log(`   Name: ${name || '(not provided)'}`)

  // Use provided name or fallback to truncated prompt
  const generatedName = name?.trim() || prompt.split(' ').slice(0, 4).join(' ') || 'My Song'
  const finalName = generatedName.length > 60 ? generatedName.substring(0, 60) : generatedName
  
  console.log(`✅ [NAME] Using: "${finalName}"`)

  try {
    // Create pending generation record
    db.prepare(`
      INSERT INTO generations (id, clerkUserId, lyrics, prompt, name, originalIdea, status, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
    `).run(generationId, auth.userId, lyrics, prompt || 'pop music', finalName, originalIdea || null)

    // Start async generation with webhook
    const input = {
      lyrics: lyrics,
      prompt: prompt || 'pop music'
    }

    // Get webhook URL from environment or construct it
    const webhookUrl = process.env.REPLICATE_WEBHOOK_URL || 
      `${c.req.url.replace('/generate', '')}/generate/webhook`

    console.log(`🔗 [WEBHOOK] Using webhook URL: ${webhookUrl}`)

    // Start the prediction asynchronously with webhook
    const prediction = await replicate.predictions.create({
      model: "minimax/music-1.5",
      input,
      webhook: webhookUrl,
      webhook_events_filter: ["completed"]
    })

    // Store the replicate prediction ID
    db.prepare(`
      UPDATE generations 
      SET replicateId = ?
      WHERE id = ?
    `).run(prediction.id, generationId)

    console.log(`⏳ [PENDING] Prediction ${prediction.id} started, waiting for webhook...`)

    // Calculate remaining credits
    const creditsRemaining = totalCredits - songCost

    // Return immediately with pending status
    return c.json({
      success: true,
      generationId,
      status: 'pending',
      creditsRemaining,
      message: 'Generation started. Check status using the generation ID.'
    })

  } catch (error: any) {
    console.error(`❌ [FAILED] Failed to start generation:`, error.message)
    
    // Refund credits on failure to start (refund to lifetime_credits pool)
    db.prepare('UPDATE users SET lifetime_credits = lifetime_credits + ? WHERE clerkUserId = ?')
      .run(songCost, auth.userId)
    
    // Clean up pending generation if it was created
    db.prepare('DELETE FROM generations WHERE id = ?').run(generationId)
    
    return c.json({ error: 'Failed to start generation', details: error.message }, 500)
  }
})

// Webhook endpoint for Replicate
app.post('/generate/webhook', async (c) => {
  const payload = await c.req.json()
  
  console.log(`🔔 [WEBHOOK] Received webhook:`, JSON.stringify(payload, null, 2))
  
  // Verify this is a prediction we care about
  const { id: replicateId, status: replicateStatus, output } = payload
  
  if (!replicateId) {
    console.error(`❌ [WEBHOOK] Missing prediction ID`)
    return c.json({ error: 'Missing prediction ID' }, 400)
  }

  // Find the generation by replicate ID
  const generation = db.prepare(`
    SELECT * FROM generations WHERE replicateId = ?
  `).get(replicateId) as any

  if (!generation) {
    console.error(`❌ [WEBHOOK] Generation not found for replicateId: ${replicateId}`)
    return c.json({ error: 'Generation not found' }, 404)
  }

  // Idempotency check - track webhook events
  const webhookId = crypto.randomUUID()
  try {
    db.prepare(`
      INSERT INTO webhook_events (id, type, payload)
      VALUES (?, 'replicate_prediction', ?)
    `).run(webhookId, JSON.stringify(payload))
  } catch (err) {
    // Ignore duplicate webhook errors
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

      console.log(`✅ [WEBHOOK] Generation completed! URL: ${audioUrl.substring(0, 60)}...`)

      // Upload to R2 for permanent storage
      let r2Key: string | null = null
      try {
        console.log(`⬇️ [WEBHOOK] Downloading audio for R2 upload...`)
        const audioBuffer = await downloadAudioFromUrl(audioUrl)
        const key = `audio/${generation.clerkUserId}/${generation.id}.mp3`
        
        console.log(`⬆️ [WEBHOOK] Uploading audio to R2...`)
        r2Key = await uploadAudioToR2(audioBuffer, key)
        console.log(`✅ [WEBHOOK] Uploaded to R2: ${r2Key}`)
      } catch (r2Error) {
        console.error('[WEBHOOK] R2 upload failed:', r2Error)
      }

      // Update generation status
      db.prepare(`
        UPDATE generations 
        SET status = 'completed', 
            audioUrl = ?, 
            r2Key = ?, 
            completedAt = datetime('now')
        WHERE id = ?
      `).run(audioUrl, r2Key, generation.id)

      console.log(`💾 [WEBHOOK] Generation ${generation.id} marked as completed`)

    } catch (error: any) {
      console.error(`❌ [WEBHOOK] Failed to process successful generation:`, error.message)
      
      // Mark as failed
      db.prepare(`
        UPDATE generations 
        SET status = 'failed', 
            completedAt = datetime('now')
        WHERE id = ?
      `).run(generation.id)
    }
  } else if (replicateStatus === 'failed' || replicateStatus === 'canceled') {
    console.error(`❌ [WEBHOOK] Generation failed with status: ${replicateStatus}`)
    
    // Mark as failed and refund credits
    db.prepare(`
      UPDATE generations 
      SET status = 'failed', 
          completedAt = datetime('now')
      WHERE id = ?
    `).run(generation.id)
    
    // Refund credits to lifetime_credits pool
    db.prepare('UPDATE users SET lifetime_credits = lifetime_credits + ? WHERE clerkUserId = ?')
      .run(MODEL_CONFIG.cost, generation.clerkUserId)
    
    console.log(`💰 [WEBHOOK] Credits refunded to lifetime pool for user: ${generation.clerkUserId.substring(0, 8)}...`)
  }

  return c.json({ success: true })
})

// Get generation status (for polling)
app.get('/status/:id', async (c) => {
  const auth = getAuth(c)
  if (!auth?.userId) return c.json({ error: 'Unauthorized' }, 401)

  const id = c.req.param('id')
  
  const generation = db.prepare(`
    SELECT id, status, audioUrl, r2Key, lyrics, prompt, name, createdAt, completedAt, replicateId
    FROM generations 
    WHERE id = ? AND clerkUserId = ?
  `).get(id, auth.userId) as any

  if (!generation) {
    return c.json({ error: 'Generation not found' }, 404)
  }

  // Generate signed URL if completed and has R2 key
  let signedUrl = generation.audioUrl
  if (generation.status === 'completed' && generation.r2Key) {
    try {
      const filename = generation.name?.trim() || generation.prompt
      signedUrl = await getSignedAudioUrl(generation.r2Key, 3600, filename) // 1 hour
    } catch (err) {
      console.error(`Failed to generate signed URL for ${id}:`, err)
      signedUrl = generation.audioUrl
    }
  }

  return c.json({
    id: generation.id,
    status: generation.status,
    audioUrl: signedUrl,
    lyrics: generation.lyrics,
    prompt: generation.prompt,
    name: generation.name,
    createdAt: generation.createdAt,
    completedAt: generation.completedAt,
    replicateId: generation.replicateId
  })
})

// Generate lyrics helper
app.post('/lyrics', async (c) => {
  const auth = getAuth(c)
  if (!auth?.userId) return c.json({ error: 'Unauthorized' }, 401)

  const { topic, mood } = await c.req.json()
  
  if (!topic?.trim()) {
    return c.json({ error: 'Topic is required' }, 400)
  }

  try {
    console.log(`🎤 [LYRICS] Generating lyrics for: "${topic}" ${mood ? `(${mood})` : ''}`)
    
    // Generate lyrics
    const lyricsPrompt = `Write song lyrics about: ${topic}${mood ? ` with a ${mood} mood` : ''}.

Requirements:
- Format: [Verse], [Chorus], [Verse], [Chorus], [Bridge], [Chorus] sections
- Length: ${MODEL_CONFIG.constraints.lyrics.min}-${MODEL_CONFIG.constraints.lyrics.max} characters
- Rhyme scheme: AABB or ABAB
- Start immediately with [Verse], no introductions

Begin:`

    let generatedLyrics: string = ''
    let lyricsAttempts = 0
    const maxLyricsAttempts = 2
    
    while (lyricsAttempts < maxLyricsAttempts) {
      lyricsAttempts++
      console.log(`🎤 [LYRICS] Attempt ${lyricsAttempts}/${maxLyricsAttempts}`)
      
      const lyricsOutput = await replicate.run("meta/meta-llama-3-8b-instruct", {
        input: {
          prompt: lyricsPrompt,
          max_tokens: 800,
          temperature: 0.7,
          system_prompt: "You are a songwriting assistant. You write only song lyrics, nothing else. Never include introductions, explanations, or metadata. Just output the lyrics directly."
        }
      }) as any
      
      generatedLyrics = cleanLlmOutput(lyricsOutput)
      
      // Ensure it fits constraints
      if (generatedLyrics.length > MODEL_CONFIG.constraints.lyrics.max) {
        generatedLyrics = generatedLyrics.substring(0, MODEL_CONFIG.constraints.lyrics.max)
      }
      
      // Validate format
      if (validateLyrics(generatedLyrics)) {
        console.log(`✅ [LYRICS] Valid format on attempt ${lyricsAttempts}`)
        break
      } else {
        console.log(`⚠️ [LYRICS] Invalid format on attempt ${lyricsAttempts}: missing Verse/Chorus or wrong length`)
        if (lyricsAttempts >= maxLyricsAttempts) {
          // Force format by wrapping in verse/chorus if missing
          if (!generatedLyrics.includes('[Verse]')) {
            generatedLyrics = `[Verse]\n${generatedLyrics}`
          }
          if (!generatedLyrics.includes('[Chorus]') && generatedLyrics.length > 200) {
            // Insert chorus in the middle
            const midPoint = Math.floor(generatedLyrics.length / 2)
            generatedLyrics = generatedLyrics.slice(0, midPoint) + '\n\n[Chorus]\n' + generatedLyrics.slice(midPoint)
          }
        }
      }
    }

    // Generate matching style based on the topic and mood
    console.log(`🎨 [STYLE] Generating style for: "${topic}"`)
    
    const stylePrompt = `Describe the music style for a song about "${topic}"${mood ? ` with ${mood} mood` : ''}.

Format: Genre, mood, key instruments/vibe (10-100 characters)
Examples:
- "Upbeat indie pop, energetic, synth guitars, summer vibes"
- "Melancholic acoustic folk, gentle guitar, rainy atmosphere"
- "Electronic dance, high energy, pulsing beats, club ready"

Style:`

    const styleOutput = await replicate.run("meta/meta-llama-3-8b-instruct", {
      input: {
        prompt: stylePrompt,
        max_tokens: 100,
        temperature: 0.6,
        system_prompt: "You are a music style expert. You describe music styles in a short, specific format. Never use quotes or introductions. Just output the style description directly."
      }
    }) as any

    let generatedStyle = cleanLlmOutput(styleOutput)
    
    // Ensure style fits constraints
    if (generatedStyle.length > MODEL_CONFIG.constraints.prompt.max) {
      generatedStyle = generatedStyle.substring(0, MODEL_CONFIG.constraints.prompt.max)
    }
    
    // Fallback if style is too short
    if (generatedStyle.length < MODEL_CONFIG.constraints.prompt.min) {
      generatedStyle = `${mood || 'Upbeat'} ${topic.split(' ').slice(0, 3).join(' ')} style music`
    }

    // Generate song name based on lyrics
    console.log(`🎵 [NAME] Generating name from lyrics...`)
    
    const namePrompt = `Generate a catchy song title (2-6 words) based on these lyrics.

Lyrics:
${generatedLyrics.substring(0, 500)}

Title:`

    const nameOutput = await replicate.run("meta/meta-llama-3-8b-instruct", {
      input: {
        prompt: namePrompt,
        max_tokens: 30,
        temperature: 0.8,
        system_prompt: "You are a songwriting assistant. You create catchy song titles. Never use quotes or introductions. Just output the title directly."
      }
    }) as any

    let generatedName = cleanLlmOutput(nameOutput)
    
    // Fallback if name is too short or empty
    if (generatedName.length < 2) {
      generatedName = topic.split(' ').slice(0, 4).join(' ')
    }
    
    // Limit length
    if (generatedName.length > 60) {
      generatedName = generatedName.substring(0, 60)
    }

    console.log(`✅ [LYRICS] Generated ${generatedLyrics.length} characters`)
    console.log(`✅ [STYLE] Generated: "${generatedStyle}"`)
    console.log(`✅ [NAME] Generated: "${generatedName}"`)

    return c.json({
      success: true,
      lyrics: generatedLyrics,
      style: generatedStyle,
      name: generatedName
    })
  } catch (error: any) {
    console.error(`❌ [LYRICS] Generation error:`, error.message)
    return c.json({ error: 'Failed to generate lyrics', details: error.message }, 500)
  }
})

// List user's generations (MUST come before /:id route!)
app.get('/', async (c) => {
  const auth = getAuth(c)
  if (!auth?.userId) return c.json({ error: 'Unauthorized' }, 401)

  const generations = db.prepare(`
    SELECT id, lyrics, prompt, name, audioUrl, r2Key, status, favorite, createdAt 
    FROM generations 
    WHERE clerkUserId = ? 
    ORDER BY createdAt DESC
  `).all(auth.userId) as any[]

  // Generate signed URLs for each generation
  const transformedGenerations = await Promise.all(
    generations.map(async (gen) => {
      let audioUrl = gen.audioUrl
      
      // If we have an R2 key, generate a signed URL
      if (gen.r2Key) {
        try {
          const filename = gen.name?.trim() || gen.prompt
          audioUrl = await getSignedAudioUrl(gen.r2Key, 3600, filename) // 1 hour
        } catch (err) {
          console.error(`Failed to generate signed URL for ${gen.id}:`, err)
          // Fall back to original URL
          audioUrl = gen.audioUrl
        }
      }
      
      return {
        ...gen,
        audioUrl,
        r2Key: undefined // Don't expose the key
      }
    })
  )

  console.log(`📚 [LIBRARY] Returning ${transformedGenerations.length} generations for user: ${auth.userId.substring(0, 8)}...`)

  return c.json({ generations: transformedGenerations })
})

// Get generation by ID
app.get('/:id', async (c) => {
  const auth = getAuth(c)
  if (!auth?.userId) return c.json({ error: 'Unauthorized' }, 401)

  const id = c.req.param('id')
  const generation = db.prepare(`
    SELECT * FROM generations WHERE id = ? AND clerkUserId = ?
  `).get(id, auth.userId) as any

  if (!generation) {
    return c.json({ error: 'Generation not found' }, 404)
  }

  // Generate signed URL if R2 key exists
  let audioUrl = generation.audioUrl
  if (generation.r2Key) {
    try {
      const filename = generation.name?.trim() || generation.prompt
      audioUrl = await getSignedAudioUrl(generation.r2Key, 3600, filename) // 1 hour
    } catch (err) {
      console.error(`Failed to generate signed URL for ${id}:`, err)
      // Fall back to original URL
      audioUrl = generation.audioUrl
    }
  }

  return c.json({
    ...generation,
    audioUrl,
    r2Key: undefined, // Don't expose the key
    r2Url: undefined  // Don't expose internal URLs
  })
})

// Delete generation
app.delete('/:id', async (c) => {
  const auth = getAuth(c)
  if (!auth?.userId) return c.json({ error: 'Unauthorized' }, 401)

  const id = c.req.param('id')
  
  // Get the generation to find the R2 key
  const generation = db.prepare(`
    SELECT * FROM generations WHERE id = ? AND clerkUserId = ?
  `).get(id, auth.userId) as any

  if (!generation) {
    return c.json({ error: 'Generation not found' }, 404)
  }

  // Delete from R2 if we have a key
  if (generation.r2Key) {
    try {
      await deleteAudioFromR2(generation.r2Key)
    } catch (err) {
      console.error(`Failed to delete from R2 for generation ${id}:`, err)
      // Continue anyway - we still want to delete from database
    }
  }

  // Delete from database
  db.prepare('DELETE FROM generations WHERE id = ? AND clerkUserId = ?')
    .run(id, auth.userId)

  console.log(`🗑️ Deleted generation ${id} for user: ${auth.userId.substring(0, 8)}...`)

  return c.json({ success: true, message: 'Generation deleted' })
})

// Update generation name
app.patch('/:id/name', async (c) => {
  const auth = getAuth(c)
  if (!auth?.userId) return c.json({ error: 'Unauthorized' }, 401)

  const id = c.req.param('id')
  const { name } = await c.req.json()
  
  if (!name || typeof name !== 'string') {
    return c.json({ error: 'Name is required' }, 400)
  }

  const trimmedName = name.trim().substring(0, 60)
  
  const result = db.prepare(`
    UPDATE generations SET name = ? WHERE id = ? AND clerkUserId = ?
  `).run(trimmedName, id, auth.userId)

  if (result.changes === 0) {
    return c.json({ error: 'Generation not found' }, 404)
  }

  console.log(`✏️ Updated name for generation ${id}: "${trimmedName}"`)

  return c.json({ success: true, name: trimmedName })
})

// Toggle favorite status
app.patch('/:id/favorite', async (c) => {
  const auth = getAuth(c)
  if (!auth?.userId) return c.json({ error: 'Unauthorized' }, 401)

  const id = c.req.param('id')
  
  // Get current favorite status
  const generation = db.prepare(`
    SELECT favorite FROM generations WHERE id = ? AND clerkUserId = ?
  `).get(id, auth.userId) as any

  if (!generation) {
    return c.json({ error: 'Generation not found' }, 404)
  }

  const newStatus = generation.favorite ? 0 : 1
  
  const result = db.prepare(`
    UPDATE generations SET favorite = ? WHERE id = ? AND clerkUserId = ?
  `).run(newStatus, id, auth.userId)

  console.log(`${newStatus ? '⭐' : '☆'} ${newStatus ? 'Added' : 'Removed'} favorite for generation ${id}`)

  return c.json({ success: true, favorite: newStatus === 1 })
})

export default app
