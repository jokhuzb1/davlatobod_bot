const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new Database(dbPath, { verbose: console.log });

// Enable Foreign Keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER UNIQUE,
      phone TEXT,
      full_name TEXT
    );

    CREATE TABLE IF NOT EXISTS bsks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      bsk_id INTEGER,
      FOREIGN KEY (bsk_id) REFERENCES bsks(id) ON DELETE SET NULL
    );
    
    CREATE TABLE IF NOT EXISTS mahallas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      bsk_id INTEGER,
      FOREIGN KEY (bsk_id) REFERENCES bsks(id) ON DELETE SET NULL
    );
    
    CREATE TABLE IF NOT EXISTS buildings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mahalla_id INTEGER NOT NULL,
      type TEXT NOT NULL, -- 'apartment', 'house'
      name_or_number TEXT NOT NULL,
      levels INTEGER,
      apartments_count INTEGER,
      residents_count INTEGER,
      FOREIGN KEY (mahalla_id) REFERENCES mahallas(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS murojaats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      building_id INTEGER,
      category TEXT NOT NULL,
      mikrorayon TEXT,
      address TEXT,
      status TEXT DEFAULT 'idle', -- idle, in_progress, completed, rejected
      source TEXT DEFAULT 'telegram', -- telegram, web, call
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE SET NULL
    );
  `);
  
  // Safely alter existing tables to add columns from later phases
  try { db.exec("ALTER TABLE murojaats ADD COLUMN assigned_admin_id INTEGER;"); } catch (e) {}
  try { db.exec("ALTER TABLE murojaats ADD COLUMN user_image1 TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE murojaats ADD COLUMN user_image2 TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE murojaats ADD COLUMN staff_proof_image TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE admins ADD COLUMN telegram_id INTEGER;"); } catch (e) {}
  try { db.exec("ALTER TABLE murojaats ADD COLUMN lat REAL;"); } catch (e) {}
  try { db.exec("ALTER TABLE murojaats ADD COLUMN lng REAL;"); } catch (e) {}
  try { db.exec("ALTER TABLE bsks ADD COLUMN phone TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE bsks ADD COLUMN address TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE buildings ADD COLUMN bsk_id INTEGER;"); } catch (e) {}
  try { db.exec("ALTER TABLE admins ADD COLUMN full_name TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE admins ADD COLUMN phone TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE admins ADD COLUMN job_title TEXT;"); } catch (e) {}

  // BSK Migrations
  try { db.exec("CREATE TABLE IF NOT EXISTS bsks (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);"); } catch (e) {}
  try { db.exec("ALTER TABLE admins ADD COLUMN bsk_id INTEGER REFERENCES bsks(id) ON DELETE SET NULL;"); } catch (e) {}
  try { db.exec("ALTER TABLE mahallas ADD COLUMN bsk_id INTEGER REFERENCES bsks(id) ON DELETE SET NULL;"); } catch (e) {}

  console.log("Database initialized with Omnichannel schema (users, murojaats, images, admins, geolocation, bsks).");
}

// Ensure init is run on require
initDb();

module.exports = {
  db
};
