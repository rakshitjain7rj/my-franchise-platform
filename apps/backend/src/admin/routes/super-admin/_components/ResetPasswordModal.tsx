import React, { useState, useEffect } from "react"
import { Button, FocusModal, Heading, Input, Text } from "@medusajs/ui"
import { FormField } from "../../../components/ui"

interface ResetPasswordModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userEmail: string
  onSubmit: (password: string) => void
  isPending: boolean
}

export const ResetPasswordModal = ({
  open,
  onOpenChange,
  userEmail,
  onSubmit,
  isPending,
}: ResetPasswordModalProps) => {
  const [password, setPassword] = useState("")

  useEffect(() => {
    if (!open) {
      setPassword("")
    }
  }, [open])

  const passwordTooShort = password.length > 0 && password.length < 8

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!password || passwordTooShort) return
    onSubmit(password)
  }

  return (
    <FocusModal open={open} onOpenChange={onOpenChange}>
      <FocusModal.Content>
        <form onSubmit={handleSubmit}>
          <FocusModal.Header>
            <div className="flex items-center gap-2">
              <FocusModal.Title asChild>
                <Heading level="h2">Reset User Password</Heading>
              </FocusModal.Title>
            </div>
          </FocusModal.Header>
          <FocusModal.Body className="flex flex-col gap-6 max-w-lg mx-auto py-8">
            <Text size="small" className="text-ui-fg-subtle">
              You are updating the login credentials for{" "}
              <span className="font-semibold text-ui-fg-base">{userEmail}</span>.
            </Text>

            <FormField
              id="reset-password"
              label="New Password"
              required
              helper="Must be at least 8 characters."
              error={passwordTooShort ? "Password must be at least 8 characters." : null}
            >
              <Input
                id="reset-password"
                type="password"
                required
                placeholder="Minimum 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                aria-invalid={passwordTooShort || undefined}
              />
            </FormField>
          </FocusModal.Body>
          <div className="border-t px-6 py-4 flex items-center justify-end gap-3 bg-ui-bg-subtle">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={isPending}
              disabled={!password || passwordTooShort}
            >
              Reset Password
            </Button>
          </div>
        </form>
      </FocusModal.Content>
    </FocusModal>
  )
}
