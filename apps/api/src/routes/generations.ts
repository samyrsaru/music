import { Hono } from 'hono'
import { getAuth } from '@hono/clerk-auth'
import Replicate from 'replicate'
import db from '../lib/db.js'
import { uploadAudioToR2, downloadAudioFromUrl, getSignedAudioUrl, deleteAudioFromR2 } from '../lib/r2.js'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN!,
})

const app = new Hono()

// Model configuration - centralized constraints
const MODEL_CONFIG = {
  id: 'minimax/music-1.5',
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

// Generate music
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

  const user = db.prepare('SELECT credits FROM users WHERE clerkUserId = ?')
    .get(auth.userId) as any

  if (!user || user.credits < 1) {
    return c.json({ error: 'Insufficient credits' }, 402)
  }

  db.prepare('UPDATE users SET credits = credits - 1 WHERE clerkUserId = ?')
    .run(auth.userId)

  console.log(`🎵 [START] Generation started for user: ${auth.userId.substring(0, 8)}...`)
  console.log(`   Lyrics: ${lyrics.substring(0, 50)}...`)
  console.log(`   Prompt: ${prompt || 'pop music'}`)

  try {
    const generationId = crypto.randomUUID()
    const input = {
      lyrics: lyrics,
      prompt: prompt || 'pop music'
    }
    
    const output = await replicate.run("minimax/music-1.5", { input }) as any

    console.log(`📤 [RAW OUTPUT] Replicate returned:`, typeof output, JSON.stringify(output, null, 2))

    // Handle different output formats
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
        // Try to find any URL-like string in the object
        const values = Object.values(output)
        const urlValue = values.find(v => typeof v === 'string' && (v.startsWith('http://') || v.startsWith('https://')))
        if (urlValue) audioUrl = urlValue as string
      }
    }

    // Ensure audioUrl is a string
    if (audioUrl && typeof audioUrl !== 'string') {
      audioUrl = String(audioUrl)
    }

    if (!audioUrl || typeof audioUrl !== 'string') {
      console.error(`❌ [FAILED] No audio URL found in output:`, output)
      throw new Error('No audio URL in response')
    }

    console.log(`✅ [SUCCESS] Generation completed! URL: ${audioUrl.substring(0, 60)}...`)

    // Upload to R2 for permanent storage
    let r2Key: string | null = null
    try {
      console.log(`⬇️ Downloading audio for R2 upload...`)
      const audioBuffer = await downloadAudioFromUrl(audioUrl)
      const key = `audio/${auth.userId}/${generationId}.mp3`
      
      console.log(`⬆️ Uploading audio to R2...`)
      r2Key = await uploadAudioToR2(audioBuffer, key)
      console.log(`✅ Uploaded to R2: ${r2Key}`)
    } catch (r2Error) {
      console.error('R2 upload failed:', r2Error)
      // Continue without R2 - we'll use the Replicate URL
    }

    // Store generation in database
    db.prepare(`
      INSERT INTO generations (id, clerkUserId, lyrics, prompt, audioUrl, r2Key, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(generationId, auth.userId, lyrics, prompt || 'pop music', audioUrl, r2Key)

    console.log(`💾 [SAVED] Generation stored with ID: ${generationId}`)

    // Generate signed URL for immediate playback
    let signedUrl = audioUrl
    if (r2Key) {
      try {
        signedUrl = await getSignedAudioUrl(r2Key, 3600) // 1 hour
      } catch (err) {
        console.error('Failed to generate signed URL:', err)
      }
    }

    return c.json({
      success: true,
      generationId,
      status: 'completed',
      audioUrl: signedUrl,
      creditsRemaining: user.credits - 1
    })
  } catch (error: any) {
    console.error(`❌ [FAILED] Generation error:`, error.message)
    db.prepare('UPDATE users SET credits = credits + 1 WHERE clerkUserId = ?')
      .run(auth.userId)
    return c.json({ error: 'Generation failed', details: error.message }, 500)
  }
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
    
    const prompt = `Write song lyrics about: ${topic}${mood ? ` with a ${mood} mood` : ''}. 
Format with [Verse], [Chorus], [Bridge] sections. 
Keep it between ${MODEL_CONFIG.constraints.lyrics.min} and ${MODEL_CONFIG.constraints.lyrics.max} characters.
Make it creative and rhyming.`

    const output = await replicate.run("meta/meta-llama-3-8b-instruct", {
      input: {
        prompt: prompt,
        max_tokens: 800,
        temperature: 0.8
      }
    }) as any

    let generatedLyrics: string
    
    if (typeof output === 'string') {
      generatedLyrics = output
    } else if (Array.isArray(output) && output.length > 0) {
      generatedLyrics = output.join('')
    } else if (output && typeof output === 'object') {
      generatedLyrics = output.output || output.text || JSON.stringify(output)
    } else {
      generatedLyrics = String(output)
    }

    // Clean up the response
    generatedLyrics = generatedLyrics.trim()
    
    // Ensure it fits constraints
    if (generatedLyrics.length > MODEL_CONFIG.constraints.lyrics.max) {
      generatedLyrics = generatedLyrics.substring(0, MODEL_CONFIG.constraints.lyrics.max)
    }

    console.log(`✅ [LYRICS] Generated ${generatedLyrics.length} characters`)

    return c.json({
      success: true,
      lyrics: generatedLyrics
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
    SELECT id, lyrics, prompt, audioUrl, r2Key, createdAt 
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

export default app
