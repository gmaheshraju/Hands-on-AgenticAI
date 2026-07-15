/**
 * database.js — SQLite setup with schema + 10K+ rows of realistic e-commerce data.
 *
 * Tables: users, products, orders, events
 * All data is generated deterministically (seeded PRNG) so results are reproducible.
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'analytics.db');

// ── Seeded PRNG (Mulberry32) for reproducible data ──────────────────────────
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(42);

function randInt(min, max) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(rand() * arr.length)];
}

function pickWeighted(items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// ── Reference data ──────────────────────────────────────────────────────────

const FIRST_NAMES = [
  'James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda',
  'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
  'Thomas', 'Sarah', 'Christopher', 'Karen', 'Charles', 'Lisa', 'Daniel', 'Nancy',
  'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra', 'Donald', 'Ashley',
  'Steven', 'Dorothy', 'Paul', 'Kimberly', 'Andrew', 'Emily', 'Joshua', 'Donna',
  'Raj', 'Priya', 'Amit', 'Sunita', 'Wei', 'Yuki', 'Carlos', 'Maria', 'Ahmed', 'Fatima',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Wilson', 'Anderson', 'Thomas',
  'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White',
  'Harris', 'Clark', 'Patel', 'Kumar', 'Singh', 'Chen', 'Wang', 'Kim', 'Tanaka',
];

const PLANS = ['free', 'starter', 'pro', 'enterprise'];
const PLAN_WEIGHTS = [40, 30, 20, 10];

const PRODUCT_CATALOG = [
  // { name, category, price }
  { name: 'Basic Monthly', category: 'subscription', price: 9.99 },
  { name: 'Starter Monthly', category: 'subscription', price: 29.99 },
  { name: 'Pro Monthly', category: 'subscription', price: 79.99 },
  { name: 'Enterprise Monthly', category: 'subscription', price: 299.99 },
  { name: 'Pro Annual', category: 'subscription', price: 799.99 },
  { name: 'Enterprise Annual', category: 'subscription', price: 2999.99 },
  { name: 'API Add-on 10K', category: 'add-on', price: 49.99 },
  { name: 'API Add-on 100K', category: 'add-on', price: 199.99 },
  { name: 'API Add-on 1M', category: 'add-on', price: 499.99 },
  { name: 'Storage 100GB', category: 'add-on', price: 19.99 },
  { name: 'Storage 1TB', category: 'add-on', price: 99.99 },
  { name: 'Premium Support', category: 'service', price: 149.99 },
  { name: 'Onboarding Package', category: 'service', price: 999.99 },
  { name: 'Custom Integration', category: 'service', price: 2499.99 },
  { name: 'Training Workshop', category: 'service', price: 1499.99 },
  { name: 'Data Export Tool', category: 'tool', price: 39.99 },
  { name: 'Analytics Dashboard', category: 'tool', price: 59.99 },
  { name: 'Team Collaboration', category: 'tool', price: 24.99 },
  { name: 'Security Audit', category: 'service', price: 3999.99 },
  { name: 'Compliance Pack', category: 'add-on', price: 249.99 },
];

const ORDER_STATUSES = ['completed', 'pending', 'refunded', 'cancelled'];
const ORDER_STATUS_WEIGHTS = [70, 15, 10, 5];

const EVENT_TYPES = [
  'page_view', 'page_view', 'page_view',  // 3x weight
  'button_click', 'button_click',
  'form_submit',
  'login', 'logout',
  'search',
  'add_to_cart', 'remove_from_cart',
  'checkout_start', 'checkout_complete',
  'api_call',
  'error',
  'feature_flag_eval',
];

const PAGES = [
  '/dashboard', '/settings', '/billing', '/profile', '/analytics',
  '/integrations', '/docs', '/api-keys', '/team', '/reports',
  '/onboarding', '/support', '/changelog', '/pricing', '/home',
];

const FEATURES = [
  'dark_mode', 'new_editor', 'ai_assistant', 'batch_export',
  'advanced_filters', 'real_time_collab', 'api_v2', 'sso',
];

// ── Date helpers ────────────────────────────────────────────────────────────

function randomDate(start, end) {
  const s = start.getTime();
  const e = end.getTime();
  return new Date(s + rand() * (e - s));
}

function formatDate(d) {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

// ── Schema creation ─────────────────────────────────────────────────────────

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY,
      name          TEXT    NOT NULL,
      email         TEXT    NOT NULL UNIQUE,
      plan          TEXT    NOT NULL CHECK(plan IN ('free','starter','pro','enterprise')),
      created_at    TEXT    NOT NULL,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS products (
      id        INTEGER PRIMARY KEY,
      name      TEXT    NOT NULL,
      category  TEXT    NOT NULL,
      price     REAL    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id          INTEGER PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      product_id  INTEGER NOT NULL REFERENCES products(id),
      amount      REAL    NOT NULL,
      status      TEXT    NOT NULL CHECK(status IN ('completed','pending','refunded','cancelled')),
      created_at  TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id          INTEGER PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      event_type  TEXT    NOT NULL,
      properties  TEXT,
      timestamp   TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_orders_user      ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_product   ON orders(product_id);
    CREATE INDEX IF NOT EXISTS idx_orders_created    ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_events_user       ON events(user_id);
    CREATE INDEX IF NOT EXISTS idx_events_type       ON events(event_type);
    CREATE INDEX IF NOT EXISTS idx_events_timestamp  ON events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_users_plan        ON users(plan);
    CREATE INDEX IF NOT EXISTS idx_users_created     ON users(created_at);
  `);
}

// ── Data generation ─────────────────────────────────────────────────────────

function seedProducts(db) {
  const insert = db.prepare(
    'INSERT INTO products (name, category, price) VALUES (?, ?, ?)'
  );
  const tx = db.transaction(() => {
    for (const p of PRODUCT_CATALOG) {
      insert.run(p.name, p.category, p.price);
    }
  });
  tx();
  return PRODUCT_CATALOG.length;
}

function seedUsers(db, count = 2000) {
  const insert = db.prepare(
    'INSERT INTO users (name, email, plan, created_at, last_login_at) VALUES (?, ?, ?, ?, ?)'
  );
  const startDate = new Date('2022-01-01');
  const endDate = new Date('2024-12-31');

  const tx = db.transaction(() => {
    const usedEmails = new Set();
    for (let i = 0; i < count; i++) {
      const first = pick(FIRST_NAMES);
      const last = pick(LAST_NAMES);
      const name = `${first} ${last}`;

      // Ensure unique email
      let email;
      let attempt = 0;
      do {
        const suffix = attempt > 0 ? attempt : '';
        email = `${first.toLowerCase()}.${last.toLowerCase()}${suffix}@example.com`;
        attempt++;
      } while (usedEmails.has(email));
      usedEmails.add(email);

      const plan = pickWeighted(PLANS, PLAN_WEIGHTS);
      const createdAt = randomDate(startDate, endDate);
      const lastLogin = rand() > 0.1
        ? formatDate(randomDate(createdAt, endDate))
        : null;

      insert.run(name, email, plan, formatDate(createdAt), lastLogin);
    }
  });
  tx();
  return count;
}

function seedOrders(db, count = 5000) {
  const userIds = db.prepare('SELECT id FROM users').all().map(r => r.id);
  const productIds = db.prepare('SELECT id, price FROM products').all();

  const insert = db.prepare(
    'INSERT INTO orders (user_id, product_id, amount, status, created_at) VALUES (?, ?, ?, ?, ?)'
  );

  const startDate = new Date('2023-01-01');
  const endDate = new Date('2024-12-31');

  const tx = db.transaction(() => {
    for (let i = 0; i < count; i++) {
      const userId = pick(userIds);
      const product = pick(productIds);
      // Slight price variation (+/- 10% for discounts/taxes)
      const amount = +(product.price * (0.9 + rand() * 0.2)).toFixed(2);
      const status = pickWeighted(ORDER_STATUSES, ORDER_STATUS_WEIGHTS);
      const createdAt = randomDate(startDate, endDate);
      insert.run(userId, product.id, amount, status, formatDate(createdAt));
    }
  });
  tx();
  return count;
}

function seedEvents(db, count = 8000) {
  const userIds = db.prepare('SELECT id FROM users').all().map(r => r.id);

  const insert = db.prepare(
    'INSERT INTO events (user_id, event_type, properties, timestamp) VALUES (?, ?, ?, ?)'
  );

  const startDate = new Date('2024-01-01');
  const endDate = new Date('2024-12-31');

  const tx = db.transaction(() => {
    for (let i = 0; i < count; i++) {
      const userId = pick(userIds);
      const eventType = pick(EVENT_TYPES);

      let properties = {};
      switch (eventType) {
        case 'page_view':
          properties = { page: pick(PAGES), duration_ms: randInt(500, 30000) };
          break;
        case 'button_click':
          properties = { button: pick(['save', 'cancel', 'submit', 'delete', 'export', 'share']), page: pick(PAGES) };
          break;
        case 'form_submit':
          properties = { form: pick(['signup', 'contact', 'settings', 'billing', 'feedback']), success: rand() > 0.1 };
          break;
        case 'search':
          properties = { query: pick(['pricing', 'api docs', 'integration', 'billing', 'export', 'sso', 'webhook']), results: randInt(0, 50) };
          break;
        case 'add_to_cart':
        case 'remove_from_cart':
          properties = { product_id: randInt(1, 20), quantity: randInt(1, 3) };
          break;
        case 'checkout_start':
        case 'checkout_complete':
          properties = { cart_value: +(rand() * 500 + 10).toFixed(2), items: randInt(1, 5) };
          break;
        case 'api_call':
          properties = { endpoint: pick(['/v1/data', '/v1/users', '/v1/reports', '/v1/export']), status: pick([200, 200, 200, 400, 500]), latency_ms: randInt(20, 2000) };
          break;
        case 'error':
          properties = { code: pick(['ERR_TIMEOUT', 'ERR_AUTH', 'ERR_VALIDATION', 'ERR_RATE_LIMIT']), page: pick(PAGES) };
          break;
        case 'feature_flag_eval':
          properties = { flag: pick(FEATURES), enabled: rand() > 0.3 };
          break;
        default:
          properties = {};
      }

      const timestamp = randomDate(startDate, endDate);
      insert.run(userId, eventType, JSON.stringify(properties), formatDate(timestamp));
    }
  });
  tx();
  return count;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Open (or create) the analytics database, seed data if empty.
 * Returns the better-sqlite3 Database instance.
 */
export function openDatabase(dbPath = DB_PATH) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createSchema(db);

  // Only seed if tables are empty
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (userCount === 0) {
    console.log('Seeding database with realistic e-commerce data...');
    const users = seedUsers(db);
    const products = seedProducts(db);
    const orders = seedOrders(db);
    const events = seedEvents(db);
    console.log(`  Users:    ${users.toLocaleString()}`);
    console.log(`  Products: ${products}`);
    console.log(`  Orders:   ${orders.toLocaleString()}`);
    console.log(`  Events:   ${events.toLocaleString()}`);
    console.log(`  Total:    ${(users + products + orders + events).toLocaleString()} rows`);
  }

  return db;
}

/**
 * Return the full schema as a string suitable for LLM context.
 * Includes table DDL, row counts, and sample values.
 */
export function getSchemaContext(db) {
  const tables = ['users', 'products', 'orders', 'events'];
  const parts = ['## Database Schema\n'];

  for (const table of tables) {
    // Get DDL
    const ddl = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name=?"
    ).get(table);

    // Get row count
    const count = db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get().c;

    // Get sample rows (3)
    const samples = db.prepare(`SELECT * FROM ${table} LIMIT 3`).all();

    parts.push(`### Table: ${table} (${count.toLocaleString()} rows)`);
    parts.push('```sql');
    parts.push(ddl.sql);
    parts.push('```');
    parts.push('');
    parts.push('Sample rows:');
    parts.push('```json');
    parts.push(JSON.stringify(samples, null, 2));
    parts.push('```');
    parts.push('');
  }

  parts.push('### Relationships');
  parts.push('- orders.user_id -> users.id');
  parts.push('- orders.product_id -> products.id');
  parts.push('- events.user_id -> users.id');
  parts.push('');
  parts.push('### Notes');
  parts.push('- All dates are stored as TEXT in "YYYY-MM-DD HH:MM:SS" format');
  parts.push('- orders.amount is the actual charged amount (may differ from products.price due to discounts)');
  parts.push('- events.properties is a JSON string');
  parts.push('- orders.status is one of: completed, pending, refunded, cancelled');
  parts.push('- users.plan is one of: free, starter, pro, enterprise');

  return parts.join('\n');
}

/**
 * Return the list of allowed table names.
 */
export function getAllowedTables() {
  return ['users', 'products', 'orders', 'events'];
}

// ── CLI: run directly to create the DB ──────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('database.js')) {
  const db = openDatabase();
  console.log('\nSchema context for LLM:');
  console.log(getSchemaContext(db));
  db.close();
}
