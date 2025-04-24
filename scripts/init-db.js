const { drizzle } = require('drizzle-orm/better-sqlite3')
const Database = require('better-sqlite3')
const { sqliteTable, text, integer, real } = require('drizzle-orm/sqlite-core')
const { sql } = require('drizzle-orm')

console.log('Initializing database...')

// Create SQLite database
const sqlite = new Database('kostos.db')
const db = drizzle(sqlite)

// Define schema
const projects = sqliteTable('projects', {
  id: text('id').primaryKey().notNull(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
})

const members = sqliteTable('members', {
  id: text('id').primaryKey().notNull(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
})

const expenses = sqliteTable('expenses', {
  id: text('id').primaryKey().notNull(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  amount: real('amount').notNull(),
  date: integer('date', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
  splitType: text('split_type').notNull(), // 'amount', 'shares', 'percent', 'even'
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
})

const payments = sqliteTable('payments', {
  id: text('id').primaryKey().notNull(),
  expenseId: text('expense_id')
    .notNull()
    .references(() => expenses.id, { onDelete: 'cascade' }),
  memberId: text('member_id')
    .notNull()
    .references(() => members.id, { onDelete: 'cascade' }),
  amount: real('amount').notNull(),
})

const splits = sqliteTable('splits', {
  id: text('id').primaryKey().notNull(),
  expenseId: text('expense_id')
    .notNull()
    .references(() => expenses.id, { onDelete: 'cascade' }),
  memberId: text('member_id')
    .notNull()
    .references(() => members.id, { onDelete: 'cascade' }),
  amount: real('amount'),
  shares: integer('shares'),
  percent: real('percent'),
  owedAmount: real('owed_amount').notNull(),
})

// Create tables
try {
  console.log('Creating tables...')

  // Drop tables if they exist (for clean initialization)
  sqlite.exec('DROP TABLE IF EXISTS splits')
  sqlite.exec('DROP TABLE IF EXISTS payments')
  sqlite.exec('DROP TABLE IF EXISTS expenses')
  sqlite.exec('DROP TABLE IF EXISTS categories')
  sqlite.exec('DROP TABLE IF EXISTS payment_methods')
  sqlite.exec('DROP TABLE IF EXISTS members')
  sqlite.exec('DROP TABLE IF EXISTS projects')

  // Create tables
  sqlite.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      currency TEXT NOT NULL DEFAULT 'USD',
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
    
    CREATE TABLE members (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    
    CREATE TABLE categories (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#3b82f6',
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    
    CREATE TABLE payment_methods (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT '💳',
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    
    CREATE TABLE expenses (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      date INTEGER DEFAULT (strftime('%s', 'now')),
      split_type TEXT NOT NULL,
      category_id TEXT,
      payment_method_id TEXT,
      notes TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (category_id) REFERENCES categories(id),
      FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    
    CREATE TABLE payments (
      id TEXT PRIMARY KEY NOT NULL,
      expense_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      amount REAL NOT NULL,
      FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    );
    
    CREATE TABLE splits (
      id TEXT PRIMARY KEY NOT NULL,
      expense_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      amount REAL,
      shares INTEGER,
      percent REAL,
      owed_amount REAL NOT NULL,
      FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    );
  `)

  console.log('Database initialized successfully!')
} catch (err) {
  console.error('Error initializing database:', err)
}

// Close the database connection
sqlite.close()
