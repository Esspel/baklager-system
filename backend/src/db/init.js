/* Database initialization script */
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: '../../.env' });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'baklager',
  user: process.env.DB_USER || 'baklager',
  password: process.env.DB_PASSWORD || 'changeme',
});

async function init() {
  console.log('Initializing database...');

  // Create tables if not exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS burar (
      id SERIAL PRIMARY KEY,
      name VARCHAR(50) NOT NULL,
      x INTEGER DEFAULT 10,
      y INTEGER DEFAULT 10,
      color_status VARCHAR(10) DEFAULT 'gron',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      rfid_tag VARCHAR(50),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rfid_tags (
      id SERIAL PRIMARY KEY,
      tag_id VARCHAR(50) UNIQUE NOT NULL,
      employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Drop checkins table if it exists with wrong schema and recreate
  await pool.query(`DROP TABLE IF EXISTS checkins`);
  await pool.query(`
    CREATE TABLE checkins (
      id SERIAL PRIMARY KEY,
      bur_id INTEGER REFERENCES burar(id) ON DELETE CASCADE,
      employee_id INTEGER REFERENCES employees(id),
      rfid_tag VARCHAR(50),
      status VARCHAR(20) DEFAULT 'kollad',
      checked_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_checkins_bur_id ON checkins(bur_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_checkins_checked_at ON checkins(checked_at)');

  // Create indexes
  await pool.query('CREATE INDEX IF NOT EXISTS idx_checkins_bur_id ON checkins(bur_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_checkins_checked_at ON checkins(checked_at)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_rfid_tags_tag_id ON rfid_tags(tag_id)');

  // Seed default data if empty
  const burCount = await pool.query('SELECT COUNT(*) FROM burar');
  if (parseInt(burCount.rows[0].count) === 0) {
    console.log('Seeding default data...');
    await pool.query(
      `INSERT INTO burar (name, x, y, color_status) VALUES
        ('Bur 01', 50, 100, 'gron'),
        ('Bur 02', 150, 100, 'gul'),
        ('Bur 03', 250, 100, 'röd'),
        ('Mejeribur', 50, 200, 'gron'),
        ('Bur 05', 150, 200, 'gul')`
    );
  }

  const empCount = await pool.query('SELECT COUNT(*) FROM employees');
  if (parseInt(empCount.rows[0].count) === 0) {
    console.log('Seeding employees...');
    await pool.query(
      `INSERT INTO employees (name, rfid_tag) VALUES
        ('Anna Andersson', 'RFID-001'),
        ('Björn Lund', 'RFID-002'),
        ('Carina Nilsson', 'RFID-003')`
    );
    await pool.query(
      `INSERT INTO rfid_tags (tag_id, employee_id) VALUES
        ('RFID-001', 1),
        ('RFID-002', 2),
        ('RFID-003', 3)`
    );
  }

  console.log('Database initialized successfully.');
  await pool.end();
}

init().catch(err => {
  console.error('Database init failed:', err);
  process.exit(1);
});