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

// Simple active session tracking (in-memory for now)
const activeSessions = new Map();

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
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (e) {
    res.status(500).json({ status: 'error', error: e.message });
  }
});

// --- AUTH / LOGIN ---
// Login with employee ID (simple session-based auth)
app.post('/api/auth/login', async (req, res) => {
  const { employee_id } = req.body;
  if (!employee_id) return res.status(400).json({ error: 'Employee ID required' });

  const result = await pool.query(`
    SELECT e.id, e.name, r.name as role
    FROM employees e
    JOIN roles r ON e.role_id = r.id
    WHERE e.id = $1
  `, [employee_id]);

  if (result.rows.length === 0) {
    return res.status(401).json({ error: 'Invalid employee ID' });
  }

  const employee = result.rows[0];
  const token = jwt.sign(
    { id: employee.id, name: employee.name, role: employee.role },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({ token, employee: { id: employee.id, name: employee.name, role: employee.role } });
});

// --- ADMIN ---
// Get all employees (admin only)
app.get('/api/admin/employees', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT e.id, e.name, r.name as role
      FROM employees e
      JOIN roles r ON e.role_id = r.id
      ORDER BY e.name
    `);
    res.json(result.rows);
  } catch (e) {
    console.error('DB Error in /api/admin/employees:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// --- RULLBURAR ---
// GET all wheelbarrows
app.get('/api/burar', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        b.id,
        b.name,
        b.x,
        b.y,
        b.color_status,
        b.created_at,
        c.checked_at,
        c.employee_id as checked_by_id,
        e.name as checked_by_name
      FROM burar b
      LEFT JOIN (
        SELECT DISTINCT ON (bur_id) *
        FROM checkins
        ORDER BY bur_id, checked_at DESC
      ) c ON c.bur_id = b.id
      LEFT JOIN employees e ON e.id = c.employee_id
      ORDER BY b.name ASC
    `);
    res.json(result.rows);
  } catch (e) {
    console.error('DB Error in /burar:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET single bur
app.get('/api/burar/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM burar WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST create bur (requires auth)
app.post('/api/burar', auth, async (req, res) => {
  try {
    const { name, x, y, color_status } = req.body;
    const result = await pool.query(
      'INSERT INTO burar (name, x, y, color_status) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, x || 10, y || 10, color_status || 'gron']
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT update bur (name, position, status color)
app.put('/api/burar/:id', auth, async (req, res) => {
  try {
    const { name, x, y, color_status } = req.body;
    const result = await pool.query(
      'UPDATE burar SET name = COALESCE($1, name), x = COALESCE($2, x), y = COALESCE($3, y), color_status = COALESCE($4, color_status), updated_at = NOW() WHERE id = $5 RETURNING *',
      [name, x, y, color_status, req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE bur
app.delete('/api/burar/:id', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM burar WHERE id = $1', [req.params.id]);
    res.json({ deleted: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- CHECK-IN ---
app.post('/api/checkin', auth, async (req, res) => {
  try {
    const { bur_id } = req.body;
    if (!bur_id) return res.status(400).json({ error: 'bur_id required' });

    const result = await pool.query(
      'INSERT INTO checkins (bur_id, employee_id, status) VALUES ($1, $2, $3) RETURNING *',
      [bur_id, req.employee.id, 'kollad']
    );

    // Reset bur to green after checkin
    await pool.query('UPDATE burar SET color_status = $1 WHERE id = $2', ['gron', bur_id]);

    res.json({ checkin: result.rows[0], bur_id, status: 'kollad' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- EMPLOYEES (User Management) ---
// GET all employees (admin only)
app.get('/api/employees', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name FROM employees ORDER BY name');
    res.json(result.rows);
  } catch (e) {
    console.error('DB Error in /api/employees:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/employees', auth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const result = await pool.query(
      'INSERT INTO employees (name) VALUES ($1) RETURNING id, name',
      [name]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/employees/:id', auth, async (req, res) => {
  try {
    const { name } = req.body;
    const result = await pool.query(
      'UPDATE employees SET name = $1 WHERE id = $2 RETURNING id, name',
      [name, req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/employees/:id', auth, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM employees WHERE id = $1', [req.params.id]);
    res.json({ deleted: result.rowCount > 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- STATISTICS ---
app.get('/api/stats/bur/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
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
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Baklager backend running on port ${PORT}`);
});