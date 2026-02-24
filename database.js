'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'appurlaub.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS spots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      region TEXT NOT NULL,
      location TEXT NOT NULL,
      image_url TEXT,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      spot_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('beautiful', 'dangerous')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(spot_id, user_id, type),
      FOREIGN KEY (spot_id) REFERENCES spots(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, closeDb };
