'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set.');
  process.exit(1);
}
const SALT_ROUNDS = 10;

// ── Database ──────────────────────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'appurlaub.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    username     TEXT    NOT NULL UNIQUE,
    email        TEXT    NOT NULL UNIQUE,
    password_hash TEXT   NOT NULL,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS posts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title         TEXT    NOT NULL,
    description   TEXT    NOT NULL,
    region        TEXT    NOT NULL,
    location_name TEXT    NOT NULL,
    image_url     TEXT,
    category      TEXT    NOT NULL CHECK(category IN ('BEAUTIFUL','DANGEROUS')),
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ratings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id     INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    rating_type TEXT    NOT NULL CHECK(rating_type IN ('BEAUTIFUL','DANGEROUS')),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, post_id)
  );
`);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Anfragen. Bitte später erneut versuchen.' },
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Anfragen. Bitte später erneut versuchen.' },
});

// Auth middleware
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Nicht authentifiziert' });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Ungültiger oder abgelaufener Token' });
  }
}

// ── Prepared statements ───────────────────────────────────────────────────────
const stmts = {
  createUser: db.prepare(
    'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
  ),
  findUserByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  findUserById:    db.prepare('SELECT id, username, email, created_at FROM users WHERE id = ?'),

  createPost: db.prepare(`
    INSERT INTO posts (user_id, title, description, region, location_name, image_url, category)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  getPostById: db.prepare(`
    SELECT p.*, u.username,
      (SELECT COUNT(*) FROM ratings WHERE post_id = p.id AND rating_type = 'BEAUTIFUL') AS beautiful_count,
      (SELECT COUNT(*) FROM ratings WHERE post_id = p.id AND rating_type = 'DANGEROUS') AS dangerous_count
    FROM posts p JOIN users u ON p.user_id = u.id
    WHERE p.id = ?
  `),
  deletePost: db.prepare('DELETE FROM posts WHERE id = ? AND user_id = ?'),

  upsertRating: db.prepare(`
    INSERT INTO ratings (user_id, post_id, rating_type) VALUES (?, ?, ?)
    ON CONFLICT(user_id, post_id) DO UPDATE SET rating_type = excluded.rating_type, created_at = datetime('now')
  `),
  deleteRating: db.prepare('DELETE FROM ratings WHERE user_id = ? AND post_id = ?'),
  getUserRating: db.prepare('SELECT rating_type FROM ratings WHERE user_id = ? AND post_id = ?'),

  getRegions: db.prepare('SELECT DISTINCT region FROM posts ORDER BY region ASC'),
};

// ── Helper: build posts query dynamically ────────────────────────────────────
function getPosts(filters, userId) {
  let sql = `
    SELECT p.*, u.username,
      (SELECT COUNT(*) FROM ratings WHERE post_id = p.id AND rating_type = 'BEAUTIFUL') AS beautiful_count,
      (SELECT COUNT(*) FROM ratings WHERE post_id = p.id AND rating_type = 'DANGEROUS') AS dangerous_count
      ${userId ? ", (SELECT rating_type FROM ratings WHERE user_id = @userId AND post_id = p.id) AS user_rating" : ''}
    FROM posts p JOIN users u ON p.user_id = u.id
    WHERE 1=1
  `;
  const params = {};
  if (userId) params.userId = userId;

  if (filters.category) {
    sql += ' AND p.category = @category';
    params.category = filters.category;
  }
  if (filters.region) {
    sql += ' AND p.region = @region';
    params.region = filters.region;
  }
  sql += ' ORDER BY p.created_at DESC';
  return db.prepare(sql).all(params);
}

// ── Auth routes ───────────────────────────────────────────────────────────────
app.post('/api/auth/register', authLimiter, async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Alle Felder sind erforderlich' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen haben' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Ungültige E-Mail-Adresse' });
  }
  if (username.trim().length < 2) {
    return res.status(400).json({ error: 'Benutzername muss mindestens 2 Zeichen haben' });
  }

  try {
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const info = stmts.createUser.run(username.trim(), email.toLowerCase().trim(), hash);
    const token = jwt.sign({ id: info.lastInsertRowid, username: username.trim() }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, username: username.trim() });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      if (err.message.includes('email')) return res.status(409).json({ error: 'E-Mail bereits registriert' });
      if (err.message.includes('username')) return res.status(409).json({ error: 'Benutzername bereits vergeben' });
    }
    res.status(500).json({ error: 'Registrierung fehlgeschlagen' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' });

  const user = stmts.findUserByEmail.get(email.toLowerCase().trim());
  const passwordMatch = user && await bcrypt.compare(password, user.password_hash);
  if (!user || !passwordMatch) {
    return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
  }
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username: user.username });
});

// ── Post routes ───────────────────────────────────────────────────────────────
app.get('/api/posts', apiLimiter, (req, res) => {
  let userId = null;
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try { userId = jwt.verify(header.slice(7), JWT_SECRET).id; } catch { /* ignore */ }
  }

  const { category, region } = req.query;
  const filters = {};
  if (category && ['BEAUTIFUL', 'DANGEROUS'].includes(category)) filters.category = category;
  if (region) filters.region = region;

  res.json(getPosts(filters, userId));
});

app.post('/api/posts', apiLimiter, requireAuth, (req, res) => {
  const { title, description, region, location_name, image_url, category } = req.body;

  if (!title || !description || !region || !location_name || !category) {
    return res.status(400).json({ error: 'Pflichtfelder fehlen' });
  }
  if (!['BEAUTIFUL', 'DANGEROUS'].includes(category)) {
    return res.status(400).json({ error: 'Ungültige Kategorie' });
  }
  if (title.trim().length < 3) return res.status(400).json({ error: 'Titel zu kurz (min. 3 Zeichen)' });
  if (description.trim().length < 10) return res.status(400).json({ error: 'Beschreibung zu kurz (min. 10 Zeichen)' });

  // Validate image_url if provided
  const imgUrl = image_url && image_url.trim() ? image_url.trim() : null;
  if (imgUrl && !/^https?:\/\/.+/.test(imgUrl)) {
    return res.status(400).json({ error: 'Bild-URL muss mit http:// oder https:// beginnen' });
  }

  const info = stmts.createPost.run(
    req.user.id,
    title.trim(), description.trim(), region.trim(), location_name.trim(),
    imgUrl, category
  );
  const post = stmts.getPostById.get(info.lastInsertRowid);
  res.status(201).json(post);
});

app.get('/api/posts/:id', apiLimiter, (req, res) => {
  const post = stmts.getPostById.get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Beitrag nicht gefunden' });

  let userRating = null;
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(header.slice(7), JWT_SECRET);
      const r = stmts.getUserRating.get(decoded.id, post.id);
      if (r) userRating = r.rating_type;
    } catch { /* ignore */ }
  }
  res.json({ ...post, user_rating: userRating });
});

app.post('/api/posts/:id/rate', apiLimiter, requireAuth, (req, res) => {
  const { rating_type } = req.body;
  if (!['BEAUTIFUL', 'DANGEROUS'].includes(rating_type)) {
    return res.status(400).json({ error: 'Ungültiger Bewertungstyp' });
  }
  const post = stmts.getPostById.get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Beitrag nicht gefunden' });

  stmts.upsertRating.run(req.user.id, post.id, rating_type);
  const updated = stmts.getPostById.get(post.id);
  res.json({ ...updated, user_rating: rating_type });
});

app.delete('/api/posts/:id/rate', apiLimiter, requireAuth, (req, res) => {
  const post = stmts.getPostById.get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Beitrag nicht gefunden' });

  stmts.deleteRating.run(req.user.id, post.id);
  const updated = stmts.getPostById.get(post.id);
  res.json({ ...updated, user_rating: null });
});

app.delete('/api/posts/:id', apiLimiter, requireAuth, (req, res) => {
  const post = stmts.getPostById.get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Beitrag nicht gefunden' });
  if (post.user_id !== req.user.id) return res.status(403).json({ error: 'Keine Berechtigung' });

  stmts.deletePost.run(req.params.id, req.user.id);
  res.json({ message: 'Beitrag gelöscht' });
});

// ── Regions ───────────────────────────────────────────────────────────────────
app.get('/api/regions', apiLimiter, (req, res) => {
  const rows = stmts.getRegions.all();
  res.json(rows.map(r => r.region));
});

// ── Catch-all → SPA ───────────────────────────────────────────────────────────
app.get('*', apiLimiter, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`AppUrlaub server running on http://localhost:${PORT}`);
});
