/**
 * Instant feedback for catalogue → PDP soft navigations.
 * Rendered inside the shared (shop) layout so Header/Footer stay put.
 */

export default function ProductLoading() {
  return (
    <main className="pb-20 bg-page-bg" aria-busy="true" aria-label="Loading product">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-margin-mobile md:px-margin-desktop pb-12 pt-20 sm:pt-8 md:pb-20 space-y-16 sm:space-y-20">
        <div className="space-y-12 animate-pulse">
          {/* Back link + breadcrumb */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div className="h-3 w-28 rounded bg-deep-plum/10" />
            <div className="flex items-center gap-2 sm:justify-end">
              <div className="h-3 w-10 rounded bg-deep-plum/10" />
              <div className="h-3 w-3 rounded bg-deep-plum/5" />
              <div className="h-3 w-12 rounded bg-deep-plum/10" />
              <div className="h-3 w-3 rounded bg-deep-plum/5" />
              <div className="h-3 w-16 rounded bg-deep-plum/10" />
              <div className="h-3 w-3 rounded bg-deep-plum/5" />
              <div className="h-3 w-28 rounded bg-deep-plum/10" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-10 lg:gap-16">
            {/* Gallery */}
            <div className="space-y-4">
              <div className="aspect-square w-full rounded-2xl bg-deep-plum/10" />
              <div className="hidden gap-3 sm:flex">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-16 w-16 shrink-0 rounded-xl bg-deep-plum/10"
                  />
                ))}
              </div>
            </div>

            {/* Purchase panel */}
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="h-4 w-24 rounded bg-deep-plum/10" />
                <div className="h-10 w-4/5 max-w-md rounded-xl bg-deep-plum/10" />
                <div className="h-5 w-2/5 rounded bg-deep-plum/5" />
                <div className="flex gap-2 pt-1">
                  <div className="h-7 w-16 rounded-full bg-deep-plum/10" />
                  <div className="h-7 w-20 rounded-full bg-deep-plum/10" />
                </div>
              </div>
              <div className="flex items-baseline gap-4">
                <div className="h-10 w-28 rounded-lg bg-deep-plum/10" />
                <div className="h-6 w-16 rounded bg-deep-plum/5" />
              </div>
              <div className="space-y-3 pt-2">
                <div className="h-11 w-full rounded-xl bg-deep-plum/10" />
                <div className="h-11 w-full rounded-xl bg-deep-plum/10" />
                <div className="h-12 w-full rounded-full bg-deep-plum/15" />
              </div>
            </div>
          </div>
        </div>

        {/* Related strip placeholder */}
        <div className="space-y-8 animate-pulse">
          <div className="space-y-2">
            <div className="h-8 w-64 bg-deep-plum/10 rounded-xl" />
            <div className="h-4 w-48 bg-deep-plum/5 rounded" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-gutter">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-[220px] md:h-[280px] bg-deep-plum/10 rounded-2xl"
              />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
