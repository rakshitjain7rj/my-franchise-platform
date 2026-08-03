/**
 * GET /api/search?q=…&limit=6
 *
 * Lightweight typeahead proxy for the header search bar.
 * Forwards franchise + store cookies to Medusa so results stay tenant-scoped.
 * Never 500s for empty / short queries — returns { products: [], count: 0 }.
 */

import { NextRequest, NextResponse } from "next/server";
import { getMedusaHeaders } from "@/lib/medusa/headers";
import { getDefaultRegionId } from "@/lib/medusa/region";
import {
  SEARCH_DEFAULT_LIMIT,
  SEARCH_MAX_LIMIT,
  SEARCH_MIN_Q,
  type SearchHit,
  type SearchSuggestResponse,
} from "@/lib/data/search-suggest";

export const dynamic = "force-dynamic";

const MEDUSA_BACKEND_URL =
  (process.env.MEDUSA_BACKEND_URL ??
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) ??
  "http://localhost:9000";

const SUGGEST_FIELDS = [
  "id",
  "title",
  "handle",
  "thumbnail",
  "variants.calculated_price",
].join(",");

// Re-export types for any server importers of this route module.
export type { SearchHit, SearchSuggestResponse };

type MedusaVariant = {
  calculated_price?: {
    calculated_amount?: number;
    currency_code?: string;
  } | null;
};

type MedusaProduct = {
  id: string;
  title?: string;
  handle?: string;
  thumbnail?: string | null;
  variants?: MedusaVariant[] | null;
};

function formatPrice(
  amount: number | undefined,
  currencyCode: string | undefined
): string | null {
  if (amount == null || Number.isNaN(amount)) return null;
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: (currencyCode ?? "GBP").toUpperCase(),
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `£${amount}`;
  }
}

function toHit(product: MedusaProduct): SearchHit | null {
  if (!product?.id || !product.handle) return null;
  const calc = product.variants?.[0]?.calculated_price;
  return {
    id: product.id,
    title: product.title?.trim() || "Cake",
    handle: product.handle,
    thumbnail: product.thumbnail ?? null,
    price: formatPrice(calc?.calculated_amount, calc?.currency_code),
  };
}

function emptyResponse(): NextResponse<SearchSuggestResponse> {
  return NextResponse.json({ products: [], count: 0 });
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = (searchParams.get("q") ?? "").trim();
  const limitRaw = Number(searchParams.get("limit") ?? SEARCH_DEFAULT_LIMIT);
  const limit = Math.min(
    SEARCH_MAX_LIMIT,
    Math.max(
      1,
      Number.isFinite(limitRaw) ? Math.floor(limitRaw) : SEARCH_DEFAULT_LIMIT
    )
  );

  if (q.length < SEARCH_MIN_Q) {
    return emptyResponse();
  }

  try {
    const headers = await getMedusaHeaders();
    // /api/* bypasses middleware cookie hydration — ensure franchise scope
    // matches the storefront default when the cookie is not yet present.
    if (!headers["x-franchise-id"]) {
      const fallbackFranchise =
        process.env.NEXT_PUBLIC_DEFAULT_FRANCHISE_ID?.trim();
      if (fallbackFranchise) {
        headers["x-franchise-id"] = fallbackFranchise;
      }
    }

    const regionId = await getDefaultRegionId();

    const params = new URLSearchParams();
    params.set("q", q);
    params.set("limit", String(limit));
    params.set("offset", "0");
    params.set("fields", SUGGEST_FIELDS);
    if (regionId) {
      params.set("region_id", regionId);
    }

    const response = await fetch(
      `${MEDUSA_BACKEND_URL}/store/products?${params.toString()}`,
      {
        headers,
        cache: "no-store",
      }
    );

    if (!response.ok) {
      console.error(
        `[api/search] Medusa /store/products returned ${response.status}`
      );
      return emptyResponse();
    }

    const json = (await response.json()) as {
      products?: MedusaProduct[];
      count?: number;
    };

    const products = (json.products ?? [])
      .map(toHit)
      .filter((h): h is SearchHit => h != null);

    return NextResponse.json({
      products,
      count: json.count ?? products.length,
    } satisfies SearchSuggestResponse);
  } catch (err) {
    console.error("[api/search] Unexpected error:", err);
    return emptyResponse();
  }
}
