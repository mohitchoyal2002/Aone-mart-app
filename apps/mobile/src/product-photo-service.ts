import { useCallback, useSyncExternalStore } from "react";
import { api } from "./api";
import type { ProductImageSource } from "./types";

export type ResolvedPhoto = {
  id: string;
  imageUrl: string;
  imageThumbnailUrl: string;
  imageSource: ProductImageSource | null;
  status: "matched" | "pending" | "unavailable" | "no_barcode";
  retryAfter: number;
};
type Entry = {
  barcode: string;
  photo?: ResolvedPhoto;
  listeners: Set<() => void>;
  due: number;
};
const entries = new Map<string, Entry>();
let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
let generation = 0;
function schedule() {
  if (timer || running) return;
  const live = [...entries.values()].filter(
    (e) => e.listeners.size && e.due !== Infinity,
  );
  if (!live.length) return;
  const delay = Math.max(250, Math.min(...live.map((e) => e.due)) - Date.now());
  timer = setTimeout(() => {
    timer = undefined;
    void pump();
  }, delay);
}
async function pump() {
  running = true;
  const current = generation;
  const batch = [...entries]
    .filter(([, e]) => e.listeners.size && e.due <= Date.now())
    .slice(0, 24);
  for (const [, entry] of batch) entry.due = Infinity;
  try {
    if (!batch.length) return;
    const result = await api.post<{ images: ResolvedPhoto[] }>(
      "/api/catalog/product-images",
      {
        ids: batch.map(([id]) => id),
      },
    );
    if (current !== generation) return;
    for (const [id, entry] of batch) {
      if (entries.get(id) !== entry) continue;
      const photo = result.images.find((p) => p.id === id);
      if (!photo) continue;
      entry.photo = photo;
      entry.due = photo.retryAfter
        ? Date.now() + Math.max(60, photo.retryAfter) * 1000
        : Infinity;
      for (const listener of entry.listeners) listener();
    }
  } catch {
    if (current === generation)
      for (const [, entry] of batch) entry.due = Date.now() + 5 * 60000;
  } finally {
    running = false;
    for (const [id, entry] of entries)
      if (entries.size > 150 && !entry.listeners.size) entries.delete(id);
    schedule();
  }
}
export function clearResolvedProductPhotos() {
  generation++;
  const listeners = [...entries.values()].flatMap((e) => [...e.listeners]);
  entries.clear();
  if (timer) clearTimeout(timer);
  timer = undefined;
  for (const listener of listeners) listener();
}
export function useResolvedProductPhoto(id = "", barcode = "", imageUrl = "") {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!id || !barcode || imageUrl) return () => {};
      let entry = entries.get(id);
      if (!entry || entry.barcode !== barcode) {
        entry = { barcode, listeners: new Set(), due: Date.now() };
        entries.set(id, entry);
      }
      entry.listeners.add(listener);
      schedule();
      return () => {
        entry.listeners.delete(listener);
      };
    },
    [id, barcode, imageUrl],
  );
  const snapshot = useCallback(() => {
    const entry = entries.get(id);
    return !imageUrl && entry?.barcode === barcode ? entry.photo : undefined;
  }, [id, barcode, imageUrl]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
