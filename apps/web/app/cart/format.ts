export function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency?.toUpperCase() ?? "GBP",
    maximumFractionDigits: 2,
  }).format(amount)
}
