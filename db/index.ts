import path from 'path'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import Database from 'better-sqlite3'
import * as schema from './schema'

const databasePath = process.env.DATABASE_URL || 'kostos.db'
const sqlite = new Database(databasePath)

sqlite.pragma('foreign_keys = ON')
sqlite.pragma('journal_mode = WAL')

export const db = drizzle(sqlite, { schema })

const hasProjectsTable = sqlite
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
  .get('projects')

if (!hasProjectsTable) {
  migrate(db, { migrationsFolder: path.join(process.cwd(), 'db/migrations') })
}

export { schema }
