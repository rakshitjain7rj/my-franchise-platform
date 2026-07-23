/**
 * FormField — standardised label / control / helper / error stack for forms.
 *
 * Guarantees consistent label spacing, a visible required marker, and a
 * single place for helper text and inline validation messages.
 */

import React from "react"
import { Hint, Label, Text } from "@medusajs/ui"

interface FormFieldProps {
  id: string
  label: string
  required?: boolean
  /** Muted helper text shown under the control. */
  helper?: React.ReactNode
  /** Inline validation message — takes precedence over `helper`. */
  error?: string | null
  children: React.ReactNode
  className?: string
}

export const FormField = ({
  id,
  label,
  required = false,
  helper,
  error,
  children,
  className = "",
}: FormFieldProps) => (
  <div className={`flex flex-col gap-2 ${className}`}>
    <Label htmlFor={id}>
      {label}
      {required && (
        <>
          <span className="text-ui-fg-error ml-0.5" aria-hidden>
            *
          </span>
          <span className="sr-only"> (required)</span>
        </>
      )}
    </Label>
    {children}
    {error ? (
      <Hint variant="error">{error}</Hint>
    ) : helper ? (
      <Text size="xsmall" className="text-ui-fg-subtle">
        {helper}
      </Text>
    ) : null}
  </div>
)

export default FormField
