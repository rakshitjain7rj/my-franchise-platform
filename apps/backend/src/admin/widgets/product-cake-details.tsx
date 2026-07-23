/**
 * product-cake-details.tsx
 *
 * Admin editor for storefront product-detail cards:
 *   • Ingredients  → product.material + metadata.ingredients
 *   • Allergens    → metadata.allergens (comma-separated)
 *   • Storage      → metadata.storage_serving
 *
 * The storefront ProductDetail page reads these keys (with legacy
 * metadata.material fallback). Without this widget, staff had to edit
 * raw JSON metadata — and live-imported products had none of this data.
 */

import { defineWidgetConfig } from "@medusajs/admin-sdk"
import {
  Button,
  Container,
  Heading,
  Input,
  Skeleton,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { sdk } from "../lib/sdk"
import { FormField } from "../components/ui"

type ProductPayload = {
  id: string
  material?: string | null
  metadata?: Record<string, unknown> | null
}

type FormState = {
  ingredients: string
  allergens: string
  storage_serving: string
}

function metaString(
  metadata: Record<string, unknown> | null | undefined,
  key: string
): string {
  const raw = metadata?.[key]
  if (typeof raw === "string") return raw
  if (Array.isArray(raw)) return raw.map(String).join(", ")
  return ""
}

function formFromProduct(product: ProductPayload | undefined): FormState {
  const metadata = product?.metadata ?? null
  const ingredients =
    (typeof product?.material === "string" && product.material.trim()
      ? product.material
      : "") ||
    metaString(metadata, "ingredients") ||
    metaString(metadata, "material")

  return {
    ingredients,
    allergens: metaString(metadata, "allergens"),
    storage_serving:
      metaString(metadata, "storage_serving") ||
      metaString(metadata, "storage_and_serving"),
  }
}

const ProductCakeDetailsWidget = ({ data }: { data: { id: string } }) => {
  const productId = data.id
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>({
    ingredients: "",
    allergens: "",
    storage_serving: "",
  })
  const [baseline, setBaseline] = useState<FormState>(form)

  const { data: product, isLoading } = useQuery({
    queryKey: ["product-cake-details", productId],
    queryFn: async () => {
      const res = (await sdk.client.fetch(`/admin/products/${productId}`, {
        query: { fields: "id,material,metadata" },
      })) as { product: ProductPayload }
      return res.product
    },
    enabled: Boolean(productId),
  })

  useEffect(() => {
    if (!product) return
    const next = formFromProduct(product)
    setForm(next)
    setBaseline(next)
  }, [product])

  const isDirty = useMemo(
    () =>
      form.ingredients !== baseline.ingredients ||
      form.allergens !== baseline.allergens ||
      form.storage_serving !== baseline.storage_serving,
    [form, baseline]
  )

  const saveMutation = useMutation({
    mutationFn: async () => {
      const existingMeta =
        product?.metadata && typeof product.metadata === "object"
          ? { ...product.metadata }
          : {}

      const ingredients = form.ingredients.trim()
      const allergens = form.allergens.trim()
      const storage = form.storage_serving.trim()

      // Empty string removes the key from Medusa metadata merge semantics.
      const metadata: Record<string, unknown> = {
        ...existingMeta,
        ingredients: ingredients || "",
        allergens: allergens || "",
        storage_serving: storage || "",
      }

      // Keep legacy key in sync so older readers still work.
      if (ingredients) {
        metadata.material = ingredients
      } else if ("material" in metadata) {
        metadata.material = ""
      }

      return sdk.client.fetch(`/admin/products/${productId}`, {
        method: "POST",
        body: {
          material: ingredients || null,
          metadata,
        },
      })
    },
    onSuccess: () => {
      toast.success("Cake details saved", {
        description: "Ingredients, allergens, and storage updated.",
      })
      setBaseline(form)
      queryClient.invalidateQueries({
        queryKey: ["product-cake-details", productId],
      })
    },
    onError: (err: Error) => {
      toast.error("Failed to save cake details", {
        description: err?.message ?? "Unknown error",
      })
    },
  })

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h2">Cake details</Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            Shown on the storefront product page (ingredients, allergens,
            storage).
          </Text>
        </div>
      </div>

      <div className="px-6 py-4 flex flex-col gap-4">
        {isLoading ? (
          <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading cake details">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-20 w-full rounded-md" />
              <Skeleton className="h-3 w-48" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-20 w-full rounded-md" />
            </div>
          </div>
        ) : (
          <>
            <FormField
              id="cake-ingredients"
              label="Ingredients"
              helper="Comma-separated list. Displayed as bullet points on the product page."
            >
              <Textarea
                id="cake-ingredients"
                rows={3}
                value={form.ingredients}
                onChange={(e) =>
                  setForm((f) => ({ ...f, ingredients: e.target.value }))
                }
                placeholder="e.g. Flour, Sugar, Butter, Milk, Cocoa, Raising agents"
              />
            </FormField>

            <FormField
              id="cake-allergens"
              label="Allergens"
              helper="Comma-separated. Shown next to dietary tags (Eggless, Vegan…)."
            >
              <Input
                id="cake-allergens"
                value={form.allergens}
                onChange={(e) =>
                  setForm((f) => ({ ...f, allergens: e.target.value }))
                }
                placeholder="e.g. Gluten, Dairy, Nuts"
              />
            </FormField>

            <FormField id="cake-storage" label="Storage & serving">
              <Textarea
                id="cake-storage"
                rows={3}
                value={form.storage_serving}
                onChange={(e) =>
                  setForm((f) => ({ ...f, storage_serving: e.target.value }))
                }
                placeholder="e.g. Keep refrigerated and consume within 2 days."
              />
            </FormField>
          </>
        )}
      </div>

      {isDirty && (
        <div className="flex justify-end gap-2 border-t border-ui-border-base px-6 py-3 bg-ui-bg-subtle">
          <Button
            size="small"
            variant="secondary"
            onClick={() => setForm(baseline)}
            disabled={saveMutation.isPending}
          >
            Reset
          </Button>
          <Button
            size="small"
            onClick={() => saveMutation.mutate()}
            isLoading={saveMutation.isPending}
          >
            Save cake details
          </Button>
        </div>
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.after",
})

export default ProductCakeDetailsWidget
