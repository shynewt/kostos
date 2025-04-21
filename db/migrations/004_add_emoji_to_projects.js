const { drizzle } = require('drizzle-orm/better-sqlite3');
const Database = require('better-sqlite3');

// Connect to the database
const sqlite = new Database('kostos.db');
const db = drizzle(sqlite);

console.log('Running migration: Add emoji to projects table');

try {
  // Add the emoji column with a default value
  sqlite.exec(`
    ALTER TABLE projects 
    ADD COLUMN emoji TEXT DEFAULT '📊';
  `);
  
  console.log('Migration completed successfully!');
} catch (err) {
  console.error('Error running migration:', err);
}

// Close the database connection
sqlite.close(); 