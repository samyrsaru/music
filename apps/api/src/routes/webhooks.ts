import { Hono } from 'hono'
import { Webhook } from 'svix'
import db from '../lib/db.js'
import { uploadAudioToR2, downloadAudioFromUrl } from '../lib/r2.js'

const app = new Hono()

// Replicate webhook - called when music generation completes
app.post('/replicate', async (c) => {
  const body = await c.req.json()
  
  try {
    const { id, status, output } = body
    
    if (status === 'succeeded') {
      // Find generation by replicate ID
      const generation = db.prepare('SELECT * FROM generations WHERE replicateId = ?')
        .get(id) as any
      
      if (generation) {
        // Get audio URL from Replicate output
        const audioUrl = Array.isArray(output) ? output[0] : output
        
        let r2Key: string | null = null
        
        // Try to download and upload to R2
        try {
          console.log(`⬇️ Downloading audio from Replicate for generation ${generation.id}...`)
          const audioBuffer = await downloadAudioFromUrl(audioUrl)
          
          // Create a unique key for this file
          const key = `audio/${generation.clerkUserId}/${generation.id}.mp3`
          
          console.log(`⬆️ Uploading audio to R2...`)
          r2Key = await uploadAudioToR2(audioBuffer, key)
          console.log(`✅ Uploaded to R2: ${r2Key}`)
        } catch (r2Error) {
          console.error('R2 upload failed:', r2Error)
          // Continue without R2 key - we'll fall back to Replicate URL
        }
        
        // Update with audio URL and R2 key
        db.prepare(`
          UPDATE generations 
          SET status = 'completed', audioUrl = ?, r2Key = ?, completedAt = datetime('now')
          WHERE replicateId = ?
        `).run(audioUrl, r2Key, id)
        
        console.log(`✅ Generation ${generation.id} completed: ${r2Key || audioUrl}`)
      }
    } else if (status === 'failed') {
      // Mark as failed and refund credit
      const generation = db.prepare('SELECT * FROM generations WHERE replicateId = ?')
        .get(id) as any
      
      if (generation) {
        db.prepare(`
          UPDATE generations SET status = 'failed' WHERE replicateId = ?
        `).run(id)
        
        // Refund credit
        db.prepare('UPDATE users SET credits = credits + 1 WHERE clerkUserId = ?')
          .run(generation.clerkUserId)
        
        console.log(`❌ Generation ${generation.id} failed, credit refunded`)
      }
    }
    
    return c.json({ received: true })
  } catch (err) {
    console.error('Replicate webhook error:', err)
    return c.json({ error: 'Webhook failed' }, 500)
  }
})

app.post('/polar', async (c) => {
  const payload = await c.req.text()
  const headers = c.req.header()
  
  const wh = new Webhook(process.env.POLAR_WEBHOOK_SECRET!)
  
  try {
    const event = wh.verify(payload, headers) as any
    
    if (event.type === 'subscription.active') {
      const sub = event.data
      const clerkUserId = sub.metadata?.clerkUserId
      
      if (clerkUserId) {
        // Insert or update user with 100 credits
        db.prepare(`
          INSERT INTO users (clerkUserId, credits, polarSubscriptionId, status, currentPeriodStart, currentPeriodEnd)
          VALUES (?, 100, ?, ?, ?, ?)
          ON CONFLICT(clerkUserId) DO UPDATE SET
            credits = 100,
            polarSubscriptionId = excluded.polarSubscriptionId,
            status = excluded.status,
            currentPeriodStart = excluded.currentPeriodStart,
            currentPeriodEnd = excluded.currentPeriodEnd
        `).run(
          clerkUserId,
          sub.id,
          sub.status,
          sub.currentPeriodStart,
          sub.currentPeriodEnd
        )
      }
    }
    
    if (event.type === 'subscription.canceled') {
      const sub = event.data
      db.prepare(`UPDATE users SET status = 'canceled', cancelAtPeriodEnd = 1 
                  WHERE polarSubscriptionId = ?`).run(sub.id)
    }
    
    return c.json({ received: true })
  } catch (err) {
    console.error('Webhook error:', err)
    return c.json({ error: 'Invalid webhook' }, 400)
  }
})

export default app
