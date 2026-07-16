import type { ProductVariant } from "./types";

export function formatPrice(amount: number, currencyCode: string): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currencyCode?.toUpperCase() ?? "GBP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getVariantPrice(variant: ProductVariant): {
  current: string;
  original: string | null;
  hasDiscount: boolean;
} | null {
  const calc = variant.calculated_price;
  if (calc) {
    const current = formatPrice(calc.calculated_amount, calc.currency_code);
    const hasDiscount =
      calc.original_amount != null &&
      calc.original_amount > calc.calculated_amount;
    const original = hasDiscount
      ? formatPrice(calc.original_amount!, calc.currency_code)
      : null;
    return { current, original, hasDiscount };
  }

  const price = variant.prices?.[0] ?? variant.price_set?.money_amounts?.[0];
  if (price) {
    return {
      current: formatPrice(price.amount, price.currency_code),
      original: null,
      hasDiscount: false,
    };
  }

  return null;
}
