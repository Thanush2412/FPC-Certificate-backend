const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');
require('dotenv').config();

let dbInstance = null;
let firebaseWrapper = null;

/**
 * Initialize Firebase Realtime Database connection.
 */
async function initDb() {
  if (admin.apps.length === 0) {
    let serviceAccount;
    
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64) {
      try {
        const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64, 'base64').toString('utf8');
        serviceAccount = JSON.parse(decoded);
      } catch (e) {
        console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON_BASE64:', e.message);
      }
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      } catch (e) {
        console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', e.message);
      }
    } else {
      try {
        serviceAccount = require('../../firebase-service-account.local.json');
      } catch (e) {}
    }

    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL
      });
      console.log('🔥 Firebase Admin initialized.');
    }
  }

  dbInstance = admin.database();
  
  firebaseWrapper = {
    hGetAll: async (key) => {
      const path = key.replace('fpc:', '');
      const snapshot = await dbInstance.ref(path).once('value');
      return snapshot.val() || {};
    },
    hGet: async (key, field) => {
      const path = key.replace('fpc:', '');
      const sanitizedField = String(field).replace(/\./g, '_');
      const snapshot = await dbInstance.ref(`${path}/${sanitizedField}`).once('value');
      return snapshot.val();
    },
    hSet: async (key, field, value) => {
      const path = key.replace('fpc:', '');
      const sanitizedField = String(field).replace(/\./g, '_');
      await dbInstance.ref(`${path}/${sanitizedField}`).set(value);
      return 1;
    },
    hDel: async (key, field) => {
      const path = key.replace('fpc:', '');
      const sanitizedField = String(field).replace(/\./g, '_');
      await dbInstance.ref(`${path}/${sanitizedField}`).remove();
      return 1;
    },
    hLen: async (key) => {
      const path = key.replace('fpc:', '');
      const snapshot = await dbInstance.ref(path).once('value');
      return snapshot.numChildren();
    },
    exists: async (key) => {
      const path = key.replace('fpc:', '');
      const snapshot = await dbInstance.ref(path).once('value');
      return snapshot.exists();
    }
  };

  // Sync Admin
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@fpc.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'password';
  const hashedPassword = await bcrypt.hash(adminPassword, 10);
  const adminUser = { email: adminEmail, password: hashedPassword, role: 'admin' };
  await firebaseWrapper.hSet('fpc:users', adminEmail, JSON.stringify(adminUser));
  
  return dbInstance;
}

function getDb() {
  return firebaseWrapper; // Safely returns null if initDb hasn't finished
}

module.exports = { initDb, getDb };
