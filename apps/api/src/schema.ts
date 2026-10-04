export const schemaVersion = 3;
export const schemaSQL = `
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','customer')),
 points INTEGER NOT NULL DEFAULT 0 CHECK(points >= 0), auth_version INTEGER NOT NULL DEFAULT 1,
 deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS refresh_sessions (
 token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at TEXT NOT NULL,created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS categories(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE,icon TEXT NOT NULL DEFAULT 'basket',sort_order INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS products (
 id TEXT PRIMARY KEY,sku TEXT NOT NULL UNIQUE,name TEXT NOT NULL,category_id TEXT NOT NULL REFERENCES categories(id),
 price INTEGER NOT NULL CHECK(price >= 0),mrp INTEGER NOT NULL CHECK(mrp >= price),cost INTEGER NOT NULL DEFAULT 0 CHECK(cost>=0),
 stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved >= 0 AND reserved <= stock),
 low_stock_threshold INTEGER NOT NULL DEFAULT 5,unit TEXT NOT NULL DEFAULT '1 unit',image_url TEXT NOT NULL DEFAULT '',
 artwork TEXT NOT NULL DEFAULT 'bag',deleted_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS coupons (
 id TEXT PRIMARY KEY,code TEXT NOT NULL UNIQUE,title TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('percent','fixed')),
 value INTEGER NOT NULL CHECK(value > 0),min_order INTEGER NOT NULL DEFAULT 0,max_discount INTEGER,
 starts_at TEXT NOT NULL,expires_at TEXT NOT NULL,max_uses INTEGER NOT NULL DEFAULT 100,
 per_user_limit INTEGER NOT NULL DEFAULT 1,target_user_id TEXT REFERENCES users(id),active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
 id TEXT PRIMARY KEY,number TEXT NOT NULL UNIQUE,user_id TEXT NOT NULL REFERENCES users(id),
 status TEXT NOT NULL CHECK(status IN ('placed','accepted','packed','picked','rejected','cancelled')),
 subtotal INTEGER NOT NULL,coupon_discount INTEGER NOT NULL DEFAULT 0,points_spent INTEGER NOT NULL DEFAULT 0,
 total INTEGER NOT NULL CHECK(total>=0),coupon_id TEXT REFERENCES coupons(id),points_earned INTEGER NOT NULL DEFAULT 0,
 pickup_code TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',rejection_reason TEXT,
 idempotency_key TEXT NOT NULL,payload_hash TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 UNIQUE(user_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS order_items (
 id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),product_id TEXT NOT NULL REFERENCES products(id),
 sku TEXT NOT NULL,name TEXT NOT NULL,unit TEXT NOT NULL,image_url TEXT NOT NULL,artwork TEXT NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity>0),unit_price INTEGER NOT NULL,unit_cost INTEGER NOT NULL,line_total INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS order_events(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),status TEXT NOT NULL,actor_id TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS coupon_redemptions(id TEXT PRIMARY KEY,coupon_id TEXT NOT NULL REFERENCES coupons(id),user_id TEXT NOT NULL REFERENCES users(id),order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),state TEXT NOT NULL CHECK(state IN ('reserved','redeemed','released')),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS inventory_movements(id TEXT PRIMARY KEY,product_id TEXT NOT NULL REFERENCES products(id),quantity INTEGER NOT NULL,reason TEXT NOT NULL,reference TEXT,actor_id TEXT REFERENCES users(id),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS point_ledger(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),amount INTEGER NOT NULL,reason TEXT NOT NULL,order_id TEXT REFERENCES orders(id),created_at TEXT NOT NULL,UNIQUE(user_id,order_id,reason));
CREATE TABLE IF NOT EXISTS invoices(id TEXT PRIMARY KEY,number TEXT NOT NULL UNIQUE,order_id TEXT UNIQUE REFERENCES orders(id),user_id TEXT REFERENCES users(id),customer_phone TEXT,invoice_date TEXT NOT NULL,subtotal INTEGER NOT NULL,discount INTEGER NOT NULL DEFAULT 0,total INTEGER NOT NULL CHECK(total>=0),source TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS invoice_items(id TEXT PRIMARY KEY,invoice_id TEXT NOT NULL REFERENCES invoices(id),product_id TEXT NOT NULL REFERENCES products(id),sku TEXT NOT NULL,name TEXT NOT NULL,category TEXT NOT NULL,quantity INTEGER NOT NULL,unit_price INTEGER NOT NULL,unit_cost INTEGER NOT NULL,line_total INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS device_tokens(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),active INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notification_outbox(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,body TEXT NOT NULL,data_json TEXT NOT NULL,sound TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,available_at TEXT NOT NULL,sent_at TEXT,last_error TEXT,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS push_receipts(id TEXT PRIMARY KEY,token TEXT NOT NULL,check_at TEXT NOT NULL,checked_at TEXT);
CREATE TABLE IF NOT EXISTS import_batches(id TEXT PRIMARY KEY,type TEXT NOT NULL,filename TEXT NOT NULL,checksum TEXT NOT NULL,payload_json TEXT NOT NULL,errors_json TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'preview',actor_id TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,committed_at TEXT);
CREATE TABLE IF NOT EXISTS product_import_sources(product_id TEXT PRIMARY KEY REFERENCES products(id),import_batch_id TEXT NOT NULL REFERENCES import_batches(id),format TEXT NOT NULL,record_json TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_log(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL REFERENCES users(id),action TEXT NOT NULL,entity_id TEXT,detail_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id,deleted_at);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_redemptions_coupon ON coupon_redemptions(coupon_id,state,user_id);
CREATE INDEX IF NOT EXISTS idx_outbox_due ON notification_outbox(sent_at,available_at);
CREATE INDEX IF NOT EXISTS idx_point_ledger_user ON point_ledger(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS rate_limit_buckets(key TEXT PRIMARY KEY,hits INTEGER NOT NULL,reset_at INTEGER NOT NULL);
PRAGMA user_version=3;
`;
