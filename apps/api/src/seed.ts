import { row, run, transaction, now } from "./db.js";
import { id, money } from "./core.js";
if (process.env.NODE_ENV === "production")
  throw new Error(
    "Demo catalog is disabled in production. Import your actual products.",
  );
const catalog = [
  ["Groceries", "rice", "Basmati Rice", "RICE-1KG", 119, 140, 91, 40, "1 kg"],
  [
    "Groceries",
    "bag",
    "Whole Wheat Atta",
    "ATTA-5KG",
    249,
    280,
    212,
    30,
    "5 kg",
  ],
  ["Groceries", "oil", "Sunflower Oil", "OIL-1L", 149, 170, 118, 18, "1 litre"],
  ["Groceries", "bag", "Toor Dal", "DAL-1KG", 159, 180, 121, 22, "1 kg"],
  [
    "Dairy & Bread",
    "milk",
    "Fresh Toned Milk",
    "MILK-500",
    28,
    30,
    24,
    40,
    "500 ml",
  ],
  [
    "Dairy & Bread",
    "bread",
    "Whole Wheat Bread",
    "BREAD-400",
    45,
    50,
    33,
    12,
    "400 g",
  ],
  [
    "Fresh Produce",
    "fruit",
    "Fresh Bananas",
    "BANANA-6",
    42,
    50,
    31,
    25,
    "6 pieces",
  ],
  [
    "Fresh Produce",
    "vegetable",
    "Farm Fresh Tomatoes",
    "TOMATO-500",
    29,
    35,
    20,
    8,
    "500 g",
  ],
  [
    "Daily Needs",
    "soap",
    "Gentle Bath Soap",
    "SOAP-100",
    39,
    49,
    29,
    25,
    "100 g",
  ],
  [
    "Daily Needs",
    "bag",
    "Laundry Detergent",
    "DETERGENT-1",
    99,
    120,
    77,
    4,
    "1 kg",
  ],
  [
    "Snacks",
    "snack",
    "Masala Potato Chips",
    "CHIPS-80",
    20,
    20,
    16,
    35,
    "80 g",
  ],
  [
    "Beverages",
    "tea",
    "Premium Assam Tea",
    "TEA-250",
    129,
    150,
    94,
    15,
    "250 g",
  ],
] as const;
transaction(() => {
  for (const [
    category,
    artwork,
    name,
    sku,
    price,
    mrp,
    cost,
    stock,
    unit,
  ] of catalog) {
    let c = row("SELECT id FROM categories WHERE name=?", category);
    if (!c) {
      const cid = id();
      run(
        "INSERT INTO categories(id,name,icon,sort_order) VALUES(?,?,?,?)",
        cid,
        category,
        artwork,
        Number(row("SELECT count(*) count FROM categories")!.count),
      );
      c = { id: cid };
    }
    if (!row("SELECT id FROM products WHERE sku=?", sku)) {
      const pid = id();
      run(
        "INSERT INTO products(id,sku,name,category_id,price,mrp,cost,stock,unit,artwork,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        pid,
        sku,
        name,
        c.id,
        money(price),
        money(mrp),
        money(cost),
        stock,
        unit,
        artwork,
        now(),
        now(),
      );
    }
  }
  run("INSERT OR REPLACE INTO settings VALUES(?,?)", "demoCatalog", "true");
});
console.log(
  "12 SAMPLE products created. This is demo data, not the mart’s verified catalog. No fake sales or customers were added.",
);
