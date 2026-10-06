// Internal POS item codes are not barcodes. Only checksum-valid GTINs are sent
// to external catalogs; a zero/blank POS barcode never identifies a product.
export function normalizeBarcode(value: unknown): string {
  const digits = String(value ?? "").trim();
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(digits) || /^0+$/.test(digits))
    return "";
  let sum = 0;
  for (let i = digits.length - 2, weight = 3; i >= 0; i--, weight = 4 - weight)
    sum += Number(digits[i]) * weight;
  return (10 - (sum % 10)) % 10 === Number(digits.at(-1))
    ? digits.padStart(14, "0")
    : "";
}

export function barcodeAliases(barcode: string): string[] {
  return [
    ...new Set([
      barcode,
      ...(barcode.startsWith("0") ? [barcode.slice(1)] : []),
      ...(barcode.startsWith("00") ? [barcode.slice(2)] : []),
      ...(barcode.startsWith("000000") ? [barcode.slice(6)] : []),
    ]),
  ];
}
