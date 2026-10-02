import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

dotenv.config({ path: '../.env' });

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'baklager',
  user: process.env.DB_USER || 'baklager',
  password: process.env.DB_PASSWORD || 'changeme',
});

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

// Middleware for auth
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.employee = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (e) {
    res.status(500).json({ status: 'error', error: e.message });
  }
});

// --- AUTH / RFID LOGIN ---
app.post('/auth/login', async (req, res) => {
  const { rfid_tag } = req.body;
  if (!rfid_tag) return res.status(400).json({ error: 'RFID tag required' });

  const result = await pool.query(
    'SELECT e.*, r.name FROM employees e JOIN rfid_tags r ON r.employee_id = e.id WHERE r.tag_id = $1',
    [rfid_tag]
  );

  if (result.rows.length === 0) {
    return res.status(401).json({ error: 'Invalid RFID tag' });
  }

  const employee = result.rows[0];
  const token = jwt.sign(
    { id: employee.id, name: employee.name, rfid: rfid_tag },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({ token, employee: { id: employee.id, name: employee.name } });
});

// --- RULLBURAR ---
// GET all wheelbarrows (public-ish data for map)
app.get('/burar', async (req, res) => {
  const result = await pool.query(`
    SELECT b.*, c.tag_id as last_rfid_tag, c.employee_id,
           c.checked_at, c.status,
           c.id as checkin_id,
           e.name as checked_by_name
    FROM burar b
    LEFT JOIN checkins c ON c.id = (
      SELECT id FROM checkins WHERE bur_id = b.id ORDER BY checked_at DESC LIMIT 1
    )
    LEFT JOIN employees e ON c.employee_id = e.id
    ORDER BY b.name ASC
  `);
  res.json(result.rows);
});

// GET single bur
app.get('/burar/:id', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM burar WHERE id = $1',
    [req.params.id]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
  res.json(result.rows[0]);
});

// POST create bur (requires auth)
app.post('/burar', auth, async (req, res) => {
  const { name, x, y, color_status } = req.body;
  const result = await pool.query(
    'INSERT INTO burar (name, x, y, color_status) VALUES ($1, $2, $3, $4) RETURNING *',
    [name, x || 10, y || 10, color_status || 'gron']
  );
  res.status(201).json(result.rows[0]);
});

// PUT update bur (name, position, status color)
app.put('/burar/:id', auth, async (req, res) => {
  const { name, x, y, color_status } = req.body;
  const result = await pool.query(
    'UPDATE burar SET name = COALESCE($1, name), x = COALESCE($2, x), y = COALESCE($3, y), color_status = COALESCE($4, color_status) WHERE id = $5 RETURNING *',
    [name, x, y, color_status, req.params.id]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
  res.json(result.rows[0]);
});

// DELETE bur
app.delete('/burar/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM burar WHERE id = $1', [req.params.id]);
  res.json({ deleted: true });
});

// --- CHECK-IN ---
app.post('/checkin', auth, async (req, res) => {
  const { bur_id } = req.body;
  if (!bur_id) return res.status(400).json({ error: 'bur_id required' });

  // Insert checkin
  const result = await pool.query(
    'INSERT INTO checkins (bur_id, employee_id, rfid_tag, status) VALUES ($1, $2, $3, $4) RETURNING *',
    [bur_id, req.employee.id, req.employee.rfid || 'unknown', 'kollad']
  );

  // Update bur status logic based on time
  const bur = await pool.query('SELECT * FROM burar WHERE id = $1', [bur_id]);
  if (bur.rowCount > 0) {
    // Compute new color based on last checkin time
    await pool.query('UPDATE burar SET color_status = $1 WHERE id = $2', ['gron', bur_id]);
  }

  res.json({ checkin: result.rows[0], bur_id, status: 'kollad' });
});

// --- EMPLOYEES ---
app.get('/employees', auth, async (req, res) => {
  const result = await pool.query('SELECT id, name, rfid_tag FROM employees ORDER BY name');
  res.json(result.rows);
});

app.post('/employees', auth, async (req, res) => {
  const { name, rfid_tag } = req.body;
  const result = await pool.query(
    'INSERT INTO employees (name, rfid_tag) VALUES ($1, $2) RETURNING id, name, rfid_tag',
    [name, rfid_tag || null]
  );
  res.status(201).json(result.rows[0]);
});

// --- STATISTICS ---
app.get('/stats/bur/:id', auth, async (req, res) => {
  const result = await pool.query(
    `SELECT
      b.name,
      COUNT(c.id) as total_checks,
      COUNT(CASE WHEN c.checked_at > NOW() - INTERVAL '7 days' THEN 1 END) as checks_this_week,
      COUNT(CASE WHEN c.checked_at > NOW() - INTERVAL '30 days' THEN 1 END) as checks_this_month,
      MAX(c.checked_at) as last_check
    FROM burar b
    LEFT JOIN checkins c ON c.bur_id = b.id
    WHERE b.id = $1
    GROUP BY b.id, b.name`,
    [req.params.id]
  );
  res.json(result.rows[0] || { name: null });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Baklager backend running on port ${PORT}`);
});
