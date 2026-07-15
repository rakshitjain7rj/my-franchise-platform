// ---------------------------------------------------------------------------
// Shared domain types for the Super Admin Portal
// ---------------------------------------------------------------------------

export interface Franchise {
  id: string
  name: string
  code: string
  is_active: boolean
  metadata?: Record<string, any>
  store_locations?: Array<{ id: string; name: string }>
}

export interface StoreLocation {
  id: string
  name: string
  code: string
  address: string | null
  latitude: number | null
  longitude: number | null
  is_active: boolean
  is_accepting_orders: boolean
  /** Franchise-wide default bakery for first-time storefront visitors. */
  is_default: boolean
  custom_lead_time_hours: number
  daily_order_capacity: number
  franchise: {
    id: string
    name: string
  }
}

export interface UserRecord {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  metadata?: Record<string, any>
  franchise?: Array<{ id: string; name: string }>
  /** Store locations this user is assigned to as a branch manager */
  store_locations?: Array<{ id: string; name: string; code: string }>
}
