const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');
require('dotenv').config();

let db;

/**
 * Initialize Firebase Realtime Database connection.
 * Uses a Redis-compatible wrapper to maintain existing route logic while migrating to Firebase.
 */
async function initDb() {
  if (admin.apps.length === 0) {
    let serviceAccount;
    
    // 1. Prioritize BASE64 encoded JSON (ideal for Vercel Environment Variables)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64) {
      try {
        const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64, 'base64').toString('utf8');
        serviceAccount = JSON.parse(decoded);
      } catch (e) {
        console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON_BASE64:', e.message);
      }
    } 
    // 2. Fallback to raw JSON string
    else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      } catch (e) {
        console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', e.message);
      }
    } 
    // 3. Final fallback to local development file
    else {
      try {
        serviceAccount = require('../../firebase-service-account.local.json');
      } catch (e) {
        console.warn('Firebase Service Account credentials not found in ENV or local file.');
      }
    }

    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL
      });
      console.log('🔥 Firebase Admin initialized successfully.');
    } else {
      throw new Error('Database initialization failed: Missing Firebase credentials.');
    }
  }

  db = admin.database();
  
  /**
   * DATABASE WRAPPER
   * We keep these 'Redis-style' method names (hGet, hSet, hGetAll) to ensure
   * compatibility with all existing route logic without requiring a massive refactor.
   */
  const firebaseWrapper = {
    // Get all fields in a 'Hash' (Firebase Object)
    hGetAll: async (key) => {
      const path = key.replace('fpc:', '');
      const snapshot = await db.ref(path).once('value');
      return snapshot.val() || {};
    },
    // Get a specific field from a 'Hash'
    hGet: async (key, field) => {
      const path = key.replace('fpc:', '');
      // Firebase keys cannot contain '.' - sanitize for things like emails
      const sanitizedField = field.replace(/\./g, '_');
      const snapshot = await db.ref(`${path}/${sanitizedField}`).once('value');
      return snapshot.val();
    },
    // Set a field in a 'Hash'
    hSet: async (key, field, value) => {
      const path = key.replace('fpc:', '');
      const sanitizedField = String(field).replace(/\./g, '_');
      await db.ref(`${path}/${sanitizedField}`).set(value);
      return 1;
    },
    // Delete a field from a 'Hash'
    hDel: async (key, field) => {
      const path = key.replace('fpc:', '');
      const sanitizedField = String(field).replace(/\./g, '_');
      await db.ref(`${path}/${sanitizedField}`).remove();
      return 1;
    },
    // Count items in a 'Hash'
    hLen: async (key) => {
      const path = key.replace('fpc:', '');
      const snapshot = await db.ref(path).once('value');
      return snapshot.numChildren();
    },
    // Check if a path exists
    exists: async (key) => {
      const path = key.replace('fpc:', '');
      const snapshot = await db.ref(path).once('value');
      return snapshot.exists();
    }
  };

  // --- Bootstrapping: Seed default subjects ---
  const subjectsExists = await firebaseWrapper.exists('fpc:subjects');
  if (!subjectsExists) {
    const defaults = ['Data Science', 'Web Development', 'UI/UX Design', 'Cloud Architecture', 'Cybersecurity', 'AI & Machine Learning'];
    for (const s of defaults) {
      // Use a timestamp-based ID for default subjects
      await firebaseWrapper.hSet('fpc:subjects', Date.now() + Math.random().toString().slice(2, 6), s);
    }
    console.log('✅ Default subjects seeded in Firebase.');
  }

  // --- Bootstrapping: Synchronize Admin Account ---
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@fpc.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'password';
  const hashedPassword = await bcrypt.hash(adminPassword, 10);
  const adminUser = {
    email: adminEmail,
    password: hashedPassword,
    role: 'admin'
  };
  
  // We ALWAYS update the admin password on restart to match the current ENV
  await firebaseWrapper.hSet('fpc:users', adminEmail, JSON.stringify(adminUser));
  console.log(`👤 Admin user synced in Firebase: ${adminEmail}`);

  // Attach the wrapper to the db object so it can be retrieved globally
  db.firebaseWrapper = firebaseWrapper;
  return db;
}

/**
 * Global getter for the Database wrapper
 */
function getDb() {
  return db.firebaseWrapper;
}

module.exports = { initDb, getDb };
