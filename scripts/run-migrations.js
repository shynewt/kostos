const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

console.log('🚀 Running database migrations...')

// Get all migration scripts
const migrationsDir = path.join(__dirname, '../db/migrations')
const migrationFiles = fs
  .readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.js'))
  .sort() // Sort to ensure migrations run in order

if (migrationFiles.length === 0) {
  console.log('No migration files found.')
  process.exit(0)
}

console.log(`Found ${migrationFiles.length} migration(s) to run.`)

// Run each migration script
let successCount = 0
let errorCount = 0

for (const migrationFile of migrationFiles) {
  const migrationPath = path.join(migrationsDir, migrationFile)
  console.log(`\nRunning migration: ${migrationFile}`)

  try {
    execSync(`node ${migrationPath}`, { stdio: 'inherit' })
    console.log(`✅ Migration ${migrationFile} completed successfully.`)
    successCount++
  } catch (error) {
    // Check if error is about duplicate column which means the migration was already applied
    if (error.message.includes('duplicate column name')) {
      console.log(`⚠️ Migration ${migrationFile} skipped - column already exists.`)
      successCount++ // Count as success since it's not really a failure
    } else {
      console.error(`❌ Migration ${migrationFile} failed:`, error.message)
      errorCount++
    }
  }
}

console.log(`\n📊 Migration summary: ${successCount} succeeded, ${errorCount} failed.`)
