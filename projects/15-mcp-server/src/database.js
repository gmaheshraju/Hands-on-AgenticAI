/**
 * database.js — SQLite setup with sample e-commerce data
 *
 * Creates a small e-commerce database with:
 *  - users (~50 rows)
 *  - products (~30 rows)
 *  - orders (~200 rows)
 *  - order_items (~500 rows)
 *  - categories (~8 rows)
 *
 * Total: ~800 rows of realistic sample data.
 */

import Database from "better-sqlite3";
import { randomInt } from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "ecommerce.db");

// ── Seed data ──────────────────────────────────────────────

const FIRST_NAMES = [
  "Alice", "Bob", "Carol", "Dave", "Eve", "Frank", "Grace", "Hank",
  "Ivy", "Jack", "Karen", "Leo", "Mona", "Nate", "Olivia", "Pete",
  "Quinn", "Rita", "Sam", "Tina", "Uma", "Vic", "Wendy", "Xander",
  "Yara", "Zane", "Amit", "Priya", "Raj", "Sneha", "Kiran", "Divya",
  "Arjun", "Meera", "Rohan", "Anita", "Vikram", "Neha", "Suresh", "Pooja",
  "Deepak", "Kavita", "Manish", "Swati", "Rahul", "Nisha", "Arun", "Lata",
  "Gaurav", "Ritu"
];

const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
  "Davis", "Rodriguez", "Martinez", "Patel", "Shah", "Kumar", "Singh",
  "Gupta", "Sharma", "Reddy", "Iyer", "Nair", "Joshi"
];

const CATEGORIES = [
  { name: "Electronics",     description: "Phones, laptops, gadgets" },
  { name: "Books",           description: "Fiction, non-fiction, textbooks" },
  { name: "Clothing",        description: "Men and women apparel" },
  { name: "Home & Kitchen",  description: "Appliances, decor, cookware" },
  { name: "Sports",          description: "Equipment, activewear" },
  { name: "Toys",            description: "Games, puzzles, outdoor play" },
  { name: "Health",          description: "Supplements, personal care" },
  { name: "Grocery",         description: "Pantry staples, snacks" },
];

const PRODUCTS = [
  { name: "Wireless Earbuds",        category: "Electronics",    price: 2999 },
  { name: "USB-C Hub",               category: "Electronics",    price: 1499 },
  { name: "Mechanical Keyboard",     category: "Electronics",    price: 4599 },
  { name: "Webcam HD",               category: "Electronics",    price: 3299 },
  { name: "Portable SSD 1TB",        category: "Electronics",    price: 6999 },
  { name: "Clean Code",              category: "Books",          price: 599 },
  { name: "Designing Data Apps",     category: "Books",          price: 749 },
  { name: "The Pragmatic Programmer",category: "Books",          price: 699 },
  { name: "System Design Interview", category: "Books",          price: 499 },
  { name: "Cotton T-Shirt",          category: "Clothing",       price: 499 },
  { name: "Denim Jeans",             category: "Clothing",       price: 1299 },
  { name: "Running Shoes",           category: "Clothing",       price: 2499 },
  { name: "Winter Jacket",           category: "Clothing",       price: 3999 },
  { name: "Blender",                 category: "Home & Kitchen", price: 2199 },
  { name: "Air Fryer",               category: "Home & Kitchen", price: 4999 },
  { name: "Coffee Maker",            category: "Home & Kitchen", price: 3499 },
  { name: "Yoga Mat",                category: "Sports",         price: 899 },
  { name: "Dumbbells 5kg Pair",      category: "Sports",         price: 1499 },
  { name: "Cricket Bat",             category: "Sports",         price: 2999 },
  { name: "Badminton Racket",        category: "Sports",         price: 1199 },
  { name: "Board Game Set",          category: "Toys",           price: 799 },
  { name: "LEGO City Set",           category: "Toys",           price: 2499 },
  { name: "Puzzle 1000pc",           category: "Toys",           price: 599 },
  { name: "Vitamin D3 Tablets",      category: "Health",         price: 349 },
  { name: "Protein Powder 1kg",      category: "Health",         price: 1899 },
  { name: "Hand Sanitizer 500ml",    category: "Health",         price: 199 },
  { name: "Basmati Rice 5kg",        category: "Grocery",        price: 499 },
  { name: "Olive Oil 1L",            category: "Grocery",        price: 699 },
  { name: "Dark Chocolate Bar",      category: "Grocery",        price: 149 },
  { name: "Green Tea 100 bags",      category: "Grocery",        price: 299 },
];

const ORDER_STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled"];

// ── Helpers ────────────────────────────────────────────────

function pick(arr) {
  return arr[randomInt(0, arr.length)];
}

function randomDate(startYear, endYear) {
  const start = new Date(startYear, 0, 1).getTime();
  const end   = new Date(endYear, 11, 31).getTime();
  const ts    = start + Math.random() * (end - start);
  return new Date(ts).toISOString().slice(0, 19).replace("T", " ");
}

// ── Database creation ──────────────────────────────────────

export function createDatabase(dbPath = DB_PATH) {
  const db = new Database(dbPath);

  // Enable WAL for better concurrent reads
  db.pragma("journal_mode = WAL");

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      email      TEXT NOT NULL UNIQUE,
      city       TEXT,
      joined_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      category_id INTEGER REFERENCES categories(id),
      price_cents INTEGER NOT NULL,
      stock       INTEGER DEFAULT 100,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER REFERENCES users(id),
      status      TEXT DEFAULT 'pending',
      total_cents INTEGER DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id   INTEGER REFERENCES orders(id),
      product_id INTEGER REFERENCES products(id),
      quantity   INTEGER NOT NULL DEFAULT 1,
      unit_price INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_orders_user    ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_items_order    ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_products_cat   ON products(category_id);
  `);

  return db;
}

export function seedDatabase(db) {
  // Check if already seeded
  const count = db.prepare("SELECT COUNT(*) as c FROM categories").get();
  if (count.c > 0) return db;

  const insertCategory = db.prepare(
    "INSERT INTO categories (name, description) VALUES (?, ?)"
  );
  const insertUser = db.prepare(
    "INSERT INTO users (name, email, city, joined_at) VALUES (?, ?, ?, ?)"
  );
  const insertProduct = db.prepare(
    "INSERT INTO products (name, category_id, price_cents, stock) VALUES (?, ?, ?, ?)"
  );
  const insertOrder = db.prepare(
    "INSERT INTO orders (user_id, status, total_cents, created_at) VALUES (?, ?, ?, ?)"
  );
  const insertItem = db.prepare(
    "INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)"
  );

  const tx = db.transaction(() => {
    // Categories
    const catMap = {};
    for (const cat of CATEGORIES) {
      const info = insertCategory.run(cat.name, cat.description);
      catMap[cat.name] = info.lastInsertRowid;
    }

    // Users (50)
    const cities = ["Mumbai", "Delhi", "Bangalore", "Chennai", "Pune",
                    "Hyderabad", "Kolkata", "Jaipur", "Ahmedabad", "Lucknow"];
    const userIds = [];
    for (let i = 0; i < 50; i++) {
      const first = FIRST_NAMES[i];
      const last  = pick(LAST_NAMES);
      const email = `${first.toLowerCase()}.${last.toLowerCase()}${i}@example.com`;
      const info  = insertUser.run(
        `${first} ${last}`, email, pick(cities),
        randomDate(2023, 2025)
      );
      userIds.push(Number(info.lastInsertRowid));
    }

    // Products (30)
    const productRows = [];
    for (const p of PRODUCTS) {
      const info = insertProduct.run(
        p.name, catMap[p.category], p.price, randomInt(10, 500)
      );
      productRows.push({ id: Number(info.lastInsertRowid), price: p.price });
    }

    // Orders (~200) with order_items (~500)
    for (let i = 0; i < 200; i++) {
      const userId = pick(userIds);
      const status = pick(ORDER_STATUSES);
      const date   = randomDate(2024, 2026);

      const orderInfo = insertOrder.run(userId, status, 0, date);
      const orderId   = Number(orderInfo.lastInsertRowid);

      // 1-5 items per order
      const numItems = randomInt(1, 6);
      let total = 0;
      for (let j = 0; j < numItems; j++) {
        const product = pick(productRows);
        const qty     = randomInt(1, 4);
        insertItem.run(orderId, product.id, qty, product.price);
        total += product.price * qty;
      }

      // Update order total
      db.prepare("UPDATE orders SET total_cents = ? WHERE id = ?").run(total, orderId);
    }
  });

  tx();
  return db;
}

export function getDatabase(dbPath = DB_PATH) {
  const db = createDatabase(dbPath);
  seedDatabase(db);
  return db;
}

// Run directly to seed
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = getDatabase();
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  ).all();

  console.log("Database seeded successfully!");
  for (const t of tables) {
    const row = db.prepare(`SELECT COUNT(*) as c FROM ${t.name}`).get();
    console.log(`  ${t.name}: ${row.c} rows`);
  }
  db.close();
}
