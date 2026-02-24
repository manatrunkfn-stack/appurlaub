'use strict';

const request = require('supertest');
const path = require('path');
const fs = require('fs');

// Use a test-specific database file so we don't clobber production data
const TEST_DB = path.join(__dirname, 'test.db');
process.env.DB_PATH = TEST_DB;
process.env.JWT_SECRET = 'test-secret';

const { app, closeDb } = require('../server');

// ─── Helpers ──────────────────────────────────────────────────────────────────
let token1, token2, spotId;

async function register(username, password) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ username, password });
  return res;
}

async function login(username, password) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username, password });
  return res;
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────
beforeAll(async () => {
  // Remove any existing test DB for a clean state
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
});

afterAll(() => {
  closeDb();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
});

// ─── Auth ─────────────────────────────────────────────────────────────────────
describe('POST /api/auth/register', () => {
  test('registers a new user and returns a JWT', async () => {
    const res = await register('alice', 'password1');
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.username).toBe('alice');
    token1 = res.body.token;
  });

  test('registers a second user', async () => {
    const res = await register('bob', 'password2');
    expect(res.status).toBe(201);
    token2 = res.body.token;
  });

  test('rejects duplicate username', async () => {
    const res = await register('alice', 'other1');
    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error');
  });

  test('rejects short username', async () => {
    const res = await register('ab', 'password1');
    expect(res.status).toBe(400);
  });

  test('rejects short password', async () => {
    const res = await register('newuser', '123');
    expect(res.status).toBe(400);
  });

  test('rejects missing fields', async () => {
    const res = await request(app).post('/api/auth/register').send({ username: 'x' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  test('logs in with correct credentials', async () => {
    const res = await login('alice', 'password1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  test('rejects wrong password', async () => {
    const res = await login('alice', 'wrongpass');
    expect(res.status).toBe(401);
  });

  test('rejects unknown user', async () => {
    const res = await login('nobody', 'password1');
    expect(res.status).toBe(401);
  });

  test('rejects missing fields', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'alice' });
    expect(res.status).toBe(400);
  });
});

// ─── Spots ────────────────────────────────────────────────────────────────────
describe('POST /api/spots', () => {
  test('creates a spot when authenticated', async () => {
    const res = await request(app)
      .post('/api/spots')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        title: 'Hidden Beach',
        description: 'A beautiful hidden beach with crystal clear water.',
        region: 'Europe',
        location: 'Sardinia, Italy',
        imageUrl: 'https://example.com/beach.jpg',
      });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.title).toBe('Hidden Beach');
    spotId = res.body.id;
  });

  test('rejects unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/spots')
      .send({ title: 'X', description: 'Y', region: 'Europe', location: 'Z' });
    expect(res.status).toBe(401);
  });

  test('rejects invalid region', async () => {
    const res = await request(app)
      .post('/api/spots')
      .set('Authorization', `Bearer ${token1}`)
      .send({ title: 'X', description: 'Y', region: 'Antarctica', location: 'Z' });
    expect(res.status).toBe(400);
  });

  test('rejects missing required fields', async () => {
    const res = await request(app)
      .post('/api/spots')
      .set('Authorization', `Bearer ${token1}`)
      .send({ title: 'Only title' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/spots', () => {
  test('returns list of spots', async () => {
    const res = await request(app).get('/api/spots');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('filters by region', async () => {
    const res = await request(app).get('/api/spots?region=Europe');
    expect(res.status).toBe(200);
    expect(res.body.every(s => s.region === 'Europe')).toBe(true);
  });

  test('returns empty array for region with no spots', async () => {
    const res = await request(app).get('/api/spots?region=Oceania');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('sorts by beautiful', async () => {
    const res = await request(app).get('/api/spots?sort=beautiful');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /api/spots/:id', () => {
  test('returns a single spot with ratings array', async () => {
    const res = await request(app).get(`/api/spots/${spotId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(spotId);
    expect(res.body).toHaveProperty('ratings');
    expect(Array.isArray(res.body.ratings)).toBe(true);
  });

  test('returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/spots/999999');
    expect(res.status).toBe(404);
  });

  test('returns 400 for non-numeric id', async () => {
    const res = await request(app).get('/api/spots/abc');
    expect(res.status).toBe(400);
  });
});

// ─── Ratings ──────────────────────────────────────────────────────────────────
describe('POST /api/spots/:id/rate', () => {
  test('bob can rate alice\'s spot as beautiful', async () => {
    const res = await request(app)
      .post(`/api/spots/${spotId}/rate`)
      .set('Authorization', `Bearer ${token2}`)
      .send({ type: 'beautiful' });
    expect(res.status).toBe(200);
    expect(res.body.beautiful_count).toBe(1);
  });

  test('bob can also rate the same spot as dangerous', async () => {
    const res = await request(app)
      .post(`/api/spots/${spotId}/rate`)
      .set('Authorization', `Bearer ${token2}`)
      .send({ type: 'dangerous' });
    expect(res.status).toBe(200);
    expect(res.body.dangerous_count).toBe(1);
  });

  test('alice cannot rate her own spot', async () => {
    const res = await request(app)
      .post(`/api/spots/${spotId}/rate`)
      .set('Authorization', `Bearer ${token1}`)
      .send({ type: 'beautiful' });
    expect(res.status).toBe(403);
  });

  test('rejects invalid rating type', async () => {
    const res = await request(app)
      .post(`/api/spots/${spotId}/rate`)
      .set('Authorization', `Bearer ${token2}`)
      .send({ type: 'great' });
    expect(res.status).toBe(400);
  });

  test('rejects unauthenticated rating', async () => {
    const res = await request(app)
      .post(`/api/spots/${spotId}/rate`)
      .send({ type: 'beautiful' });
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/spots/:id/rate/:type', () => {
  test('bob can remove his beautiful rating', async () => {
    const res = await request(app)
      .delete(`/api/spots/${spotId}/rate/beautiful`)
      .set('Authorization', `Bearer ${token2}`);
    expect(res.status).toBe(200);
    expect(res.body.beautiful_count).toBe(0);
  });

  test('returns 404 when trying to remove a non-existent rating', async () => {
    const res = await request(app)
      .delete(`/api/spots/${spotId}/rate/beautiful`)
      .set('Authorization', `Bearer ${token2}`);
    expect(res.status).toBe(404);
  });

  test('rejects invalid type in delete', async () => {
    const res = await request(app)
      .delete(`/api/spots/${spotId}/rate/great`)
      .set('Authorization', `Bearer ${token2}`);
    expect(res.status).toBe(400);
  });

  test('rejects unauthenticated delete', async () => {
    const res = await request(app).delete(`/api/spots/${spotId}/rate/dangerous`);
    expect(res.status).toBe(401);
  });
});
