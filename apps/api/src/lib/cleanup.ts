import db from './db.js'

export function startCleanupJob() {
  // Run every hour
  setInterval(() => {
    console.log('🧹 Running ephemeral cleanup...')
    
    try {
      // Delete ephemeral records older than 2 hours (1 hour expiration + 1 hour buffer)
      const result = db.prepare(`
        DELETE FROM ephemeral_generations 
        WHERE createdAt < datetime('now', '-2 hours')
      `).run()
      
      if (result.changes > 0) {
        console.log(`🧹 Cleaned up ${result.changes} expired ephemeral generations`)
      }
    } catch (err) {
      console.error('❌ Cleanup job error:', err)
    }
  }, 60 * 60 * 1000) // Every hour
  
  console.log('🧹 Ephemeral cleanup job started (runs every hour)')
}
