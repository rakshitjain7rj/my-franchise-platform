import React, { useEffect } from "react"
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useQuery } from "@tanstack/react-query"
import { sdk } from "../lib/sdk"

const HideSuperAdminLinkWidget = () => {
  const { data } = useQuery({
    queryKey: ["admin-user-me-guard"],
    queryFn: () =>
      sdk.client.fetch("/admin/users/me") as Promise<{ user: any }>,
  })

  useEffect(() => {
    if (data && data.user?.metadata?.is_super_admin !== true) {
      const styleId = "hide-super-admin-portal-style"
      if (!document.getElementById(styleId)) {
        const style = document.createElement("style")
        style.id = styleId
        style.innerHTML = `
          a[href="/admin/super-admin"],
          a[href*="/super-admin"] {
            display: none !important;
          }
        `
        document.head.appendChild(style)
      }
    }
  }, [data])

  return null
}

export const config = defineWidgetConfig({
  zone: [
    "product.list.after",
    "order.list.after",
    "customer.list.after",
    "promotion.list.after",
    "campaign.list.after",
  ],
})

export default HideSuperAdminLinkWidget
