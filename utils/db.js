const { createClient } = require('redis');
const bcrypt = require('bcryptjs');
require('dotenv').config();

let client;

async function initDb() {
  const redisUrl = process.env.REDIS_URL;
  client = createClient({
    url: redisUrl
  });

  client.on('error', (err) => console.error('Redis Client Error', err));

  await client.connect();
  console.log('Redis connected.');

  // Seed default subjects if empty
  const subjectsKey = 'fpc:subjects';
  const subjectsExists = await client.exists(subjectsKey);
  if (!subjectsExists) {
    const defaults = ['Data Science', 'Web Development', 'UI/UX Design', 'Cloud Architecture', 'Cybersecurity', 'AI & Machine Learning'];
    for (const s of defaults) {
      await client.hSet(subjectsKey, Date.now() + Math.random(), s);
    }
    console.log('Default subjects seeded in Redis.');
  }

  // Seed Admin user if it doesn't exist
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@fpc.com';
  const usersKey = 'fpc:users';
  const adminExists = await client.hGet(usersKey, adminEmail);
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'password', 10);
    const adminUser = {
      email: adminEmail,
      password: hashedPassword,
      role: 'admin'
    };
    await client.hSet(usersKey, adminEmail, JSON.stringify(adminUser));
    console.log('Admin user seeded in Redis.');
  }

  return client;
}

function getDb() {
  return client;
}

module.exports = { initDb, getDb };
