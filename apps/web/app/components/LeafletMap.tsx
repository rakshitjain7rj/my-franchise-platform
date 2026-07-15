"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import {
  FRANCHISE_COOKIE,
  setPersistentCookie,
  STORE_ID_COOKIE,
  STORE_NAME_COOKIE,
} from "@/lib/store-cookies";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MapMarker {
  /** Medusa store location ID — maps to StoreLocation.id */
  id: string;
  franchiseId: string;
  lat: number;
  lng: number;
  name: string;
  address: string;
  code?: string;
}

interface LeafletMapProps {
  /** Dynamic marker array fetched from the backend. */
  markers: MapMarker[];
  /** ID of the currently selected store location. */
  selectedId?: string | null;
  /** Fired when the user clicks a marker to highlight it. */
  onSelectMarker?: (marker: MapMarker) => void;
  /** Fired when the user clicks the "Select this Store" button inside a popup. */
  onSelectStore?: (marker: MapMarker) => void;
}

// ---------------------------------------------------------------------------
// Dynamic import — entire Leaflet/react-leaflet surface is client-only.
// ---------------------------------------------------------------------------

const StoreMapContent = dynamic(
  async () => {
    const { MapContainer, TileLayer, Marker, Popup, ZoomControl, useMap } =
      await import("react-leaflet");
    const L = await import("leaflet");
    const { useRouter } = await import("next/navigation");
    const { useEffect } = await import("react");

    // ── 1. Create an explicit default icon to avoid the broken Default icon ──
    //    Leaflet's Icon.Default relies on _getIconUrl which breaks under
    //    webpack/turbopack bundling. Instead of patching the prototype, we
    //    create a concrete icon instance and pass it to every <Marker>.
    const LeafletModule = L.default || L;

    const defaultIcon = LeafletModule.icon({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });

    // ── 2. Monkey-patch Leaflet to prevent the _leaflet_events crash ────────
    //
    // When the page navigates away, React unmounts <Marker> children AFTER
    // <MapContainer> has already called map.remove() — which sets this._map to
    // null on every layer.  Leaflet's _removeIcon then tries to call:
    //
    //   this._map.off(...)   →  TypeError: Cannot read properties of undefined
    //                                       (reading '_leaflet_events')
    //
    // The safest fix is to guard _removeIcon at the source so it bails out
    // early when the map reference has already been cleared.
    const MarkerProto = (LeafletModule.Marker as any).prototype;
    if (!MarkerProto.__patchedRemoveIcon) {
      const original = MarkerProto._removeIcon;
      MarkerProto._removeIcon = function (this: unknown) {
        const self = this as any;
        // Guard against two distinct teardown races:
        //  1. this._map is null  → MapContainer already called map.remove(),
        //     which destroys the Leaflet map instance before react-leaflet's
        //     passive-unmount effect can call removeLayer().
        //  2. this._icon is null → _removeIcon was already called once by
        //     Leaflet's internal layer cleanup during map.remove(); the second
        //     call from react-leaflet passes null to DomEvent.off(), crashing
        //     on DomEvent.off(null)._leaflet_events.
        if (!self._map || !self._icon) return;
        original.call(this);
      };
      MarkerProto.__patchedRemoveIcon = true; // idempotent across HMR cycles
    }

    // ── 2b. Guard against "Map container is already initialized." ────────────
    //
    // Leaflet's Map._initContainer throws when the container DOM node still
    // carries a _leaflet_id from a previous map instance. Under React 18
    // StrictMode (reactStrictMode: true) the component mounts → unmounts →
    // remounts in dev, and Fast Refresh reuses the same DOM node. In both
    // cases react-leaflet's cleanup (context.map.remove(), which is what
    // normally deletes _leaflet_id) can fail to run before the second init,
    // leaving the node tagged → the next `new LeafletMap(node)` throws.
    //
    // Stripping the stale id before initialising lets the fresh map bind to
    // the reused node. It's a no-op in production (single clean mount).
    const MapProto = (LeafletModule.Map as any).prototype;
    if (!MapProto.__patchedInitContainer) {
      const originalInitContainer = MapProto._initContainer;
      MapProto._initContainer = function (this: unknown, id: unknown) {
        const el =
          typeof id === "string" ? LeafletModule.DomUtil.get(id) : (id as any);
        if (el && el._leaflet_id) {
          delete el._leaflet_id;
        }
        return originalInitContainer.call(this, id);
      };
      MapProto.__patchedInitContainer = true; // idempotent across HMR cycles
    }

    // ── 3. Selected-marker icon — deep-plum brand color ─────────────────────
    const selectedIcon = LeafletModule.divIcon({
      className: "",
      html: `
        <div style="position:relative;width:36px;height:36px">
          <div style="
            width: 36px; height: 36px;
            background: #4A154B;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            border: 3px solid #fff;
            box-shadow: 0 4px 16px rgba(74,21,75,0.45);
          "></div>
          <div style="
            position:absolute;top:50%;left:50%;
            transform:translate(-50%,-50%);
            width:10px;height:10px;
            background:#FF69B4;
            border-radius:50%;
          "></div>
        </div>`,
      iconSize:    [36, 36],
      iconAnchor:  [18, 36],
      popupAnchor: [0, -38],
    });

    // ── 4. Sub-component: smooth pan on center change ──────────────────────
    //
    // Must live *inside* <MapContainer> to access the live Leaflet instance.
    // Using flyTo here instead of forcing a remount via `key` avoids the
    // unmount/remount race that triggered the original crash.
    function MapPanner({ center }: { center: [number, number] }) {
      const map = useMap();
      useEffect(() => {
        map.flyTo(center, map.getZoom(), { animate: true, duration: 0.8 });
      }, [center, map]);
      return null;
    }

    // ── 5. Inner Map component ─────────────────────────────────────────────
    return function Map({ markers, selectedId, onSelectMarker, onSelectStore }: LeafletMapProps) {
      const router = useRouter();

      const center = useMemo<[number, number]>(() => {
        if (markers.length === 0) return [52.4862, -1.8904]; // Birmingham fallback

        const selected = markers.find((m) => m.id === selectedId);
        if (selected) return [selected.lat, selected.lng];

        const avgLat = markers.reduce((s, m) => s + m.lat, 0) / markers.length;
        const avgLng = markers.reduce((s, m) => s + m.lng, 0) / markers.length;
        return [avgLat, avgLng];
      }, [markers, selectedId]);

      function handleMarkerClick(marker: MapMarker) {
        if (onSelectMarker) {
          onSelectMarker(marker);
        }
      }

      function handleSelectStoreClick(marker: MapMarker) {
        if (onSelectStore) {
          onSelectStore(marker);
        } else {
          // Standalone mode — write cookie then navigate.
          // Explicit user choice persists until they pick another bakery.
          setPersistentCookie(FRANCHISE_COOKIE, marker.franchiseId);
          setPersistentCookie(STORE_ID_COOKIE, marker.id);
          setPersistentCookie(STORE_NAME_COOKIE, marker.name);
          try {
            window.dispatchEvent(
              new CustomEvent("store-selection-changed", {
                detail: {
                  storeLocationId: marker.id,
                  storeName: marker.name,
                  source: "user-select",
                },
              })
            );
          } catch {
            // ignore
          }

          // Honour the ?redirect= param set by middleware. Fall back to home.
          const params = new URLSearchParams(window.location.search);
          const redirectTo = params.get("redirect") || "/";
          router.push(redirectTo);
        }
      }

      return (
        // No `key` prop — never force-remount MapContainer.
        // Center changes are handled by <MapPanner> via flyTo.
        <MapContainer
          center={center}
          zoom={markers.length === 1 ? 15 : 12}
          zoomControl={false}
          className="h-screen w-full"
        >
          <MapPanner center={center} />
          <ZoomControl position="bottomright" />

          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />

          {markers.map((marker) => (
            <Marker
              key={marker.id}
              position={[marker.lat, marker.lng]}
              icon={marker.id === selectedId ? selectedIcon : defaultIcon}
              eventHandlers={{ click: () => handleMarkerClick(marker) }}
            >
              <Popup>
                <div style={{
                  minWidth: "180px",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  padding: "4px 2px"
                }}>
                  <p style={{
                    fontWeight: 700,
                    fontSize: "13px",
                    color: "#4A154B",
                    marginBottom: "2px",
                    lineHeight: 1.3
                  }}>{marker.name}</p>
                  {marker.code && (
                    <p style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      color: "#FF69B4",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: "6px"
                    }}>{marker.code}</p>
                  )}
                  <p style={{
                    fontSize: "11px",
                    color: "#80737d",
                    marginBottom: "10px",
                    lineHeight: 1.4
                  }}>{marker.address}</p>
                  <button
                    onClick={() => handleSelectStoreClick(marker)}
                    style={{
                      width: "100%",
                      background: "#4A154B",
                      color: "#fff",
                      border: "none",
                      borderRadius: "999px",
                      padding: "7px 12px",
                      fontSize: "11px",
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      cursor: "pointer",
                    }}
                  >
                    Select this Store
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      );
    };
  },
  { ssr: false }
);

// ---------------------------------------------------------------------------
// Public wrapper
// ---------------------------------------------------------------------------

export default function StoreMap(props: LeafletMapProps) {
  return <StoreMapContent {...props} />;
}