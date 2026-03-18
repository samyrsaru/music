import { Hono } from 'hono'
import { getAuth } from '@hono/clerk-auth'
import Replicate from 'replicate'
import db from '../lib/db.js'
import { uploadAudioToR2, downloadAudioFromUrl, getSignedAudioUrl, deleteAudioFromR2 } from '../lib/r2.js'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN!,
})

const app = new Hono()

// Model configurations - centralized constraints and pricing
const AVAILABLE_MODELS = [
  {
    id: 'minimax/music-1.5',
    cost: 10,
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
  },
  {
    id: 'minimax/music-2.5',
    cost: 50,
    constraints: {
      lyrics: {
        min: 1,
        max: 3500,
      },
      prompt: {
        min: 0,
        max: 2000,
      }
    }
  }
]

// Default model for backwards compatibility
const DEFAULT_MODEL = 'minimax/music-1.5'

// Helper to get model config by ID
function getModelConfig(modelId: string) {
  return AVAILABLE_MODELS.find(m => m.id === modelId) || AVAILABLE_MODELS[0]
}

// Helper function to clean LLM output
function cleanLlmOutput(output: any, preserveNewlines: boolean = false): string {
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
  text = text.replace(/^("|')|("|')$/g, '').trim()
  text = text.replace(/^(the style is|style:|here is|here are)[\s\w]*?:?\s*/i, '')
  text = text.replace(/^(title[:\-]?\s*)/i, '')
  text = text.replace(/^\[?INST\]?\s*/i, '')
  text = text.replace(/\s*\[\/INST\]\s*$/i, '')
  // Remove explanatory prefixes
  text = text.replace(/^(note:?\s*this[^.]*\.\s*)/i, '')
  text = text.replace(/^(this style description is for[^.]*\.\s*)/i, '')
  text = text.replace(/^(description:?\s*)/i, '')
  text = text.replace(/^(the music style is[^.]*\.\s*)/i, '')
  
  // Only remove newlines for titles/single-line outputs
  if (!preserveNewlines) {
    text = text.replace(/\n/g, ' ').trim()
  }
  
  return text
}

// Helper function to check if a title looks valid
function isValidTitle(title: string): boolean {
  if (!title || title.length < 2) {
    console.log(`🎵 [NAME] Invalid: too short (${title?.length || 0} chars)`)
    return false
  }
  if (title.length > 100) {
    console.log(`🎵 [NAME] Invalid: too long (${title.length} chars)`)
    return false
  }
  // Check if it contains section markers (shouldn't be in a title)
  if (/\[(Verse|Chorus|Bridge|Intro|Outro|Hook|Drop|Pre Chorus|Post Chorus|Build Up|Interlude|Break|Transition|Solo|Inst)\]/i.test(title)) {
    console.log(`🎵 [NAME] Invalid: contains section markers`)
    return false
  }
  // Check if it's just common words
  const lowercase = title.toLowerCase().trim()
  if (['the', 'a', 'an', 'song', 'track', 'title', 'music'].includes(lowercase)) {
    console.log(`🎵 [NAME] Invalid: common word only`)
    return false
  }
  return true
}

// Helper function to validate lyrics format with model-specific constraints
function validateLyrics(lyrics: string, modelId: string = DEFAULT_MODEL): boolean {
  const model = getModelConfig(modelId)
  const isAdvancedModel = modelId === 'minimax/music-2.5'
  
  // For advanced models, accept any valid section tag
  if (isAdvancedModel) {
    const hasSection = /\[(Verse|Chorus|Intro|Outro|Bridge|Hook|Drop|Solo|Inst|Build Up|Pre Chorus|Post Chorus|Interlude|Break|Transition)\]/i.test(lyrics)
    const length = lyrics.length
    return hasSection && length >= model.constraints.lyrics.min && length <= model.constraints.lyrics.max
  }
  
  // For basic models, strongly prefer Verse AND Chorus structure
  const hasVerse = /\[Verse\]/i.test(lyrics)
  const hasChorus = /\[Chorus\]/i.test(lyrics)
  const length = lyrics.length
  
  // Require Chorus for better structure (prompt asks for Verse-Chorus-Verse-Chorus)
  const hasBasicStructure = hasChorus || (hasVerse && length < 300)
  
  return hasBasicStructure && length >= model.constraints.lyrics.min && length <= model.constraints.lyrics.max
}

// Get available models configuration
app.get('/config', (c) => {
  return c.json({ models: AVAILABLE_MODELS, defaultModel: DEFAULT_MODEL })
})

// Generate music - Async with webhook
app.post('/generate', async (c) => {
  const auth = getAuth(c)
  if (!auth?.userId) return c.json({ error: 'Unauthorized' }, 401)

  const { lyrics, prompt, originalIdea, model: modelId } = await c.req.json()
  
  // Get model configuration
  const modelConfig = getModelConfig(modelId || DEFAULT_MODEL)
  
  // Server-side validation using model constraints
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

  const user = db.prepare('SELECT credits, lifetime_credits FROM users WHERE clerkUserId = ?')
    .get(auth.userId) as any

  const songCost = modelConfig.cost
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

  // Generate song title from lyrics
  console.log(`🎵 [NAME] Generating title from lyrics...`)
  let generatedName = ''
  let nameAttempts = 0
  const maxNameAttempts = 2
  
  while (nameAttempts < maxNameAttempts) {
    nameAttempts++
    console.log(`🎵 [NAME] Attempt ${nameAttempts}/${maxNameAttempts}`)
    
    const namePrompt = `Create a catchy song title (2-6 words) based on these lyrics.

Lyrics:
${lyrics.substring(0, 500)}

Examples of good titles:
- "Summer Nights"
- "Lost in Your Eyes" 
- "Electric Dreams"
- "Rainy Day Blues"

Respond with only the title text, nothing else.`

    try {
      const nameOutput = await replicate.run("meta/meta-llama-3-8b-instruct", {
        input: {
          prompt: namePrompt,
          max_tokens: 30,
          temperature: 0.8,
          system_prompt: "You are a songwriting assistant. Create catchy song titles. Output only the title text, no quotes, no explanations, no labels."
        }
      }) as any

      generatedName = cleanLlmOutput(nameOutput)
      
      // Limit length
      if (generatedName.length > 60) {
        generatedName = generatedName.substring(0, 60)
      }
      
      // Check if valid
      if (isValidTitle(generatedName)) {
        console.log(`✅ [NAME] Valid title: "${generatedName}"`)
        break
      } else {
        console.log(`⚠️ [NAME] Invalid title attempt ${nameAttempts}: "${generatedName}"`)
      }
    } catch (titleError) {
      console.error(`❌ [NAME] Title generation error on attempt ${nameAttempts}:`, titleError)
    }
  }
  
  // Fallback if title generation failed
  if (!isValidTitle(generatedName)) {
    generatedName = prompt?.split(' ').slice(0, 4).join(' ') || 'My Song'
    console.log(`✅ [NAME] Fallback title: "${generatedName}"`)
  }

  try {
    // Create pending generation record
    db.prepare(`
      INSERT INTO generations (id, clerkUserId, lyrics, prompt, name, originalIdea, status, model, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now'))
    `).run(generationId, auth.userId, lyrics, prompt || 'pop music', generatedName, originalIdea || null, modelConfig.id)

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
      : `${process.env.REPLICATE_WEBHOOK_URL || c.req.url.replace('/api/generations/generate', '')}/api/webhooks/replicate`

    console.log(`🔗 [WEBHOOK] Webhook URL: ${webhookUrl}`)

    // Start the prediction asynchronously with webhook using the selected model
    const prediction = await replicate.predictions.create({
      model: modelConfig.id,
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

// Get generation status (for polling)
app.get('/status/:id', async (c) => {
  const auth = getAuth(c)
  if (!auth?.userId) return c.json({ error: 'Unauthorized' }, 401)

  const id = c.req.param('id')
  
  const generation = db.prepare(`
    SELECT id, status, audioUrl, r2Key, lyrics, prompt, name, model, createdAt, completedAt, replicateId
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
    model: generation.model,
    createdAt: generation.createdAt,
    completedAt: generation.completedAt,
    replicateId: generation.replicateId
  })
})

// Generate lyrics helper
app.post('/lyrics', async (c) => {
  const auth = getAuth(c)
  if (!auth?.userId) return c.json({ error: 'Unauthorized' }, 401)

  const { topic, model: modelId } = await c.req.json()
  
  if (!topic?.trim()) {
    return c.json({ error: 'Topic is required' }, 400)
  }

  // Get model configuration for constraints
  const modelConfig = getModelConfig(modelId || DEFAULT_MODEL)
  const maxLength = modelConfig.constraints.lyrics.max
  const minLength = modelConfig.constraints.lyrics.min

  try {
    console.log(`🎤 [LYRICS] Generating lyrics for user: ${auth.userId.substring(0, 8)}...`)
    
    // Generate lyrics with model-specific section tags
    const isAdvancedModel = modelConfig.id === 'minimax/music-2.5'
    
    const sectionTags = isAdvancedModel 
      ? `[Intro], [Verse], [Pre Chorus], [Chorus], [Post Chorus], [Hook], [Drop], [Bridge], [Build Up], [Interlude], [Break], [Transition], [Outro]`
      : `[Intro], [Verse], [Chorus], [Bridge], [Outro]`
    
    const sectionInstructions = isAdvancedModel
      ? `Use section tags to control song structure: ${sectionTags}
- IMPORTANT: Use exact tag format like [Verse], [Chorus], [Bridge] - NEVER use [Verse 1], [Verse 2], etc. No numbers after tags!
- ONLY these section tags are valid: ${sectionTags}
- NEVER use: [End], [Finish], [Start], or any other tags not in the list above
- Recommended structure: [Verse], [Chorus], [Verse], [Chorus], [Bridge], [Chorus] as base
- [Outro] should be the LAST section - NEVER put [Verse] or [Chorus] after [Outro]
- Optional: Add [Intro], [Outro], [Pre Chorus], [Post Chorus], [Build Up], [Drop] for EDM
- Use [Break], [Transition] for dynamic changes
- Include backing vocals and ad-libs only when it makes sense for the song - not every song needs them. Use sparingly, not on every line
- Parentheses are ONLY for backing vocals - never for instruments or emotional cues
- Backing vocals (in [Verse], [Chorus], [Bridge], etc.): sung phrases and sounds
  Examples: (ooh yeah), (whoa-oh-oh), (la la la hey), (mmm mmm), (ah ah)
- DO NOT write emotional delivery cues like (romantic), (sad), (angry) - MiniMax sings these as lyrics
- DO NOT write scene descriptions: (Soft spray of water), (Wind building), (Water sounds), (Traffic noise)
- NEVER put multiple parenthetical groups on the same line`
      : `REQUIRED STRUCTURE: You MUST include both [Verse] AND [Chorus] sections. Use these tags: [Intro], [Verse], [Chorus], [Bridge], [Outro].
- Format example:
[Intro]
Line one here
Line two here

[Verse]
First line here
Second line here
Third line here

[Chorus]
First chorus line
Second chorus line
Third chorus line

[Bridge]
Bridge lines here

[Outro]
Line one here
Line two here`
    
    const lyricsPrompt = `Write song lyrics based on this concept: ${topic}.

Requirements:
${sectionInstructions}
- Target length: ${Math.min(maxLength, maxLength - 100)}-${maxLength} characters
- Maximum: ${maxLength} characters - do not exceed this
- Prefer 2-4 substantial sections over many short ones
- Each section: 6-10 lines with meaningful content
- Rhyme scheme: AABB or ABAB (do NOT write the letters like (A) or (B) in the lyrics)
- Start immediately with [Verse] or [Intro], no explanations

Write substantial, complete lyrics. Make each section full and meaningful. Stay within the ${maxLength} character limit.

Begin:`

    let generatedLyrics: string = ''
    let lyricsAttempts = 0
    const maxLyricsAttempts = 2
    
    while (lyricsAttempts < maxLyricsAttempts) {
      lyricsAttempts++
      console.log(`🎤 [LYRICS] Attempt ${lyricsAttempts}/${maxLyricsAttempts}`)
      
      const lyricsOutput = await replicate.run("openai/gpt-5-nano", {
        input: {
          prompt: lyricsPrompt,
          max_tokens: 800,
          temperature: 0.6,
          system_prompt: "You are a songwriting assistant. You write only song lyrics, nothing else. Never include introductions, explanations, or metadata. Just output the lyrics directly."
        }
      }) as any
      
      generatedLyrics = cleanLlmOutput(lyricsOutput, true)
      
      // Log lyrics after basic cleanup but before our modifications
      console.log(`📝 [LYRICS FROM REPLICATE] Attempt ${lyricsAttempts}:\n---\n${generatedLyrics}\n---`)
      
      // Clean up numbered section tags - replace [Verse 1], [Verse 2], etc. with just [Verse]
      generatedLyrics = generatedLyrics.replace(/\[Verse\s+\d+\]/gi, '[Verse]')
      generatedLyrics = generatedLyrics.replace(/\[Chorus\s+\d+\]/gi, '[Chorus]')
      generatedLyrics = generatedLyrics.replace(/\[Bridge\s+\d+\]/gi, '[Bridge]')
      
      
      // Remove trailing rhyme scheme annotations like (A), (B), (C), etc. at end of lines
      generatedLyrics = generatedLyrics.replace(/\s*\([A-Z]\)\s*$/gm, '')
      generatedLyrics = generatedLyrics.replace(/\s*\([A-Z]\)\s*(?=\n)/g, '')
      generatedLyrics = generatedLyrics.replace(/\s*\([A-Z]\)\s*$/g, '')
      
      // Remove parenthetical vocal delivery directions only - keep backing vocals
      generatedLyrics = generatedLyrics.replace(/\s*\((softly|whispered|belted|powerful)\)\s*/gi, '')
      
      // Remove "(Backing vocals)" and "(Ad-libs)" labels - the content should be directly in parentheses
      generatedLyrics = generatedLyrics.replace(/\(Backing vocals\)\s*/gi, '')
      generatedLyrics = generatedLyrics.replace(/\(Ad-libs?\)\s*/gi, '')
      
      // Remove descriptive labels that are not actual sung sounds
      generatedLyrics = generatedLyrics.replace(/\s*\((soft vocals|whispered delivery|belted vocals|powerful vocals|backing vocals rise|ad-libs float|harmonies|backing vocals)\)\s*/gi, '')
      
      // Remove production/instrumental cues that should not be sung: strings building, beat drops, etc.
      generatedLyrics = generatedLyrics.replace(/^[\s]*\(?strings building\)?[\s]*$/gim, '')
      generatedLyrics = generatedLyrics.replace(/^[\s]*\(?beat drops?\)?[\s]*$/gim, '')
      generatedLyrics = generatedLyrics.replace(/^[\s]*\(?guitar (enters?|solo)\)?[\s]*$/gim, '')
      generatedLyrics = generatedLyrics.replace(/^[\s]*\(?drums (kick in|enter)\)?[\s]*$/gim, '')
      
      // Remove obvious non-lyrical scene descriptions (engine sounds, wind, etc.)
      // Only removes standalone parentheticals that are clearly scene sounds, not lyrics
      generatedLyrics = generatedLyrics.replace(/^\s*\((?:engine|wind|water|traffic|ocean|waves|rain|thunder)\s+(?:sound|noise|building|swelling)\)\s*$/gim, '')
      
      // Split multiple parenthetical groups on the same line into separate lines
      // e.g., "(la la la hey) (mmm mmm) (ooh ooh)" becomes separate lines
      generatedLyrics = generatedLyrics.replace(/^\s*\([^)]+\)\s+\([^)]+\).*$/gim, (match) => {
        const matches = match.match(/\([^)]+\)/g)
        return matches ? matches.join('\n') : match
      })
      
      // Clean up excessive empty lines (3+ newlines -> 2 newlines)
      generatedLyrics = generatedLyrics.replace(/\n\n\n+/g, '\n\n')
      
      // Minimal cleanup - only remove obviously invalid tags like [End]
      generatedLyrics = generatedLyrics.replace(/\[End\]/gi, '')
      
      // Ensure it fits constraints - truncate at last complete section if too long
      if (generatedLyrics.length > maxLength) {
        // Find the last section marker before the limit
        const truncated = generatedLyrics.substring(0, maxLength)
        const sectionMarkers = isAdvancedModel
          ? ['[Verse]', '[Chorus]', '[Bridge]', '[Intro]', '[Outro]', '[Hook]', '[Drop]', '[Pre Chorus]', '[Post Chorus]', '[Build Up]', '[Interlude]', '[Break]', '[Transition]']
          : ['[Verse]', '[Chorus]', '[Bridge]', '[Intro]', '[Outro]']
        
        let lastSection = 0
        for (const marker of sectionMarkers) {
          const pos = truncated.lastIndexOf(marker)
          if (pos > lastSection) {
            lastSection = pos
          }
        }
        
        if (lastSection > 0) {
          // Keep everything up to the last complete section
          generatedLyrics = truncated.substring(0, lastSection).trim()
          console.log(`✂️ [LYRICS] Truncated at section boundary, new length: ${generatedLyrics.length}`)
        } else {
          // No section marker found, just truncate
          generatedLyrics = truncated
        }
      }
      
      // Validate format
      if (validateLyrics(generatedLyrics, modelConfig.id)) {
        console.log(`✅ [LYRICS] Valid format on attempt ${lyricsAttempts}`)
        break
      } else {
        console.log(`⚠️ [LYRICS] Invalid format on attempt ${lyricsAttempts}: missing required sections or wrong length`)
        if (lyricsAttempts >= maxLyricsAttempts) {
          // Check if any section tags exist (for advanced models, any tag is acceptable)
          const hasAnySection = isAdvancedModel
            ? /\[(Verse|Chorus|Intro|Outro|Bridge|Hook|Drop|Pre Chorus|Post Chorus|Build Up|Interlude|Break|Transition|Solo|Inst)\]/i.test(generatedLyrics)
            : /\[(Intro|Verse|Chorus|Bridge|Outro)\]/i.test(generatedLyrics)
          
          if (!hasAnySection) {
            // Force format by wrapping in verse if no sections at all
            generatedLyrics = `[Verse]\n${generatedLyrics}`
          }
          
          // Ensure we don't exceed max length after adding section tags
          if (generatedLyrics.length > maxLength) {
            generatedLyrics = generatedLyrics.substring(0, maxLength).trim()
            console.log(`✂️ [LYRICS] Hard truncated to ${maxLength} chars after adding section tags`)
          }
        }
      }
    }

    // Log completion
    console.log(`🎤 [LYRICS] Generation complete for user: ${auth.userId.substring(0, 8)}... (${generatedLyrics.length} chars)`)

    // Generate matching style based on the topic
    console.log(`🎨 [STYLE] Generating style for user: ${auth.userId.substring(0, 8)}...`)
    
    const stylePrompt = `Create a detailed music style description for a song based on this concept: "${topic}".

Follow this structure: [Genre], [Mood/Emotion], [Vocal style], [Tempo], [Key instruments], [Era/Style reference], [Production style]

Guidelines:
- Genre: Choose a specific genre (Pop, Indie folk, Jazz, Blues, EDM, Hip-hop, Rock, Classical, Country, R&B, etc.)
- Mood: Describe the emotional tone (melancholic, uplifting, aggressive, dreamy, hopeful, introspective, confident)
- Vocal style: Specify gender and delivery (male vocals, female vocals, breathy, powerful, soulful, clear, operatic, raspy)
- Tempo: Include specific BPM or tempo description (slow, 80 BPM, driving 125 BPM, uptempo)
- Instruments: Name specific instruments from these categories for best results:
  - Strings: acoustic guitar, electric guitar (clean/distorted), bass guitar, upright bass, violin, cello, orchestral strings
  - Keys: piano, electric piano, synth pads, organ, harpsichord
  - Brass & Woodwinds: trumpet, muted trumpet, trombone, saxophone, flute, clarinet, brass section
  - Drums & Percussion: drum kit, brushed drums, electronic drums, 808 bass, hi-hats, claps
  - Electronic: synth bass, lead synths, atmospheric pads, arpeggiated synths, risers, sweeps
- Era/Style: Add references if relevant (1980s Minneapolis sound, vintage vinyl, classic Motown, 90s grunge)
- Production: Mention sonic qualities (lo-fi, warm reverb, wide soundstage, intimate, distorted, crisp)

Examples:
- "Indie folk, melancholic introspective longing, soft breathy female vocals, slow relaxed pace, fingerpicked acoustic guitar and gentle piano, coffee shop vibes, warm reverb with vinyl texture"
- "Soulful Blues, melancholy rainy night atmosphere, powerful male vocals with grit, slow 70 BPM tempo, electric guitar with wah pedal and walking bass, classic 1960s Chicago blues, warm tube saturation"
- "Pop-Dance Progressive House, uplifting anthemic euphoric, bright female vocal with Auto-Tune, driving 125 BPM, four-on-the-floor kick with synth bass and atmospheric pads, modern club production, wide soundstage"
- "Lo-fi hip-hop, chill study vibes dreamy, soft spoken male vocals, relaxed 75 BPM, Rhodes piano and vinyl crackle with laid-back drums, nostalgic 90s boom-bap aesthetic, warm midrange and tape saturation"

Style description:`

    const styleOutput = await replicate.run("meta/meta-llama-3-8b-instruct", {
      input: {
        prompt: stylePrompt,
        max_tokens: 200,
        temperature: 0.7,
        system_prompt: "You are a music style description generator. Output ONLY the style description text. Never start with phrases like 'Note:', 'This style', 'Description:', or any introductory text. Never include explanations. Output the description directly as plain text with no quotes."
      }
    }) as any

    let generatedStyle = cleanLlmOutput(styleOutput)
    
    // Ensure style fits constraints
    if (generatedStyle.length > modelConfig.constraints.prompt.max) {
      generatedStyle = generatedStyle.substring(0, modelConfig.constraints.prompt.max)
    }
    
    // Fallback if style is too short
    if (generatedStyle.length < modelConfig.constraints.prompt.min) {
      generatedStyle = `Upbeat ${topic.split(' ').slice(0, 3).join(' ')} style music`
    }

    console.log(`✅ [LYRICS] Generated ${generatedLyrics.length} characters for user: ${auth.userId.substring(0, 8)}...`)
    console.log(`✅ [STYLE] Generated for user: ${auth.userId.substring(0, 8)}...`)

    return c.json({
      success: true,
      lyrics: generatedLyrics,
      style: generatedStyle
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

  // Get regular generations
  const generations = db.prepare(`
    SELECT id, lyrics, prompt, name, audioUrl, r2Key, status, favorite, model, createdAt 
    FROM generations 
    WHERE clerkUserId = ? 
    ORDER BY createdAt DESC
  `).all(auth.userId) as any[]

  // Get ephemeral (private) generations - exclude expired ones (> 1 hour old)
  const ephemeralGenerations = db.prepare(`
    SELECT id, audioUrl, model, createdAt, status
    FROM ephemeral_generations 
    WHERE clerkUserId = ? 
    AND createdAt > datetime('now', '-1 hour')
    ORDER BY createdAt DESC
  `).all(auth.userId) as any[]

  // Transform ephemeral generations to match the format
  const transformedEphemeral = ephemeralGenerations.map((gen) => {
    // Calculate expiration
    const createdAt = new Date(gen.createdAt)
    const expiresAt = new Date(createdAt.getTime() + 60 * 60 * 1000)
    const now = new Date()
    const isExpired = now > expiresAt
    
    return {
      id: gen.id,
      lyrics: '', // Not stored for ephemeral
      prompt: '', // Not stored for ephemeral
      name: 'Private Song',
      audioUrl: gen.audioUrl,
      r2Key: null,
      status: isExpired ? 'expired' : gen.status,
      favorite: 0,
      model: gen.model,
      createdAt: gen.createdAt,
      isEphemeral: true,
      expiresAt: expiresAt.toISOString()
    }
  }).filter((gen: any) => gen.status !== 'expired') // Filter out expired

  // Generate signed URLs for regular generations
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
        r2Key: undefined, // Don't expose the key
        isEphemeral: false
      }
    })
  )

  // Combine both lists
  const allGenerations = [...transformedGenerations, ...transformedEphemeral]
  
  // Sort by createdAt descending
  allGenerations.sort((a: any, b: any) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  console.log(`📚 [LIBRARY] Returning ${allGenerations.length} generations (${transformedGenerations.length} regular, ${transformedEphemeral.length} ephemeral) for user: ${auth.userId.substring(0, 8)}...`)

  return c.json({ generations: allGenerations })
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
