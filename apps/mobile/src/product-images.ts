import type { Artwork } from "./types";
export type PhotoKind =
  | "rice"
  | "milk"
  | "oil"
  | "bread"
  | "soap"
  | "grocery"
  | "tea"
  | "snack"
  | "apple"
  | "broccoli"
  | "flour"
  | "lentils";
// Stock photos decorate categories only; they never identify an actual product.
export function productPhotoKind({
  name = "",
  category = "",
  artwork = "bag",
}: {
  name?: string;
  category?: string;
  artwork?: Artwork;
}): PhotoKind | null {
  if (name.trim()) return null;
  const art: Record<Artwork, PhotoKind> = {
    rice: "rice",
    milk: "milk",
    oil: "oil",
    bread: "bread",
    soap: "soap",
    tea: "tea",
    fruit: "apple",
    vegetable: "grocery",
    snack: "snack",
    bag: "grocery",
  };
  if (artwork !== "bag") return art[artwork];
  if (/dairy/i.test(category)) return "milk";
  if (/bakery/i.test(category)) return "bread";
  if (/snacks/i.test(category)) return "snack";
  return "grocery";
}
