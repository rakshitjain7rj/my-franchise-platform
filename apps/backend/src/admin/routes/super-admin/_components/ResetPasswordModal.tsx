import React, { useState, useEffect } from "react"
import { Button, FocusModal, Heading, Input, Label, Text } from "@medusajs/ui"

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) return
    onSubmit(password)
  }

  return (
    <FocusModal open={open} onOpenChange={onOpenChange}>
      <FocusModal.Content>
        <form onSubmit={handleSubmit}>
          <FocusModal.Header>
            <div className="flex items-center gap-2">
              <Heading level="h2">Reset User Password</Heading>
            </div>
          </FocusModal.Header>
          <FocusModal.Body className="flex flex-col gap-6 max-w-lg mx-auto py-8">
            <div>
              <Text className="text-ui-fg-subtle">
                You are updating the login credentials for <span className="font-semibold text-ui-fg-base">{userEmail}</span>.
              </Text>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="reset-password">New Password</Label>
              <Input
                id="reset-password"
                type="password"
                required
                placeholder="Enter new password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </FocusModal.Body>
          <div className="border-t px-6 py-4 flex items-center justify-end gap-3 bg-ui-bg-subtle">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isPending} disabled={!password}>
              Reset Password
            </Button>
          </div>
        </form>
      </FocusModal.Content>
    </FocusModal>
  )
}
