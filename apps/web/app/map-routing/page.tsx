/**
 * /map-routing — Location Picker Page (Server Component)
 *
 * Fetches the list of **StoreLocation** records that belong to the user's
 * active Franchise (brand) from:
 *
 *   GET /store/franchises/:franchise_id/locations
 *
 * The `franchise_id` cookie identifies the *brand* and controls catalog
 * isolation.  This page writes `selected_store_location_id` only when the
 * user confirms a bakery. On load it pre-highlights:
 *   1. Their existing store cookie (if still valid), else
 *   2. The franchise's admin-configured default store (`is_default`), else
 *   3. The first active location for the franchise.
 */

import { cookies } from "next/headers";
import { unstable_cache } from "next/cache";
import { medusaFetch } from "@/lib/medusa";
import MapRoutingShell from "../components/MapRoutingShell";
import type { MapMarker } from "../components/LeafletMap";
import { getCurrentCustomer } from "@/lib/auth/auth-actions";

// ---------------------------------------------------------------------------
// Medusa response types
// ---------------------------------------------------------------------------

interface FranchiseListResponse {
  locations: Array<{
    id: string;
    name: string;
    code: string;
    latitude: number | null;
    longitude: number | null;
    address: string;
    hours: string | null;
  }>;
}

// ---------------------------------------------------------------------------
// Sidebar display type (re-exported for BakerySidebar)
// ---------------------------------------------------------------------------

export interface StoreLocationCard {
  id: string;
  franchiseId: string;
  name: string;
  locationId: string;
  hours: string;
  address: string;
  latitude: number;
  longitude: number;
  distance?: string;
  /** Admin-configured franchise default bakery. */
  isDefault?: boolean;
}

// ---------------------------------------------------------------------------
// Data fetching helper
// ---------------------------------------------------------------------------

/**
 * Accept bare ULIDs/UUIDs and Medusa prefixed ids (`fran_…`, `stloc_…`).
 */
function isValidMedusaId(id: string): boolean {
  const PREFIXED_ULID_RE = /^(?:[a-z]+_)?[0-9A-HJKMNP-TV-Z]{26}$/i;
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return PREFIXED_ULID_RE.test(id) || UUID_RE.test(id);
}

const DEFAULT_FRANCHISE_ID =
  process.env.NEXT_PUBLIC_DEFAULT_FRANCHISE_ID ??
  "fran_01KX3A21FPJKNT13V32C72RS2P";

const getCachedFranchises = unstable_cache(
  async (): Promise<FranchiseListResponse | null> => {
    const { data, error } = await medusaFetch<FranchiseListResponse>({
      path: "/store/franchises",
      cache: "no-store",
    });
    if (error || !data) {
      console.warn("[map-routing] Failed to fetch franchises:", error);
      return null;
    }
    return data;
  },
  ["all-franchises-cache"],
  {
    revalidate: 3600,
    tags: ["franchises"],
  }
);

const getCachedFranchiseLocations = unstable_cache(
  async (franchiseId: string): Promise<any[] | null> => {
    const { data, error } = await medusaFetch<{ locations: any[] }>({
      path: `/store/franchises/${franchiseId}/locations`,
      cache: "no-store",
    });
    if (error || !data) {
      console.warn(
        `[map-routing] Failed to fetch locations for franchise ${franchiseId}:`,
        error
      );
      return null;
    }
    return data.locations;
  },
  ["franchise-locations-cache"],
  {
    revalidate: 3600,
    tags: ["locations"],
  }
);

async function getStoreLocations(franchiseId: string): Promise<{
  locations: StoreLocationCard[];
  markers: MapMarker[];
}> {
  const franchisesData = await getCachedFranchises();

  if (!franchisesData?.locations) {
    return { locations: [], markers: [] };
  }

  // Prefer the active franchise first so its default is easy to resolve,
  // then load any remaining franchises for multi-brand map views.
  const orderedFranchises = [...franchisesData.locations].sort((a, b) => {
    if (a.id === franchiseId) return -1;
    if (b.id === franchiseId) return 1;
    return 0;
  });

  const locationsPromises = orderedFranchises.map(async (franchise) => {
    const locs = await getCachedFranchiseLocations(franchise.id);
    if (!locs) return [];
    return locs.map((loc) => ({
      ...loc,
      parent_franchise_id: franchise.id,
    }));
  });

  const allLocationsArrays = await Promise.all(locationsPromises);
  const allLocations = allLocationsArrays.flat();

  if (allLocations.length === 0) {
    console.warn("[map-routing] No physical locations found");
    return { locations: [], markers: [] };
  }

  const locations: StoreLocationCard[] = allLocations.map((loc) => {
    let hoursStr = "18:00";
    if (loc.opening_hours) {
      const days = [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
      ];
      const todayDay = days[new Date().getDay()];
      const todayHours =
        loc.opening_hours[todayDay] || Object.values(loc.opening_hours)[0];
      if (
        todayHours &&
        typeof todayHours === "object" &&
        "close" in todayHours &&
        todayHours.close
      ) {
        hoursStr = String(todayHours.close);
      }
    } else if (loc.metadata?.store_hours?.close) {
      hoursStr = loc.metadata.store_hours.close;
    }

    return {
      id: loc.id,
      franchiseId: loc.parent_franchise_id || loc.franchise_id,
      name: loc.name,
      locationId: loc.code ?? `#${loc.id.slice(0, 4).toUpperCase()}`,
      hours: hoursStr,
      address: loc.address ?? "",
      latitude: Number(loc.latitude ?? 0),
      longitude: Number(loc.longitude ?? 0),
      isDefault: Boolean(loc.is_default),
    };
  });

  const markers: MapMarker[] = allLocations
    .filter((loc) => loc.latitude != null && loc.longitude != null)
    .map((loc) => ({
      id: loc.id,
      franchiseId: loc.parent_franchise_id || loc.franchise_id,
      lat: Number(loc.latitude),
      lng: Number(loc.longitude),
      name: loc.name,
      address: loc.address ?? "",
      code: loc.code ?? "",
    }));

  return { locations, markers };
}

/**
 * Resolve which bakery should be pre-highlighted on the map:
 *   1. Existing user selection cookie (if still in the list)
 *   2. Admin default for the active franchise (`is_default`)
 *   3. Soft fallback via GET .../default-location (first active if no flag)
 *   4. First location under the active franchise
 */
function resolveInitialStoreId(
  locations: StoreLocationCard[],
  franchiseId: string,
  cookieStoreId: string | undefined
): string | null {
  if (locations.length === 0) return null;

  const ids = new Set(locations.map((l) => l.id));

  if (cookieStoreId && ids.has(cookieStoreId)) {
    return cookieStoreId;
  }

  const franchiseDefault = locations.find(
    (l) => l.franchiseId === franchiseId && l.isDefault
  );
  if (franchiseDefault) return franchiseDefault.id;

  const anyDefault = locations.find((l) => l.isDefault);
  if (anyDefault) return anyDefault.id;

  const firstInFranchise = locations.find((l) => l.franchiseId === franchiseId);
  return firstInFranchise?.id ?? locations[0]?.id ?? null;
}

async function fetchDefaultLocationId(
  franchiseId: string
): Promise<string | null> {
  const { data, error } = await medusaFetch<{
    location: { id: string } | null;
  }>({
    path: `/store/franchises/${encodeURIComponent(franchiseId)}/default-location`,
    cache: "no-store",
  });
  if (error || !data?.location?.id) return null;
  return data.location.id;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export const metadata = {
  title: "Find Your Bakery | Cake Break",
  description:
    "Select your nearest Cake Break boutique to browse today's fresh patisserie collection, tailored to your location.",
};

export default async function MapRoutingPage() {
  const cookieStore = await cookies();
  let franchiseId = cookieStore.get("franchise_id")?.value?.trim();

  // If absent or stale, fall back to the live default franchise env.
  if (!franchiseId || !isValidMedusaId(franchiseId)) {
    franchiseId = DEFAULT_FRANCHISE_ID;
  }

  const cookieStoreId = cookieStore
    .get("selected_store_location_id")
    ?.value?.trim();

  // Resolve auth + store locations in parallel.
  const [{ locations, markers }, apiDefaultId, currentCustomer] = await Promise.all([
    getStoreLocations(franchiseId),
    cookieStoreId
      ? Promise.resolve<string | null>(null)
      : fetchDefaultLocationId(franchiseId),
    getCurrentCustomer().catch(() => null),
  ]);

  const isLoggedIn = currentCustomer !== null;

  const hasExistingSelection = Boolean(
    cookieStoreId && locations.some((l) => l.id === cookieStoreId)
  );

  let initialStoreId = resolveInitialStoreId(
    locations,
    franchiseId,
    cookieStoreId
  );

  // Prefer the live admin default when the visitor has no store cookie yet.
  if (
    !hasExistingSelection &&
    apiDefaultId &&
    locations.some((l) => l.id === apiDefaultId)
  ) {
    initialStoreId = apiDefaultId;
  }

  // Ensure the Default badge matches the live admin flag even if the
  // locations list cache is slightly stale.
  const locationsWithDefault = apiDefaultId
    ? locations.map((l) => ({
        ...l,
        isDefault: l.isDefault || l.id === apiDefaultId,
      }))
    : locations;

  return (
    <MapRoutingShell
      franchiseId={franchiseId}
      locations={locationsWithDefault}
      markers={markers}
      initialHighlightedId={initialStoreId}
      initialSelectedId={initialStoreId}
      selectionSource={hasExistingSelection ? "cookie" : "default"}
      isLoggedIn={isLoggedIn}
    />
  );
}