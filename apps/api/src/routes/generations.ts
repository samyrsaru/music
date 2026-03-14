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

// Get model configuration
app.get('/config', (c) => {
  return c.json(MODEL_CONFIG)
})

// Generate music - Async with webhook
app.post('/generate', async (c) => {
  const auth = getAuth(c)
  if (!auth?.userId) return c.json({ error: 'Unauthorized' }, 401)

  const { lyrics, prompt } = await c.req.json()
  
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

  const generationId = crypto.randomUUID()
  
  console.log(`🎵 [START] Generation started for user: ${auth.userId.substring(0, 8)}...`)
  console.log(`   Generation ID: ${generationId}`)
  console.log(`   Lyrics: ${lyrics.substring(0, 50)}...`)
  console.log(`   Prompt: ${prompt || 'pop music'}`)

  // Generate song name based on lyrics
  console.log(`🎵 [NAME] Generating name from lyrics...`)
  
  let generatedName: string
  
  try {
    const namePrompt = `[INST] Based on these song lyrics, generate a short, catchy song title (2-6 words).
The title should capture the essence of the song. Be creative but concise.
Examples: "Summer Nights", "Lost in You", "Electric Dreams", "Rainy Day Blues"

Lyrics:
${lyrics.substring(0, 500)}

STRICT: Return ONLY the title text. NO quotes. NO explanations. Just the title. [/INST]`

    const nameOutput = await replicate.run("meta/meta-llama-3-8b-instruct", {
      input: {
        prompt: namePrompt,
        max_tokens: 50,
        temperature: 0.8,
        system_prompt: "You are a songwriting assistant. You create catchy song titles. Never use quotes or introductions. Just output the title directly."
      }
    }) as any
    
    if (typeof nameOutput === 'string') {
      generatedName = nameOutput
    } else if (Array.isArray(nameOutput) && nameOutput.length > 0) {
      generatedName = nameOutput.join('')
    } else if (nameOutput && typeof nameOutput === 'object') {
      generatedName = nameOutput.output || nameOutput.text || String(nameOutput)
    } else {
      generatedName = String(nameOutput)
    }

    // Clean up the name
    generatedName = generatedName.trim()
    generatedName = generatedName.replace(/^(assistant|system|user)\s*[:\-]?\s*/i, '')
    generatedName = generatedName.replace(/^["']+|["']+$/g, '').trim()
    
    // Fallback if name is too short or empty
    if (generatedName.length < 2) {
      generatedName = prompt.split(' ').slice(0, 4).join(' ') || 'My Song'
    }
    
    // Limit length
    if (generatedName.length > 60) {
      generatedName = generatedName.substring(0, 60)
    }
    
    console.log(`✅ [NAME] Generated: "${generatedName}"`)
  } catch (nameError: any) {
    console.error(`❌ [NAME] Generation failed:`, nameError.message)
    generatedName = prompt.split(' ').slice(0, 4).join(' ') || 'My Song'
  }

  try {
    // Create pending generation record
    db.prepare(`
      INSERT INTO generations (id, clerkUserId, lyrics, prompt, name, status, createdAt)
      VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'))
    `).run(generationId, auth.userId, lyrics, prompt || 'pop music', generatedName)

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
      signedUrl = await getSignedAudioUrl(generation.r2Key, 3600) // 1 hour
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
    const lyricsPrompt = `[INST] Write song lyrics about: ${topic}${mood ? ` with a ${mood} mood` : ''}. 
Format with [Verse], [Chorus], [Bridge] sections. 
Keep it between ${MODEL_CONFIG.constraints.lyrics.min} and ${MODEL_CONFIG.constraints.lyrics.max} characters.
Make it creative and rhyming.

STRICT REQUIREMENTS:
- Return ONLY the lyrics text
- NO introductory phrases like "Here are lyrics" or "Sure, here is"
- NO explanations or notes
- Start directly with the content: either "[Verse]" or the first line of lyrics
- Do not include the word "assistant" or any role indicators [/INST]`

    const lyricsOutput = await replicate.run("meta/meta-llama-3-8b-instruct", {
      input: {
        prompt: lyricsPrompt,
        max_tokens: 800,
        temperature: 0.8,
        system_prompt: "You are a songwriting assistant. You write only song lyrics, nothing else. Never include introductions, explanations, or metadata. Just output the lyrics directly."
      }
    }) as any

    let generatedLyrics: string
    
    if (typeof lyricsOutput === 'string') {
      generatedLyrics = lyricsOutput
    } else if (Array.isArray(lyricsOutput) && lyricsOutput.length > 0) {
      generatedLyrics = lyricsOutput.join('')
    } else if (lyricsOutput && typeof lyricsOutput === 'object') {
      generatedLyrics = lyricsOutput.output || lyricsOutput.text || JSON.stringify(lyricsOutput)
    } else {
      generatedLyrics = String(lyricsOutput)
    }

    // Clean up the response - remove common prefixes
    generatedLyrics = generatedLyrics.trim()
    generatedLyrics = generatedLyrics.replace(/^(assistant|system|user)\s*[:\-]?\s*/i, '')
    generatedLyrics = generatedLyrics.replace(/^(here are|here is|sure,? here are|sure,? here is)[\s\w]*?:?\s*/i, '')
    generatedLyrics = generatedLyrics.replace(/^["']|["']$/g, '').trim()
    
    // Ensure it fits constraints
    if (generatedLyrics.length > MODEL_CONFIG.constraints.lyrics.max) {
      generatedLyrics = generatedLyrics.substring(0, MODEL_CONFIG.constraints.lyrics.max)
    }

    // Generate matching style based on the topic and mood
    console.log(`🎨 [STYLE] Generating style for: "${topic}"`)
    
    const stylePrompt = `[INST] Based on this song idea: "${topic}"${mood ? ` with a ${mood} mood` : ''}, 
generate a short music style description (10-100 characters) that would match the lyrics.
Include genre, mood, and any specific instruments or vibes. Be specific but concise.
Example: Jazz, romantic, smooth saxophone, dreamy atmosphere
Example: Upbeat pop, energetic, electronic synths, danceable
Example: Acoustic folk, melancholic, gentle guitar, rainy day vibes

STRICT: Return ONLY the style description text. NO quotes. NO introductions. Just the description. [/INST]`

    const styleOutput = await replicate.run("meta/meta-llama-3-8b-instruct", {
      input: {
        prompt: stylePrompt,
        max_tokens: 100,
        temperature: 0.7,
        system_prompt: "You are a music style expert. You describe music styles in a short, specific format. Never use quotes or introductions. Just output the style description directly."
      }
    }) as any

    let generatedStyle: string
    
    if (typeof styleOutput === 'string') {
      generatedStyle = styleOutput
    } else if (Array.isArray(styleOutput) && styleOutput.length > 0) {
      generatedStyle = styleOutput.join('')
    } else if (styleOutput && typeof styleOutput === 'object') {
      generatedStyle = styleOutput.output || styleOutput.text || String(styleOutput)
    } else {
      generatedStyle = String(styleOutput)
    }

    // Clean up the style - remove quotes, prefixes, etc.
    generatedStyle = generatedStyle.trim()
    generatedStyle = generatedStyle.replace(/^(assistant|system|user)\s*[:\-]?\s*/i, '')
    generatedStyle = generatedStyle.replace(/^(the style is|style:|here is|here are)[\s\w]*?:?\s*/i, '')
    generatedStyle = generatedStyle.replace(/^["']+|["']+$/g, '').trim()
    
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
    
    const namePrompt = `[INST] Based on these song lyrics, generate a short, catchy song title (2-6 words).
The title should capture the essence of the song. Be creative but concise.
Examples: "Summer Nights", "Lost in You", "Electric Dreams", "Rainy Day Blues"

Lyrics:
${generatedLyrics.substring(0, 500)}

STRICT: Return ONLY the title text. NO quotes. NO explanations. Just the title. [/INST]`

    const nameOutput = await replicate.run("meta/meta-llama-3-8b-instruct", {
      input: {
        prompt: namePrompt,
        max_tokens: 50,
        temperature: 0.8,
        system_prompt: "You are a songwriting assistant. You create catchy song titles. Never use quotes or introductions. Just output the title directly."
      }
    }) as any

    let generatedName: string
    
    if (typeof nameOutput === 'string') {
      generatedName = nameOutput
    } else if (Array.isArray(nameOutput) && nameOutput.length > 0) {
      generatedName = nameOutput.join('')
    } else if (nameOutput && typeof nameOutput === 'object') {
      generatedName = nameOutput.output || nameOutput.text || String(nameOutput)
    } else {
      generatedName = String(nameOutput)
    }

    // Clean up the name
    generatedName = generatedName.trim()
    generatedName = generatedName.replace(/^(assistant|system|user)\s*[:\-]?\s*/i, '')
    generatedName = generatedName.replace(/^["']+|["']+$/g, '').trim()
    
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
    SELECT id, lyrics, prompt, name, audioUrl, r2Key, status, createdAt 
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
          audioUrl = await getSignedAudioUrl(gen.r2Key, 3600) // 1 hour
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
      audioUrl = await getSignedAudioUrl(generation.r2Key, 3600) // 1 hour
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

export default app
