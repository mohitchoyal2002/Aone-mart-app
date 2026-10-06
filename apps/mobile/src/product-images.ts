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
type Identity = { name?: string; category?: string; artwork?: Artwork };
const names: [RegExp, PhotoKind][] = [
  [
    /\b(biscuits?|cookies?|crackers?|rusk|choco|snacks?|chips?|namkeen)\b/,
    "snack",
  ],
  [
    /\b(atta|flour|maida|besan|wheat|aata|suji|sooji|rava)\b|आटा|मैदा|बेसन/,
    "flour",
  ],
  [
    /\b(dal|daal|lentils?|pulses?|moong|masoor|chana|rajma|toor|urad)\b|दाल/,
    "lentils",
  ],
  [/\b(rice|basmati|chawal)\b|चावल/, "rice"],
  [/\b(oil|ghee|sunflower|mustard|refined)\b|तेल|घी/, "oil"],
  [
    /\b(milk|doodh|dudh|curd|yogurt|paneer|butter|cheese)\b|दूध|दही|पनीर/,
    "milk",
  ],
  [/\b(bread|loaf|bun|bakery)\b|ब्रेड/, "bread"],
  [
    /\b(soap|shampoo|wash|washing|detergent|cleaner|toothpaste|sanitizer)\b|साबुन/,
    "soap",
  ],
  [/\b(tea|chai|coffee)\b|चाय|कॉफी/, "tea"],
  [/\b(apples?)\b|सेब/, "apple"],
  [/\b(broccoli)\b/, "broccoli"],
];
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

// Names win over imported "bag" defaults and broad category labels. Unmatched
// products receive a neutral grocery photo, rather than an invented brand pack.
export function productPhotoKind({
  name = "",
  category = "",
  artwork = "bag",
}: Identity): PhotoKind {
  const normalized = name
    .normalize("NFKC")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/(\p{L})(\d)|(\d)(\p{L})/gu, "$1$3 $2$4")
    .replace(/[_-]/g, " ");
  for (const [pattern, photo] of names)
    if (pattern.test(normalized)) return photo;
  if (artwork !== "bag") return art[artwork] || "grocery";
  const label = category.toLowerCase();
  if (/dairy|दूध/.test(label)) return "milk";
  if (/bakery|bread/.test(label)) return "bread";
  if (/snack|biscuit/.test(label)) return "snack";
  if (/personal|cleaning|household/.test(label)) return "soap";
  if (/tea|coffee/.test(label)) return "tea";
  return "grocery";
}
