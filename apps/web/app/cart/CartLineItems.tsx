"use client"

import Link from "next/link"
import {
  isHiddenAttrKey,
  labelForAttrKey,
} from "@/types/cake-metadata"
import type { InventoryCheckResult } from "@/lib/cart/cart-context"
import type { MedusaCartItem } from "@/lib/cart/cart-actions"
import { fmt } from "./format"

interface CartLineItemsProps {
  items: MedusaCartItem[]
  isLoading: boolean
  inventoryResult: InventoryCheckResult | null
  onRemove: (id: string) => void
  onUpdateQuantity: (id: string, qty: number) => void
}

export function CartLineItems({
  items,
  isLoading,
  inventoryResult,
  onRemove,
  onUpdateQuantity,
}: CartLineItemsProps) {
  return (
    <section className="flex flex-col gap-6">
      <h2 className="font-headline text-2xl font-bold text-primary flex items-center gap-2">
        <span
          className="material-symbols-outlined text-secondary"
          data-weight="fill"
        >
          shopping_basket
        </span>
        Selected Treats
      </h2>

      {isLoading && items.length === 0 ? (
        <div className="flex flex-col gap-4 animate-pulse">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="bg-surface-container-lowest rounded-2xl p-4 flex flex-col sm:flex-row gap-6 border border-surface-container shadow-sm relative overflow-hidden h-36"
            >
              <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-secondary-container/20" />
              <div className="w-full sm:w-32 h-full flex-shrink-0 rounded-xl bg-surface-container/60" />
              <div className="flex flex-col justify-between flex-grow gap-4">
                <div className="flex flex-col gap-3">
                  <div className="h-5 bg-surface-container rounded-md w-1/3" />
                  <div className="flex flex-wrap gap-2 mt-1">
                    <div className="h-5 bg-surface-container rounded-full w-16" />
                    <div className="h-5 bg-surface-container rounded-full w-20" />
                    <div className="h-5 bg-surface-container rounded-full w-24" />
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="h-8 bg-surface-container rounded-full w-24" />
                  <div className="h-6 bg-surface-container rounded w-16" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          className={`flex flex-col gap-4 transition-opacity duration-200 ${
            isLoading ? "opacity-60 pointer-events-none" : ""
          }`}
        >
          {items.map((item) => {
            const meta = item.metadata as Record<string, unknown> | null
            const customAttrs = meta?.custom_attributes as
              | Record<string, string>
              | undefined
            const inscription = meta?.inscription as string | undefined
            const invItem = inventoryResult?.items.find(
              (i) => i.variant_id === item.variant_id
            )
            const isSufficient = invItem ? invItem.is_sufficient : true
            const availableQty = invItem ? invItem.available_quantity : null

            return (
              <div
                key={item.id}
                className="bg-surface-container-lowest rounded-2xl p-4 flex flex-col sm:flex-row gap-6 border border-surface-container shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group rounded-lg"
              >
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-secondary-container opacity-0 group-hover:opacity-100 transition-opacity" />

                <div className="w-full sm:w-32 h-32 flex-shrink-0 rounded-xl overflow-hidden bg-surface-container">
                  {item.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.thumbnail}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-on-surface/5">
                      <span className="material-symbols-outlined text-[36px] text-on-surface-variant/20">
                        cake
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col justify-between flex-grow gap-4">
                  <div>
                    <div className="flex justify-between items-start gap-4">
                      <h3 className="font-headline text-lg font-bold text-primary leading-tight">
                        {item.title}
                      </h3>
                      <button
                        onClick={() => onRemove(item.id)}
                        aria-label="Remove item"
                        className="text-on-surface-variant hover:text-error transition-colors p-1 rounded-full hover:bg-error-container"
                      >
                        <span className="material-symbols-outlined text-sm">
                          close
                        </span>
                      </button>
                    </div>

                    {customAttrs && Object.keys(customAttrs).length > 0 ? (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {Object.entries(customAttrs)
                          .filter(([k, v]) => v && !isHiddenAttrKey(k))
                          .map(([k, v], idx) => {
                            const isSecondaryColor =
                              /flavou?r/i.test(k) || idx % 2 === 1
                            const badgeClass = isSecondaryColor
                              ? "bg-secondary-fixed text-on-secondary-fixed"
                              : "bg-tertiary-fixed text-on-tertiary-fixed"
                            return (
                              <span
                                key={k}
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badgeClass}`}
                              >
                                {labelForAttrKey(k)}: {v}
                              </span>
                            )
                          })}
                        {typeof customAttrs.photo_url === "string" &&
                          customAttrs.photo_url && (
                            <a
                              href={customAttrs.photo_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary-fixed text-on-secondary-fixed"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={customAttrs.photo_url}
                                alt=""
                                className="w-4 h-4 rounded object-cover"
                              />
                              Photo
                            </a>
                          )}
                      </div>
                    ) : item.variant_title &&
                      item.variant_title !== "Default Variant" ? (
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-tertiary-fixed text-on-tertiary-fixed">
                          {item.variant_title}
                        </span>
                      </div>
                    ) : null}

                    {inscription && (
                      <p className="text-sm text-on-surface-variant mt-3 italic text-gray-500 border-l-2 border-outline-variant pl-2">
                        &ldquo;{inscription}&rdquo;
                      </p>
                    )}

                    {!isSufficient && (
                      <div className="text-xs text-red-600 font-semibold flex items-center gap-1.5 mt-2 bg-red-50 border border-red-200/50 px-3 py-1.5 rounded-xl">
                        <span className="material-symbols-outlined !text-[16px] text-red-500">
                          warning
                        </span>
                        <span>
                          Insufficient stock at this location (Only{" "}
                          {availableQty ?? 0} available).
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between items-center mt-4">
                    <div className="flex items-center bg-surface-container rounded-full border border-outline-variant/30">
                      <button
                        onClick={() =>
                          onUpdateQuantity(item.id, item.quantity - 1)
                        }
                        className="w-8 h-8 flex items-center justify-center text-on-surface hover:text-primary hover:bg-surface-variant rounded-l-full transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          remove
                        </span>
                      </button>
                      <span className="w-8 text-center font-medium text-sm text-primary">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() =>
                          onUpdateQuantity(item.id, item.quantity + 1)
                        }
                        className="w-8 h-8 flex items-center justify-center text-on-surface hover:text-primary hover:bg-surface-variant rounded-r-full transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          add
                        </span>
                      </button>
                    </div>
                    <div className="font-headline font-bold text-primary text-lg">
                      {fmt(item.unit_price * item.quantity, item.currency_code)}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-2">
        <Link
          href="/cake-catalogue"
          className="inline-flex items-center gap-1 text-sm font-bold text-secondary hover:text-secondary-container transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          Add more treats
        </Link>
      </div>
    </section>
  )
}
