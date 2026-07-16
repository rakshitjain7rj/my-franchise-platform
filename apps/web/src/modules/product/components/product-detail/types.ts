// Types mirroring the Medusa Store API product shape used by product detail.

export interface ProductImage {
  url: string;
  id?: string;
}

export interface MoneyAmount {
  amount: number;
  currency_code: string;
}

export interface CalculatedPrice {
  calculated_amount: number;
  original_amount?: number;
  currency_code: string;
}

export interface PriceSet {
  id: string;
  money_amounts?: MoneyAmount[];
}

export interface ProductVariant {
  id: string;
  title: string;
  sku?: string;
  calculated_price?: CalculatedPrice;
  prices?: MoneyAmount[];
  price_set?: PriceSet;
  options?: Array<{
    id: string;
    value: string;
    option_id?: string;
    option?: {
      id: string;
      title: string;
    };
  }>;
  inventory_quantity?: number;
  manage_inventory?: boolean;
  metadata?: Record<string, unknown> | null;
}

export interface ProductOption {
  id: string;
  title: string;
  values: Array<{
    id: string;
    value: string;
  }>;
}

export interface DietaryTag {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  is_active?: boolean;
}

export interface MedusaProduct {
  id: string;
  title: string;
  handle: string;
  description: string | null;
  subtitle: string | null;
  thumbnail: string | null;
  images: ProductImage[];
  variants: ProductVariant[];
  options: ProductOption[];
  material?: string | null;
  metadata?: Record<string, unknown> | null;
  tags?: Array<{ id: string; value: string }>;
  collection?: { id: string; title: string; handle: string } | null;
  type?: { id: string; value: string } | null;
}

export interface ProductDetailProps {
  product: MedusaProduct;
  /** From product-dietary-tag relation (server-fetched). */
  dietaryTags?: DietaryTag[];
}

export type StoreLocationOption = {
  id: string;
  name: string;
  address?: string | null;
  is_default?: boolean;
};
