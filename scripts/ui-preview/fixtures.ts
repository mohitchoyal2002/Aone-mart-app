// Clearly labelled sample catalog for local visual verification only.
import bannerPoster from "../../apps/mobile/assets/motion/market-poster.jpg";
import namePhoto from "./assets/name-punjabi-papad.png";
import barcodePhoto from "./assets/barcode-nutella.jpg";
import type { Product } from "../../apps/mobile/src/types";
export const user = {
  id: "preview-user",
  name: "Mohit Choyal",
  phone: "9000000001",
  role: "customer",
  points: 65,
  createdAt: "2026-10-01T12:00:00Z",
};
const entries = new URLSearchParams(location.search).has("photoRegression")
  ? ([
      ["365 DAYS PRNNI PASTA 250GM", "Pack", "bag", 1800, 3500, "General"],
      ["420 CHANA CHATPATA PAPAD", "Pack", "bag", 4500, 6600, "General"],
      ["420 MOONG PUNJABI MASALA PAPAD", "Pack", "bag", 5500, 7700, "General"],
      ["420 MOONG SPECIAL PAPAD", "Pack", "bag", 4500, 6900, "General"],
      ["5STAR OREO 20MRP", "Pack", "bag", 1900, 2000, "General"],
      ["A ONE AGARBATTI 180G", "Pack", "bag", 2900, 4000, "General"],
    ] as const)
  : ([
      ["Premium basmati rice", "1 kg", "rice", 19800, 22000, "Staples"],
      ["Fresh toned milk", "500 ml", "milk", 3200, 3500, "Dairy"],
      ["Sunflower cooking oil", "1 litre", "oil", 14500, 16500, "Staples"],
      ["Fresh red apples", "500 g", "fruit", 8900, 10000, "Fresh produce"],
      ["Garden broccoli", "250 g", "vegetable", 4800, 5500, "Fresh produce"],
      ["Whole wheat bread", "400 g", "bread", 4500, 5000, "Bakery"],
      ["Chocolate cookies", "150 g", "snack", 6500, 7000, "Snacks"],
      ["Premium tea", "250 g", "tea", 13500, 15000, "Beverages"],
      ["Gentle bathing soap", "100 g", "soap", 3800, 4000, "Personal care"],
      ["Atta flour", "5 kg", "bag", 22500, 25000, "Staples"],
    ] as const);
export const categories = [...new Set(entries.map((e) => e[5]))].map(
  (name, index) => ({ id: `c${index}`, name, icon: "bag" }),
);
export const products: Product[] = entries.map((e, index) => ({
  id: `p${index}`,
  sku: `SAMPLE-${index}`,
  name: e[0],
  unit: e[1],
  artwork: e[2],
  price: e[3],
  mrp: e[4],
  category: e[5],
  categoryId: categories.find((c) => c.name === e[5])!.id,
  available: index === 8 ? 0 : 20,
  lowStockThreshold: 5,
  imageUrl: "",
}));
// Preview-only fixtures: exact barcode photo and honest failed-image placeholder.
if (new URLSearchParams(location.search).has("barcodePhotos")) {
  products[0].name = "Nutella 400 g";
  products[0].unit = "400 g";
  products[0].barcode = "03017620422003";
}
if (new URLSearchParams(location.search).has("brokenPhoto"))
  products[0].imageUrl = "http://127.0.0.1:4173/missing-product-photo.webp";
export const store = {
  name: "Aone Mart",
  tagline: "Apni dukaan. Apna bharosa.",
  address: "Your neighbourhood mart",
  phone: "9000000000",
  hours: "9 am – 9 pm",
  pickupInstructions: "Collect your order at the counter.",
  mapsUrl: "",
  pointsPer100Rupees: 2,
  acceptingOrders: true,
  demoCatalog: true,
  banners: new URLSearchParams(location.search).has("banners")
    ? Array.from({ length: 5 }, (_, index) => ({
        id: `sample-banner-${index}`,
        title: `Sample store banner ${index + 1}`,
        altText: "Sample fresh-produce store banner",
        imagePath: bannerPoster,
      }))
    : [],
};
let orders: any[] = [];
const sales = {
  range: { from: "2026-09-06", to: "2026-10-05" },
  stats: {
    invoices: 0,
    revenue: 0,
    discounts: 0,
    cost: 0,
    profit: 0,
    averageOrder: 0,
    units: 0,
  },
  daily: [],
  topProducts: [],
  categories: [],
};
function quote(body: any) {
  const items = body.items.map((i: any) => {
    const p = products.find((p) => p.id === i.productId)!;
    return {
      ...i,
      name: p.name,
      unitPrice: p.price,
      lineTotal: p.price * i.quantity,
    };
  });
  const subtotal = items.reduce((n: number, i: any) => n + i.lineTotal, 0);
  if (body.couponCode && body.couponCode !== "LOCAL10")
    throw new ApiError("Coupon not found or no longer available.", 400);
  const couponDiscount = body.couponCode ? Math.round(subtotal * 0.1) : 0;
  const pointsSpent = Math.min(
    body.redeemPoints || 0,
    Math.floor((subtotal - couponDiscount) / 100),
  );
  return {
    items,
    subtotal,
    couponDiscount,
    pointsSpent,
    pointsDiscount: pointsSpent * 100,
    total: subtotal - couponDiscount - pointsSpent * 100,
    couponCode: body.couponCode || null,
  };
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public code = "",
    public details?: unknown,
  ) {
    super(message);
  }
}
export const api = {
  baseUrl: "http://localhost:4173",
  accessToken: "local-preview",
  init: async () => ({ configured: true, hasSession: true }),
  onExpired: () => {},
  save: async () => {},
  clear: async () => {},
  logout: async () => {},
  setUrl: async () => {},
  async get(path: string): Promise<any> {
    const url = new URL(path, "http://localhost");
    if (path === "/api/auth/me") return { user };
    if (path === "/api/catalog/store") return { store };
    if (path === "/api/catalog/categories") return { categories };
    if (url.pathname === "/api/catalog/products") {
      const q = url.searchParams.get("q")?.toLowerCase() || "",
        c = url.searchParams.get("categoryId");
      const filtered = products.filter(
        (p) => p.name.toLowerCase().includes(q) && (!c || p.categoryId === c),
      );
      return { products: filtered, total: filtered.length };
    }
    if (url.pathname.startsWith("/api/catalog/products/")) {
      const product = products.find(
        (p) => p.id === url.pathname.split("/").pop(),
      );
      if (!product) throw new Error("Product is no longer available.");
      return { product };
    }
    if (url.pathname === "/api/orders") return { orders, total: orders.length };
    if (url.pathname.startsWith("/api/orders/"))
      return {
        order: orders.find((o) => o.id === url.pathname.split("/").pop()),
      };
    if (path === "/api/devices/notifications") return { notifications: [] };
    if (path === "/api/rewards")
      return { points: user.points, coupons: [], ledger: [] };
    if (path.startsWith("/api/admin/reports/dashboard"))
      return {
        sales,
        inventory: {
          stats: {
            products: 10,
            units: 180,
            reservedUnits: 0,
            costValue: 0,
            retailValue: 0,
            lowStock: 1,
          },
          categories: [],
          lowStock: [products[8]],
        },
        customers: { total: 1, rewardPoints: 65 },
        orders: [],
      };
    throw new Error(`Preview route missing: ${path}`);
  },
  async post(path: string, body: any): Promise<any> {
    if (path === "/api/catalog/product-images")
      return {
        images: body.ids.map((id: string) => {
          const product = products.find((p) => p.id === id);
          const photo = product?.barcode
            ? barcodePhoto
            : new URLSearchParams(location.search).has("namePhotos") &&
                product?.name === "420 MOONG PUNJABI MASALA PAPAD"
              ? namePhoto
              : "";
          return {
            id,
            status: photo ? "matched" : "unavailable",
            imageUrl:
              photo && new URLSearchParams(location.search).has("brokenFull")
                ? "http://127.0.0.1:4173/missing-full-photo.jpg"
                : photo,
            imageThumbnailUrl: photo,
            retryAfter: 0,
            imageSource: !photo
              ? null
              : product?.barcode
                ? {
                    provider: "Open Food Facts",
                    license: "CC BY-SA 3.0",
                    barcode: "03017620422003",
                    url: "https://world.openfoodfacts.org/product/3017620422003",
                    productName: "Nutella",
                  }
                : {
                    provider: "Quick Pantry",
                    license: "Source image rights apply",
                    barcode: "",
                    matchMethod: "name",
                    url: "https://www.quickpantry.in/products/agrawal-420-moong-papad-200-g",
                    productName:
                      "Agrawal 420 Moong Papad (Punjabi Masala) 200 g",
                  },
          };
        }),
      };
    if (path === "/api/orders/quote") return { quote: quote(body) };
    if (path === "/api/orders") {
      const q = quote(body),
        now = new Date().toISOString();
      const order = {
        ...q,
        id: `order-${orders.length}`,
        number: `SAMPLE-${orders.length + 1}`,
        userId: user.id,
        status: "placed",
        pointsEarned: 0,
        pickupCode: "1234",
        notes: body.notes || "",
        createdAt: now,
        updatedAt: now,
        items: q.items.map((i: any) => ({
          ...i,
          ...products.find((p) => p.id === i.productId),
        })),
        events: [{ status: "placed", createdAt: now }],
      };
      orders = [order, ...orders];
      return { order };
    }
    if (path.startsWith("/api/auth/"))
      return { user, accessToken: "preview", refreshToken: "preview" };
    throw new Error(`Preview route missing: ${path}`);
  },
  async patch(path: string, body: any): Promise<any> {
    if (path === "/api/auth/me") Object.assign(user, body);
    return { user };
  },
};
