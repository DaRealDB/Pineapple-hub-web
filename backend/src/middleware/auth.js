import jwt from 'jsonwebtoken';
import config from '../config.js';
import { query } from '../db.js';

/**
 * Express middleware — validates JWT bearer token and attaches user to request.
 * Rejects with 401 if token is missing, invalid, expired, or session is revoked.
 */
export async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed authorization header' });
  }

  const token = header.slice(7);

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Check session is still valid (not revoked, not expired)
  const { rows } = await query(
    `SELECT id FROM auth.sessions
     WHERE id = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [payload.sid]
  );

  if (rows.length === 0) {
    return res.status(401).json({ error: 'Session revoked or expired' });
  }

  req.user = {
    id: payload.sub,
    email: payload.email,
    role: payload.role,
    sessionId: payload.sid,
  };

  next();
}
