const { drizzle } = require("drizzle-orm/better-sqlite3");
const Database = require("better-sqlite3");

// Connect to the database
const sqlite = new Database("kostos.db");
const db = drizzle(sqlite);

console.log(
  "Running migration: Add payment methods table and update expenses table"
);

try {
  // Create payment methods table
  sqlite.exec(`
    CREATE TABLE payment_methods (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT '💳',
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
  `);

  // Add payment_method_id column to expenses table
  sqlite.exec(`
    ALTER TABLE expenses 
    ADD COLUMN payment_method_id TEXT REFERENCES payment_methods(id);
  `);

  // Insert default payment methods for existing projects
  const projects = sqlite.prepare("SELECT id FROM projects").all();
  const defaultPaymentMethods = [
    { name: "Card", icon: "💳" },
    { name: "Cash", icon: "💵" },
    { name: "Gift Card", icon: "🎁" },
    { name: "Bank Transfer", icon: "🏦" },
  ];

  const insertPaymentMethod = sqlite.prepare(`
    INSERT INTO payment_methods (id, project_id, name, icon)
    VALUES (?, ?, ?, ?)
  `);

  for (const project of projects) {
    for (const method of defaultPaymentMethods) {
      const id = Math.random().toString(36).substring(2, 15);
      insertPaymentMethod.run(id, project.id, method.name, method.icon);
    }
  }

  console.log("Migration completed successfully!");
} catch (err) {
  console.error("Error running migration:", err);
}

// Close the database connection
sqlite.close();
