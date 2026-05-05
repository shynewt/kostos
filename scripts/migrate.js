const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { drizzle } = require('drizzle-orm/better-sqlite3')
const { migrate } = require('drizzle-orm/better-sqlite3/migrator')
const Database = require('better-sqlite3')

const databasePath = process.env.DATABASE_URL || 'kostos.db'
const migrationsFolder = path.join(process.cwd(), 'db/migrations')
const sqlite = new Database(databasePath)
const db = drizzle(sqlite)

sqlite.pragma('foreign_keys = ON')

try {
  backupDatabaseIfNeeded()
  baselineExistingDatabaseIfNeeded()

  migrate(db, { migrationsFolder })
  applyCompatibilityIndexes()
  console.log('Database migrations applied successfully')
} finally {
  sqlite.close()
}

function backupDatabaseIfNeeded() {
  if (databasePath === ':memory:' || process.env.KOSTOS_SKIP_DB_BACKUP === '1') return
  if (!fs.existsSync(databasePath) || fs.statSync(databasePath).size === 0) return

  const tableCount = sqlite.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table'").get().count
  if (tableCount === 0) return

  sqlite.pragma('wal_checkpoint(TRUNCATE)')

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupDir = process.env.KOSTOS_BACKUP_DIR || path.join(path.dirname(databasePath), 'backups')
  const backupPath = path.join(backupDir, `${path.basename(databasePath)}.backup-${timestamp}`)
  fs.mkdirSync(backupDir, { recursive: true })
  fs.copyFileSync(databasePath, backupPath)
  console.log(`Database backup created: ${backupPath}`)
}

function baselineExistingDatabaseIfNeeded() {
  const hasProjectsTable = tableExists('projects')

  // Databases initialized by the old scripts may already have Kostos tables but no Drizzle
  // migration ledger. Mark the initial schema as applied so future migrations are additive
  // instead of trying to recreate existing tables. Also handles a previous failed migration
  // attempt that created an empty __drizzle_migrations table.
  if (!hasProjectsTable) return

  sqlite.exec(`CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at numeric
  )`)

  const initialMigration = path.join(migrationsFolder, '0000_sweet_brood.sql')
  const hash = crypto.createHash('sha256').update(fs.readFileSync(initialMigration)).digest('hex')
  const alreadyApplied = sqlite
    .prepare('SELECT 1 FROM "__drizzle_migrations" WHERE hash = ? LIMIT 1')
    .get(hash)

  if (alreadyApplied) return

  sqlite.prepare('INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES (?, ?)').run(hash, Date.now())
  console.log('Existing database schema detected; baseline migration marked as applied')
}

function applyCompatibilityIndexes() {
  const indexes = [
    ['categories', 'idx_categories_project_id', 'project_id'],
    ['payment_methods', 'idx_payment_methods_project_id', 'project_id'],
    ['members', 'idx_members_project_id', 'project_id'],
    ['expenses', 'idx_expenses_project_id', 'project_id'],
    ['expenses', 'idx_expenses_category_id', 'category_id'],
    ['expenses', 'idx_expenses_payment_method_id', 'payment_method_id'],
    ['payments', 'idx_payments_expense_id', 'expense_id'],
    ['payments', 'idx_payments_member_id', 'member_id'],
    ['splits', 'idx_splits_expense_id', 'expense_id'],
    ['splits', 'idx_splits_member_id', 'member_id'],
  ]

  for (const [table, index, column] of indexes) {
    if (tableExists(table)) {
      sqlite.exec(`CREATE INDEX IF NOT EXISTS \`${index}\` ON \`${table}\` (\`${column}\`)`)
    }
  }
}

function tableExists(tableName) {
  return Boolean(
    sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName)
  )
}
