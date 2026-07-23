/**
 * Skeleton loaders — keep layout stable while data is in flight.
 *
 * Plain "Loading…" text causes layout shift and feels unfinished. These
 * skeletons mirror the shape of the content they stand in for.
 */

import { Container, Skeleton, Table } from "@medusajs/ui"

/** A block of generic text lines. */
export const TextSkeleton = ({ lines = 3 }: { lines?: number }) => (
  <div className="flex flex-col gap-2 py-1">
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton key={i} className={`h-3 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
    ))}
  </div>
)

/** Table body replacement that keeps the header visible. */
export const TableBodySkeleton = ({
  rows = 5,
  columns,
}: {
  rows?: number
  columns: number
}) => (
  <Table.Body>
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <Table.Row key={rowIndex}>
        {Array.from({ length: columns }).map((_, colIndex) => (
          <Table.Cell key={colIndex}>
            <Skeleton className="h-4 w-full max-w-[140px]" />
          </Table.Cell>
        ))}
      </Table.Row>
    ))}
  </Table.Body>
)

/** Stacked card list (used by Leads / Reviews / Cake Orders boards). */
export const CardListSkeleton = ({ cards = 3 }: { cards?: number }) => (
  <div className="flex flex-col gap-3">
    {Array.from({ length: cards }).map((_, i) => (
      <Container key={i} className="p-5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <div className="mt-3 flex flex-col gap-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      </Container>
    ))}
  </div>
)

/** A production-board order card (Cake Orders). */
export const OrderCardSkeleton = () => (
  <div className="rounded-xl border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest overflow-hidden">
    <div className="flex items-center gap-3 border-b border-ui-border-base px-5 py-3 bg-ui-bg-subtle">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-5 w-16 rounded-full" />
      <Skeleton className="h-5 w-20 rounded-full" />
      <Skeleton className="ml-auto h-4 w-16" />
    </div>
    <div className="px-5 py-4 flex flex-col gap-3">
      <div className="flex gap-4">
        <Skeleton className="h-16 w-16 rounded-md shrink-0" />
        <div className="flex-1 flex flex-col gap-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-2/5" />
        </div>
      </div>
    </div>
  </div>
)
