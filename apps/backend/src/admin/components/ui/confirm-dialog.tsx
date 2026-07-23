/**
 * ConfirmDialog — replaces native `window.confirm()` for destructive or
 * consequential actions.
 *
 * Built on the Medusa UI `Prompt` (Radix AlertDialog): keyboard accessible,
 * focus-trapped, Escape to close, styled to match the admin design system.
 *
 * Usage:
 *   const confirm = useConfirm()
 *   ...
 *   confirm.ask({
 *     title: "Delete location?",
 *     description: "This will sever all linked stock connections.",
 *     confirmLabel: "Delete",
 *     variant: "danger",
 *     onConfirm: () => deleteMutation.mutate(id),
 *   })
 *   // render: <ConfirmDialog state={confirm.state} onClose={confirm.close} />
 */

import React, { useCallback, useState } from "react"
import { Prompt } from "@medusajs/ui"

export interface ConfirmDialogConfig {
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: "danger" | "confirmation"
  onConfirm: () => void
}

interface ConfirmDialogState extends ConfirmDialogConfig {
  open: boolean
}

export const ConfirmDialog = ({
  state,
  onClose,
}: {
  state: ConfirmDialogState | null
  onClose: () => void
}) => (
  <Prompt
    open={state?.open ?? false}
    onOpenChange={(open) => !open && onClose()}
    variant={state?.variant ?? "danger"}
  >
    <Prompt.Content>
      <Prompt.Header>
        <Prompt.Title>{state?.title ?? "Are you sure?"}</Prompt.Title>
        {state?.description ? (
          <Prompt.Description>{state.description}</Prompt.Description>
        ) : null}
      </Prompt.Header>
      <Prompt.Footer>
        <Prompt.Cancel onClick={onClose}>
          {state?.cancelLabel ?? "Cancel"}
        </Prompt.Cancel>
        <Prompt.Action
          onClick={() => {
            state?.onConfirm()
            onClose()
          }}
        >
          {state?.confirmLabel ?? "Confirm"}
        </Prompt.Action>
      </Prompt.Footer>
    </Prompt.Content>
  </Prompt>
)

/** Hook that manages ConfirmDialog state for a page/component. */
export const useConfirm = () => {
  const [state, setState] = useState<ConfirmDialogState | null>(null)

  const ask = useCallback((config: ConfirmDialogConfig) => {
    setState({ ...config, open: true })
  }, [])

  const close = useCallback(() => {
    setState((prev) => (prev ? { ...prev, open: false } : null))
  }, [])

  return { state, ask, close }
}

export default ConfirmDialog
