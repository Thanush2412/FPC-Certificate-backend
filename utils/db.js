const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const bcrypt = require('bcryptjs');
let db;
require('dotenv').config();

async function initDb() {
  db = await open({
    filename: path.join(__dirname, '..', 'data', 'database.sqlite'),
    driver: sqlite3.Database
  });

  // Create Users table (for log-in admin)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'admin'
    )
  `);

  // Create Mentors table (for entities that are NOT login members)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS mentors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      employeeId TEXT UNIQUE,
      email TEXT,
      type TEXT DEFAULT 'Mentor'
    )
  `);

  // Migration: Ensure 'type' exists for older DB versions
  const mentorTableInfo = await db.all("PRAGMA table_info(mentors)");
  const hasType = mentorTableInfo.some(col => col.name === 'type');
  if (!hasType) {
    await db.exec("ALTER TABLE mentors ADD COLUMN type TEXT DEFAULT 'Mentor'");
    console.log("Migration: Added 'type' column to mentors table.");
  }

  // Create Certificates table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS certificates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      recipientId TEXT,
      recipientType TEXT DEFAULT 'Mentor',
      domain TEXT NOT NULL,
      issueDate TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    )
  `);

  // Migration: Ensure recipientId and recipientType exist for older DB versions
  const certTableInfo = await db.all("PRAGMA table_info(certificates)");
  if (!certTableInfo.some(col => col.name === 'recipientId')) {
    await db.exec("ALTER TABLE certificates ADD COLUMN recipientId TEXT");
  }
  if (!certTableInfo.some(col => col.name === 'recipientType')) {
    await db.exec("ALTER TABLE certificates ADD COLUMN recipientType TEXT DEFAULT 'Mentor'");
  }
  if (!certTableInfo.some(col => col.name === 'template')) {
    await db.exec("ALTER TABLE certificates ADD COLUMN template TEXT DEFAULT 'standard'");
  }
  if (!certTableInfo.some(col => col.name === 'university')) {
    await db.exec("ALTER TABLE certificates ADD COLUMN university TEXT");
  }
  if (!certTableInfo.some(col => col.name === 'department')) {
    await db.exec("ALTER TABLE certificates ADD COLUMN department TEXT");
  }
  if (!certTableInfo.some(col => col.name === 'course')) {
    await db.exec("ALTER TABLE certificates ADD COLUMN course TEXT");
  }
  if (!certTableInfo.some(col => col.name === 'recognition')) {
    await db.exec("ALTER TABLE certificates ADD COLUMN recognition TEXT");
  }
  if (!certTableInfo.some(col => col.name === 'semester')) {
    await db.exec("ALTER TABLE certificates ADD COLUMN semester TEXT");
  }
  if (!certTableInfo.some(col => col.name === 'logo')) {
    await db.exec("ALTER TABLE certificates ADD COLUMN logo TEXT");
  }

  // Create Subjects table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    )
  `);

  // Seed default subjects if empty
  const subjCount = await db.get('SELECT COUNT(*) as count FROM subjects');
  if (subjCount.count === 0) {
    const defaults = ['Data Science', 'Web Development', 'UI/UX Design', 'Cloud Architecture', 'Cybersecurity', 'AI & Machine Learning'];
    for (const s of defaults) {
      await db.run('INSERT INTO subjects (name) VALUES (?)', [s]);
    }
    console.log('Default subjects seeded.');
  }

  // Seed Admin user if it doesn't exist
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@fpc.com';
  const existingAdmin = await db.get('SELECT * FROM users WHERE email = ?', [adminEmail]);
  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'password', 10);
    await db.run('INSERT INTO users (email, password) VALUES (?, ?)', [adminEmail, hashedPassword]);
    console.log('Admin user seeded.');
  }

  return db;
}

function getDb() {
  return db;
}

module.exports = { initDb, getDb };
