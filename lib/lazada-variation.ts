// Grouping uses listing ID + the full printed variation name, never a guessed SKU.
export function parseVariationBlock(block: string[]) {
  const names = block.slice(1).map(line => line.trim()).filter(line =>
    line && !/^(RM\b|[\d.,%/ ]+$|Cancel\b|Submit\b|Lazada\b|All rights\b)/i.test(line) &&
    !/%\s*off|\d+\s*\/\s*\d+|Seller SKU:/.test(line)
  );
  const variationName = names.join(" ").normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!variationName || /…|\.\.\.$/.test(variationName))
    throw new Error("Variation name is missing or truncated; please export with the full variation name visible.");
  const text = block.join(" ");
  const decimals = [...text.matchAll(/\b(\d+\.\d{1,2})\b/g)].map(m => Number(m[1]));
  const prices = [...text.matchAll(/RM\s*([\d.]+)/g)].map(m => Number(m[1]));
  const price = decimals.at(-1) ?? prices.at(-1);
  const sold = text.match(/(\d+)\s*\/\s*(\d+)/);
  if (price === undefined || !sold) throw new Error("Price or Item Sold is missing for " + variationName);
  return { sku: variationName, variationName, price, stock: Number(sold[2]), sales: Number(sold[1]) };
}
