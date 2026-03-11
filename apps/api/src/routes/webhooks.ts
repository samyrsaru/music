import { Hono } from 'hono'
import { validateEvent, WebhookVerificationError } from '@polar-sh/sdk/webhooks.js'
import db from '../lib/db.js'
import { uploadAudioToR2, downloadAudioFromUrl } from '../lib/r2.js'
import { isWebhookProcessed, markWebhookProcessed } from '../lib/sync.js'

const app = new Hono()

console.log('Webhook secret exists:', !!process.env.POLAR_WEBHOOK_SECRET)

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
  
  try {
    const event = validateEvent(payload, headers, process.env.POLAR_WEBHOOK_SECRET!) as any
    
    // Check for idempotency - skip if already processed
    if (isWebhookProcessed(event.id)) {
      console.log(`⏭️  Skipping duplicate webhook event: ${event.id} (${event.type})`)
      return c.json({ received: true, duplicate: true })
    }
    
    console.log(`📨 Processing webhook: ${event.type} (${event.id})`)
    
    switch (event.type) {
      case 'subscription.active':
      case 'subscription.created': {
        const sub = event.data
        const clerkUserId = sub.metadata?.clerkUserId
        
        if (clerkUserId) {
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
          console.log(`  ✅ Activated subscription for user: ${clerkUserId}`)
        }
        break
      }
      
      case 'subscription.canceled': {
        const sub = event.data
        db.prepare(`UPDATE users SET status = 'canceled', cancelAtPeriodEnd = 1 
                    WHERE polarSubscriptionId = ?`).run(sub.id)
        console.log(`  🚫 Canceled subscription: ${sub.id}`)
        break
      }
      
      case 'subscription.uncanceled': {
        const sub = event.data
        db.prepare(`UPDATE users SET status = 'active', cancelAtPeriodEnd = 0 
                    WHERE polarSubscriptionId = ?`).run(sub.id)
        console.log(`  🔄 Uncanceled subscription: ${sub.id}`)
        break
      }
      
      case 'subscription.updated': {
        const sub = event.data
        const clerkUserId = sub.metadata?.clerkUserId
        
        if (clerkUserId) {
          db.prepare(`
            UPDATE users 
            SET status = ?, currentPeriodEnd = ?, cancelAtPeriodEnd = ?
            WHERE clerkUserId = ?
          `).run(
            sub.status,
            sub.currentPeriodEnd,
            sub.cancelAtPeriodEnd ? 1 : 0,
            clerkUserId
          )
          console.log(`  📝 Updated subscription for user: ${clerkUserId}`)
        }
        break
      }
      
      case 'subscription.past_due': {
        const sub = event.data
        db.prepare(`UPDATE users SET status = 'past_due' 
                    WHERE polarSubscriptionId = ?`).run(sub.id)
        console.log(`  ⚠️  Subscription past due: ${sub.id}`)
        break
      }
      
      case 'subscription.revoked': {
        const sub = event.data
        db.prepare(`UPDATE users SET status = 'revoked' 
                    WHERE polarSubscriptionId = ?`).run(sub.id)
        console.log(`  🗑️  Subscription revoked: ${sub.id}`)
        break
      }
      
      default:
        console.log(`  ℹ️  Unhandled webhook type: ${event.type}`)
    }
    
    // Mark event as processed
    markWebhookProcessed(event.id, event.type, event.data)
    
    return c.json({ received: true })
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      console.error('Webhook verification failed:', err.message)
      return c.json({ error: 'Invalid webhook' }, 403)
    }
    console.error('Webhook error:', err)
    return c.json({ error: 'Webhook processing failed' }, 500)
  }
})

export default app
