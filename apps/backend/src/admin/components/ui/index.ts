/**
 * Shared admin UI kit.
 *
 * Small, reusable primitives that keep every custom admin page visually
 * consistent (spacing, hierarchy, loading, empty and confirmation patterns)
 * without duplicating markup.
 */

export { PageHeader } from "./page-header"
export { SectionHeading } from "./section-heading"
export { StatCard } from "./stat-card"
export { EmptyState } from "./empty-state"
export {
  TextSkeleton,
  TableBodySkeleton,
  CardListSkeleton,
  OrderCardSkeleton,
} from "./skeletons"
export { ConfirmDialog, useConfirm } from "./confirm-dialog"
export type { ConfirmDialogConfig } from "./confirm-dialog"
export { FilterPills } from "./filter-pills"
export type { FilterPillOption } from "./filter-pills"
export { FilterBar } from "./filter-bar"
export { SearchInput } from "./search-input"
export { FormField } from "./form-field"
export { StatusDot } from "./status-dot"
export type { StatusDotTone } from "./status-dot"
