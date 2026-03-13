import Database, { type Database as DatabaseType } from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, '../../main.db')

const db: DatabaseType = new Database(dbPath)

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    clerkUserId TEXT PRIMARY KEY,
    credits INTEGER DEFAULT 0,
    polarSubscriptionId TEXT,
    status TEXT,
    currentPeriodStart TEXT,
    currentPeriodEnd TEXT,
    cancelAtPeriodEnd INTEGER DEFAULT 0,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS generations (
    id TEXT PRIMARY KEY,
    clerkUserId TEXT,
    lyrics TEXT,
    prompt TEXT,
    replicateId TEXT,
    status TEXT DEFAULT 'pending',
    audioUrl TEXT,
    r2Key TEXT,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    completedAt TEXT,
    FOREIGN KEY (clerkUserId) REFERENCES users(clerkUserId)
  )
`)

// Migrations for existing databases
try {
  db.exec(`ALTER TABLE generations ADD COLUMN r2Key TEXT`)
  console.log('✅ Migration: Added r2Key column to generations table')
} catch (err) {
  // Column already exists, ignore error
}

// Add email column to users table for matching Polar customers
try {
  db.exec(`ALTER TABLE users ADD COLUMN email TEXT`)
  console.log('✅ Migration: Added email column to users table')
} catch (err) {
  // Column already exists, ignore error
}

// Add endsAt column to users table for tracking subscription end date when canceled
try {
  db.exec(`ALTER TABLE users ADD COLUMN endsAt TEXT`)
  console.log('✅ Migration: Added endsAt column to users table')
} catch (err) {
  // Column already exists, ignore error
}

// Fix status for existing generations that have audio URLs but pending status
try {
  const result = db.exec(`
    UPDATE generations 
    SET status = 'completed' 
    WHERE audioUrl IS NOT NULL AND audioUrl != '' AND status = 'pending'
  `)
  console.log('✅ Migration: Fixed status for existing completed generations')
} catch (err) {
  // Ignore errors
}

// Create index on email for faster lookups
try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`)
  console.log('✅ Migration: Created email index on users table')
} catch (err) {
  // Ignore
}

// Remove old r2Url column if it exists (from previous implementation)
try {
  // SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
  // For now, just leave it - it won't hurt anything
  console.log('ℹ️ Skipping removal of old r2Url column (SQLite limitation)')
} catch (err) {
  // Ignore
}

// Webhook event tracking for idempotency
db.exec(`
  CREATE TABLE IF NOT EXISTS webhook_events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    processedAt TEXT DEFAULT CURRENT_TIMESTAMP
  )
`)

// Sync state tracking
db.exec(`
  CREATE TABLE IF NOT EXISTS sync_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    lastSyncAt TEXT,
    lastSuccessfulSyncAt TEXT,
    syncCount INTEGER DEFAULT 0,
    errorCount INTEGER DEFAULT 0,
    lastError TEXT,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
  )
`)

// Initialize sync state if not exists
db.exec(`
  INSERT OR IGNORE INTO sync_state (id, lastSyncAt, syncCount, errorCount) 
  VALUES (1, NULL, 0, 0)
`)

export default db
