import type { Product } from "./types";
const snapshots = new Map<string, Product>();
export function rememberProducts(products: Product[]) {
  for (const product of products) {
    snapshots.delete(product.id);
    snapshots.set(product.id, product);
  }
  while (snapshots.size > 90) snapshots.delete(snapshots.keys().next().value!);
}
export const productSnapshot = (id: string) => snapshots.get(id);
export const clearProductSnapshots = () => snapshots.clear();
