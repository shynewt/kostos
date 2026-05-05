// Backwards-compatible alias for initializing the SQLite database.
// The migration runner creates the database file if it does not exist.
require('./migrate')
