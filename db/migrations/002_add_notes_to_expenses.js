const { drizzle } = require('drizzle-orm/better-sqlite3');
const Database = require('better-sqlite3');

// Connect to the database
const sqlite = new Database('kostos.db');
const db = drizzle(sqlite);

console.log('Running migration: Add notes to expenses table');

try {
  // Add the notes column to the expenses table
  sqlite.exec(`
    ALTER TABLE expenses 
    ADD COLUMN notes TEXT;
  `);
  
  console.log('Migration completed successfully!');
} catch (err) {
  console.error('Error running migration:', err);
}

// Close the database connection
sqlite.close(); 