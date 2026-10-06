export type Role = "customer" | "admin";
export interface User {
  id: string;
  name: string;
  phone: string;
  role: Role;
  points: number;
  createdAt: string;
  orders?: number;
  spent?: number;
  deletedAt?: string | null;
}
export interface Session {
  user: User;
  accessToken: string;
  refreshToken: string;
}
export interface Category {
  id: string;
  name: string;
  icon: string;
}
export type Artwork =
  | "rice"
  | "milk"
  | "oil"
  | "fruit"
  | "vegetable"
  | "soap"
  | "bread"
  | "bag"
  | "snack"
  | "tea";
export type ProductImageSource = {
  matchMethod?: "barcode" | "name";
  provider: string;
  url: string;
  license: string;
  barcode: string;
  productName: string;
};
export interface Product {
  id: string;
  sku: string;
  barcode?: string;
  name: string;
  categoryId: string;
  category: string;
  price: number;
  mrp: number;
  cost?: number;
  stock?: number;
  reserved?: number;
  available: number;
  lowStockThreshold: number;
  unit: string;
  imageUrl: string;
  merchantImageUrl?: string;
  imageThumbnailUrl?: string;
  imageSource?: ProductImageSource | null;
  artwork: Artwork;
}
export interface CartLine {
  product: Product;
  quantity: number;
}
export type OrderStatus =
  | "placed"
  | "accepted"
  | "packed"
  | "picked"
  | "rejected"
  | "cancelled";
export interface Order {
  id: string;
  number: string;
  userId: string;
  status: OrderStatus;
  subtotal: number;
  couponDiscount: number;
  pointsSpent: number;
  total: number;
  pointsEarned: number;
  pickupCode: string;
  notes: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
  customer?: { name: string; phone: string };
  items: {
    productId: string;
    sku: string;
    name: string;
    unit: string;
    imageUrl: string;
    artwork: Artwork;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  events: { status: OrderStatus; createdAt: string }[];
}
export interface Coupon {
  id: string;
  code: string;
  title: string;
  kind: "percent" | "fixed";
  value: number;
  minOrder: number;
  maxDiscount: number | null;
  startsAt: string;
  expiresAt: string;
  maxUses: number;
  perUserLimit: number;
  targetUserId: string | null;
  active: boolean;
  uses: number;
}
export interface Store {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  hours: string;
  pickupInstructions: string;
  mapsUrl: string;
  pointsPer100Rupees: number;
  acceptingOrders: boolean;
  demoCatalog?: boolean;
  banners?: Banner[];
}
export interface Banner {
  id: string;
  title: string;
  altText: string;
  imagePath: string;
}
export interface Quote {
  subtotal: number;
  couponDiscount: number;
  pointsSpent: number;
  pointsDiscount: number;
  total: number;
  couponCode: string | null;
  items: {
    productId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
}
export interface SalesReport {
  range: { from: string; to: string };
  stats: {
    invoices: number;
    revenue: number;
    discounts: number;
    cost: number;
    profit: number;
    summaryInvoices?: number;
    summaryRevenue?: number;
    averageOrder: number;
    units: number;
  };
  daily: { day: string; revenue: number; orders: number }[];
  topProducts: {
    sku: string;
    name: string;
    units: number;
    grossRevenue: number;
  }[];
  topProductsByRevenue?: SalesReport["topProducts"];
  categories: { name: string; grossRevenue: number; units: number }[];
}
export interface InventoryReport {
  stats: {
    products: number;
    units: number;
    reservedUnits: number;
    costValue: number;
    retailValue: number;
    lowStock: number;
  };
  categories: {
    name: string;
    available: number;
    reserved: number;
    products: number;
  }[];
  lowStock: Product[];
}
export interface Dashboard {
  sales: SalesReport;
  inventory: InventoryReport;
  customers: { total: number; rewardPoints: number };
  orders: { status: OrderStatus; count: number }[];
  analytics?: Analytics;
}
export interface Analytics {
  updatedAt: string;
  comparison: {
    previousRange: { from: string; to: string };
    previous: { revenue: number; invoices: number; averageOrder: number };
    daily: SalesReport["daily"];
    changes: {
      revenue: number | null;
      invoices: number | null;
      averageOrder: number | null;
    };
  };
  sources: {
    source: "app" | "summary" | "itemized";
    invoices: number;
    revenue: number;
  }[];
  weekdays: {
    day: string;
    weekday: number;
    invoices: number;
    revenue: number;
  }[];
  orderStatuses: { status: OrderStatus; count: number }[];
  stockHealth: { healthy: number; low: number; outOfStock: number };
  customers: {
    newAccounts: number;
    purchasingAccounts: number;
    repeatAccounts: number;
    repeatRate: number;
  };
  coverage: {
    itemizedRevenue: number;
    summaryRevenue: number;
    itemizedInvoices: number;
  };
}
export interface ImportPreview {
  id: string;
  type: "products" | "invoices";
  filename: string;
  rowCount: number;
  validRows: number;
  invoiceCount?: number;
  errors: { row: number; message: string }[];
  errorCount: number;
  rows: Record<string, unknown>[];
  canCommit: boolean;
  requiresReview: boolean;
  note: string;
  format?: "products" | "invoice_items" | "sales_summary";
  supportsInventoryAdjustment?: boolean;
}
