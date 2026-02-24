'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const { getDb, closeDb } = require('./database');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'appurlaub-secret-key';
const PORT = process.env.PORT || 3000;
const SALT_ROUNDS = 10;
const VALID_REGIONS = ['Europe', 'Asia', 'Africa', 'Americas', 'Oceania'];
const VALID_RATING_TYPES = ['beautiful', 'dangerous'];

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Auth middleware ──────────────────────────────────────────────────────────

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const token = authHeader.slice(7);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ─── Auth routes ─────────────────────────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  if (username.trim().length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  try {
    const db = getDb();
    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    const stmt = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)');
    const result = stmt.run(username.trim(), hashed);
    const token = jwt.sign({ id: result.lastInsertRowid, username: username.trim() }, JWT_SECRET, { expiresIn: '7d' });
    return res.status(201).json({ token, username: username.trim() });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || (err.message && err.message.includes('UNIQUE'))) {
      return res.status(409).json({ error: 'Username already taken' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  try {
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token, username: user.username });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ─── Spots routes ─────────────────────────────────────────────────────────────

app.get('/api/spots', (req, res) => {
  const { region, sort } = req.query;
  const db = getDb();

  let query = `
    SELECT
      s.id, s.title, s.description, s.region, s.location, s.image_url, s.created_at,
      u.username AS author,
      SUM(CASE WHEN r.type = 'beautiful' THEN 1 ELSE 0 END) AS beautiful_count,
      SUM(CASE WHEN r.type = 'dangerous' THEN 1 ELSE 0 END) AS dangerous_count
    FROM spots s
    JOIN users u ON s.user_id = u.id
    LEFT JOIN ratings r ON s.id = r.spot_id
  `;

  const params = [];
  if (region && VALID_REGIONS.includes(region)) {
    query += ' WHERE s.region = ?';
    params.push(region);
  }

  query += ' GROUP BY s.id';

  if (sort === 'beautiful') {
    query += ' ORDER BY beautiful_count DESC, s.created_at DESC';
  } else if (sort === 'dangerous') {
    query += ' ORDER BY dangerous_count DESC, s.created_at DESC';
  } else {
    query += ' ORDER BY s.created_at DESC';
  }

  try {
    const spots = db.prepare(query).all(...params);
    return res.json(spots);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/spots', authenticate, (req, res) => {
  const { title, description, region, location, imageUrl } = req.body;
  if (!title || !description || !region || !location) {
    return res.status(400).json({ error: 'title, description, region, and location are required' });
  }
  if (!VALID_REGIONS.includes(region)) {
    return res.status(400).json({ error: `region must be one of: ${VALID_REGIONS.join(', ')}` });
  }
  try {
    const db = getDb();
    const stmt = db.prepare(
      'INSERT INTO spots (title, description, region, location, image_url, user_id) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(title.trim(), description.trim(), region, location.trim(), imageUrl || null, req.user.id);
    const spot = db.prepare('SELECT s.*, u.username AS author FROM spots s JOIN users u ON s.user_id = u.id WHERE s.id = ?').get(result.lastInsertRowid);
    return res.status(201).json(spot);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/spots/:id', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid spot id' });

  const spot = db.prepare(`
    SELECT
      s.id, s.title, s.description, s.region, s.location, s.image_url, s.created_at,
      u.username AS author,
      SUM(CASE WHEN r.type = 'beautiful' THEN 1 ELSE 0 END) AS beautiful_count,
      SUM(CASE WHEN r.type = 'dangerous' THEN 1 ELSE 0 END) AS dangerous_count
    FROM spots s
    JOIN users u ON s.user_id = u.id
    LEFT JOIN ratings r ON s.id = r.spot_id
    WHERE s.id = ?
    GROUP BY s.id
  `).get(id);

  if (!spot) return res.status(404).json({ error: 'Spot not found' });

  const ratings = db.prepare('SELECT user_id, type FROM ratings WHERE spot_id = ?').all(id);
  return res.json({ ...spot, ratings });
});

app.post('/api/spots/:id/rate', authenticate, (req, res) => {
  const { type } = req.body;
  const spotId = parseInt(req.params.id, 10);
  if (isNaN(spotId)) return res.status(400).json({ error: 'Invalid spot id' });
  if (!VALID_RATING_TYPES.includes(type)) {
    return res.status(400).json({ error: 'type must be "beautiful" or "dangerous"' });
  }
  const db = getDb();
  const spot = db.prepare('SELECT id, user_id FROM spots WHERE id = ?').get(spotId);
  if (!spot) return res.status(404).json({ error: 'Spot not found' });
  if (spot.user_id === req.user.id) {
    return res.status(403).json({ error: 'You cannot rate your own spot' });
  }
  try {
    db.prepare('INSERT OR REPLACE INTO ratings (spot_id, user_id, type) VALUES (?, ?, ?)').run(spotId, req.user.id, type);
    const counts = db.prepare(`
      SELECT
        SUM(CASE WHEN type = 'beautiful' THEN 1 ELSE 0 END) AS beautiful_count,
        SUM(CASE WHEN type = 'dangerous' THEN 1 ELSE 0 END) AS dangerous_count
      FROM ratings WHERE spot_id = ?
    `).get(spotId);
    return res.json({ message: 'Rating saved', ...counts });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/spots/:id/rate/:type', authenticate, (req, res) => {
  const { type } = req.params;
  const spotId = parseInt(req.params.id, 10);
  if (isNaN(spotId)) return res.status(400).json({ error: 'Invalid spot id' });
  if (!VALID_RATING_TYPES.includes(type)) {
    return res.status(400).json({ error: 'type must be "beautiful" or "dangerous"' });
  }
  const db = getDb();
  const result = db.prepare('DELETE FROM ratings WHERE spot_id = ? AND user_id = ? AND type = ?').run(spotId, req.user.id, type);
  if (result.changes === 0) return res.status(404).json({ error: 'Rating not found' });
  const counts = db.prepare(`
    SELECT
      SUM(CASE WHEN type = 'beautiful' THEN 1 ELSE 0 END) AS beautiful_count,
      SUM(CASE WHEN type = 'dangerous' THEN 1 ELSE 0 END) AS dangerous_count
    FROM ratings WHERE spot_id = ?
  `).get(spotId);
  return res.json({ message: 'Rating removed', ...counts });
});

// ─── Seed data ────────────────────────────────────────────────────────────────

async function seedData() {
  const db = getDb();
  const existingUsers = db.prepare('SELECT COUNT(*) AS cnt FROM users').get();
  if (existingUsers.cnt > 0) return;

  const hashed = await bcrypt.hash('demo1234', SALT_ROUNDS);
  const userId = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run('demo', hashed).lastInsertRowid;

  const seeds = [
    {
      title: 'Hidden Coves of Sardinia',
      description: 'Tucked away from the tourist crowds, these crystalline coves on the eastern coast of Sardinia offer turquoise waters and white sand beaches accessible only by boat or a short hike through pine forests.',
      region: 'Europe',
      location: 'Orosei Gulf, Sardinia, Italy',
      image_url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
    },
    {
      title: 'Hsipaw Valley Trek',
      description: 'Far off the main traveler circuits, the Hsipaw Valley in northern Myanmar offers breathtaking mountain scenery, traditional Shan villages and tea plantations stretching to the horizon.',
      region: 'Asia',
      location: 'Hsipaw, Shan State, Myanmar',
      image_url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800',
    },
    {
      title: 'Erta Ale Lava Lake',
      description: 'One of only a handful of permanent lava lakes on Earth. The overnight trek across the Danakil Depression to reach this boiling cauldron is grueling but utterly unforgettable.',
      region: 'Africa',
      location: 'Afar Region, Ethiopia',
      image_url: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=800',
    },
    {
      title: 'Quebrada de Humahuaca',
      description: 'A narrow Andean mountain valley in northwest Argentina, UNESCO-listed for its stunning multicoloured rock formations, ancient pre-Inca ruins and vibrant indigenous culture.',
      region: 'Americas',
      location: 'Jujuy Province, Argentina',
      image_url: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=800',
    },
    {
      title: 'Muriwai Gannet Colony',
      description: 'A windswept black-sand surf beach just west of Auckland where thousands of Australasian gannets nest on dramatic cliff stacks – one of very few mainland gannet colonies in the world.',
      region: 'Oceania',
      location: 'Muriwai, Auckland Region, New Zealand',
      image_url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800',
    },
  ];

  const insert = db.prepare('INSERT INTO spots (title, description, region, location, image_url, user_id) VALUES (?, ?, ?, ?, ?, ?)');
  for (const s of seeds) {
    insert.run(s.title, s.description, s.region, s.location, s.image_url, userId);
  }
  console.log('Seed data inserted.');
}

// ─── Start ────────────────────────────────────────────────────────────────────

let server;

async function start() {
  await seedData();
  server = app.listen(PORT, () => {
    console.log(`Appurlaub server running on http://localhost:${PORT}`);
  });
  return server;
}

if (require.main === module) {
  start().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { app, start, closeDb };
