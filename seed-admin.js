/**
 * Seed Admin Script
 * Run: node seed-admin.js
 * 
 * This creates an admin account directly in the database.
 * After running, login at http://localhost:3000/ with:
 *   Email: admin@yourstore.com
 *   Code:  1221
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const { Client } = require('pg');

const db = new Client({
  user:     process.env.DB_USER     || 'postgres',
  host:     process.env.DB_HOST     || 'localhost',
  database: process.env.DB_NAME     || 'Netra',
  password: process.env.DB_PASSWORD || '1221',
  port:     parseInt(process.env.DB_PORT) || 5432,
});

async function seedAdmin() {
  await db.connect();
  console.log('Connected to PostgreSQL');

  // Clear old admins
  await db.query('DELETE FROM admins');
  console.log('Cleared old admin rows');

  // Generate hash
  const code = '1221';
  const hash = await bcrypt.hash(code, 10);
  console.log('Generated hash:', hash);

  // Verify hash works BEFORE inserting
  const verify = await bcrypt.compare(code, hash);
  console.log('Hash verification:', verify);

  if (!verify) {
    console.error('ERROR: Hash verification failed!');
    process.exit(1);
  }

  // Insert admin
  await db.query(
    `INSERT INTO admins (email, owner_name, shop_name, unique_code, shop_id)
     VALUES ($1, $2, $3, $4, $5)`,
    ['admin@yourstore.com', 'Your Name', 'Your Store', hash, 1]
  );

  console.log('\n✅ Admin seeded successfully!');
  console.log('─────────────────────────────');
  console.log('  Email:       admin@yourstore.com');
  console.log('  Unique Code: 1221');
  console.log('  Shop ID:     1');
  console.log('─────────────────────────────');
  console.log('\nNow login at http://localhost:3000/');

  await db.end();
}

seedAdmin().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
