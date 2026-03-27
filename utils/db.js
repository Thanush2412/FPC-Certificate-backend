const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');
require('dotenv').config();

let db;

async function initDb() {
  if (admin.apps.length === 0) {
    let serviceAccount;
    
    // Check for BASE64 encoded JSON (best for Vercel/Hosting)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64) {
      const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64, 'base64').toString('utf8');
      serviceAccount = JSON.parse(decoded);
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } else {
      // Fallback to local file if needed
      try {
        serviceAccount = require('../../firebase-service-account.local.json');
      } catch (e) {
        console.error('Firebase Service Account credentials missing!');
      }
    }

    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL
      });
      console.log('Firebase Admin initialized.');
    }
  }

  db = admin.database();
  
  // Wrapper for Redis-style operations to minimize route changes
  const redisWrapper = {
    hGetAll: async (key) => {
      const path = key.replace('fpc:', '');
      const snapshot = await db.ref(path).once('value');
      return snapshot.val() || {};
    },
    hGet: async (key, field) => {
      const path = key.replace('fpc:', '');
      const snapshot = await db.ref(`${path}/${field.replace(/\./g, '_')}`).once('value');
      return snapshot.val();
    },
    hSet: async (key, field, value) => {
      const path = key.replace('fpc:', '');
      // Firebase keys can't contain certain characters (like '.') so we sanitize emails
      const sanitizedField = field.replace(/\./g, '_');
      await db.ref(`${path}/${sanitizedField}`).set(value);
      return 1;
    },
    hDel: async (key, field) => {
      const path = key.replace('fpc:', '');
      const sanitizedField = field.replace(/\./g, '_');
      await db.ref(`${path}/${sanitizedField}`).remove();
      return 1;
    },
    hLen: async (key) => {
      const path = key.replace('fpc:', '');
      const snapshot = await db.ref(path).once('value');
      return snapshot.numChildren();
    },
    exists: async (key) => {
      const path = key.replace('fpc:', '');
      const snapshot = await db.ref(path).once('value');
      return snapshot.exists();
    }
  };

  // Seed default subjects
  const subjectsExists = await redisWrapper.exists('fpc:subjects');
  if (!subjectsExists) {
    const defaults = ['Data Science', 'Web Development', 'UI/UX Design', 'Cloud Architecture', 'Cybersecurity', 'AI & Machine Learning'];
    for (const s of defaults) {
      await redisWrapper.hSet('fpc:subjects', Date.now() + Math.random().toString().slice(2, 6), s);
    }
    console.log('Default subjects seeded in Firebase.');
  }

  // Seed/Sync Admin user
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@fpc.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'password';
  const hashedPassword = await bcrypt.hash(adminPassword, 10);
  const adminUser = {
    email: adminEmail,
    password: hashedPassword,
    role: 'admin'
  };
  
  await redisWrapper.hSet('fpc:users', adminEmail, JSON.stringify(adminUser));
  console.log(`Admin user synced in Firebase for: ${adminEmail}`);

  db.redisCompatible = redisWrapper;
  return db;
}

function getDb() {
  return db.redisCompatible;
}

module.exports = { initDb, getDb };
