const { drizzle } = require('drizzle-orm/better-sqlite3');
const Database = require('better-sqlite3');
const { sqliteTable, text } = require('drizzle-orm/sqlite-core');

// Connect to the database
const sqlite = new Database('kostos.db');
const db = drizzle(sqlite);

console.log('Running migration: Add currency to projects table');

try {
  // Add the currency column with a default value of 'USD'
  sqlite.exec(`
    ALTER TABLE projects 
    ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD';
  `);
  
  console.log('Migration completed successfully!');
} catch (err) {
  console.error('Error running migration:', err);
}

// Close the database connection
sqlite.close();
