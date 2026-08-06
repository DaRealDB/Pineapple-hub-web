import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import config from '../config.js';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/auth/login
 * Body: { email: string, password: string }
 * Response: { token: string, user: { id, email, fullName, role } }
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const { rows: users } = await query(
      `SELECT u.id, u.email, u.password_hash, u.full_name, u.is_active, r.name AS role
       FROM auth.users u
       JOIN auth.roles r ON r.id = u.role_id
       WHERE u.email = $1`,
      [email.toLowerCase().trim()]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = users[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Create session
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
    const { rows: sessions } = await query(
      `INSERT INTO auth.sessions (user_id, expires_at)
       VALUES ($1, $2) RETURNING id`,
      [user.id, expiresAt]
    );
    const sessionId = sessions[0].id;

    // Update last login
    await query('UPDATE auth.users SET last_login_at = now() WHERE id = $1', [user.id]);

    // Issue JWT
    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        sid: sessionId,
      },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/logout
 * Requires: Authorization header
 * Revokes the current session.
 */
router.post('/logout', authenticate, async (req, res) => {
  try {
    await query(
      'UPDATE auth.sessions SET revoked_at = now() WHERE id = $1',
      [req.user.sessionId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[Auth] Logout error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/auth/me
 * Requires: Authorization header
 * Returns current user info with permissions.
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.email, u.full_name, u.is_active, u.last_login_at, r.name AS role
       FROM auth.users u
       JOIN auth.roles r ON r.id = u.role_id
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const u = rows[0];

    // Get permissions for this user's role
    const { rows: perms } = await query(
      `SELECT p.key
       FROM auth.permissions p
       JOIN auth.role_permissions rp ON rp.permission_id = p.id
       JOIN auth.roles r ON r.id = rp.role_id
       WHERE r.name = $1`,
      [u.role]
    );

    res.json({
      user: {
        id: u.id,
        email: u.email,
        fullName: u.full_name,
        role: u.role,
        lastLoginAt: u.last_login_at,
        permissions: perms.map((p) => p.key),
      },
    });
  } catch (err) {
    console.error('[Auth] Me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/register
 * Body: { email: string, password: string, fullName: string }
 * Response: { token: string, user: { id, email, fullName, role } }
 *
 * Open registration — new users default to the 'employee' role.
 * Returns a JWT so the user is logged in immediately after signup.
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, fullName } = req.body;

    if (!email || !password || !fullName) {
      return res.status(400).json({ error: 'Email, password, and full name are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check for existing user
    const { rows: existing } = await query(
      'SELECT id FROM auth.users WHERE email = $1',
      [normalizedEmail]
    );

    if (existing.length > 0) {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }

    // Hash password and insert
    const passwordHash = await bcrypt.hash(password, 10);

    const { rows: users } = await query(
      `INSERT INTO auth.users (email, password_hash, full_name, role_id)
       VALUES ($1, $2, $3, (SELECT id FROM auth.roles WHERE name = 'employee'))
       RETURNING id, email, full_name`,
      [normalizedEmail, passwordHash, fullName.trim()]
    );

    const user = users[0];

    // Create session and issue JWT (same pattern as login)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const { rows: sessions } = await query(
      'INSERT INTO auth.sessions (user_id, expires_at) VALUES ($1, $2) RETURNING id',
      [user.id, expiresAt]
    );

    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: 'employee',
        sid: sessions[0].id,
      },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: 'employee',
      },
    });
  } catch (err) {
    console.error('[Auth] Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
