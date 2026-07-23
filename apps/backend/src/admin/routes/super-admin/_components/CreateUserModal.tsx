import React, { useState, useEffect } from "react"
import { Button, FocusModal, Heading, Input, Label, Switch, Text } from "@medusajs/ui"
import { FormField } from "../../../components/ui"

interface CreateUserModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: { email: string; password?: string; first_name?: string; last_name?: string; is_super_admin?: boolean }) => void
  isPending: boolean
}

export const CreateUserModal = ({
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: CreateUserModalProps) => {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  // Reset fields when modal is opened/closed
  useEffect(() => {
    if (!open) {
      setEmail("")
      setPassword("")
      setFirstName("")
      setLastName("")
      setIsSuperAdmin(false)
    }
  }, [open])

  const passwordTooShort = password.length > 0 && password.length < 8

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password || passwordTooShort) return
    onSubmit({
      email,
      password,
      first_name: firstName,
      last_name: lastName,
      is_super_admin: isSuperAdmin,
    })
  }

  return (
    <FocusModal open={open} onOpenChange={onOpenChange}>
      <FocusModal.Content>
        <form onSubmit={handleSubmit}>
          <FocusModal.Header>
            <div className="flex items-center gap-2">
              <FocusModal.Title asChild>
                <Heading level="h2">Create New Administrator</Heading>
              </FocusModal.Title>
            </div>
          </FocusModal.Header>
          <FocusModal.Body className="flex flex-col gap-6 max-w-lg mx-auto py-8">
            <FormField id="create-email" label="Email Address" required>
              <Input
                id="create-email"
                type="email"
                required
                placeholder="e.g. manager@franchise.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
              />
            </FormField>

            <FormField
              id="create-password"
              label="Initial Password"
              required
              helper="Must be at least 8 characters."
              error={passwordTooShort ? "Password must be at least 8 characters." : null}
            >
              <Input
                id="create-password"
                type="password"
                required
                placeholder="Minimum 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                aria-invalid={passwordTooShort || undefined}
              />
            </FormField>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField id="create-first-name" label="First Name">
                <Input
                  id="create-first-name"
                  placeholder="e.g. John"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="off"
                />
              </FormField>
              <FormField id="create-last-name" label="Last Name">
                <Input
                  id="create-last-name"
                  placeholder="e.g. Doe"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoComplete="off"
                />
              </FormField>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border border-ui-border-base px-4 py-3">
              <div className="min-w-0">
                <Label htmlFor="create-is-super-admin">Make Super Admin</Label>
                <Text size="xsmall" className="text-ui-fg-subtle mt-0.5">
                  Grant global, unrestricted access. Keep disabled for regular franchise owners.
                </Text>
              </div>
              <Switch
                id="create-is-super-admin"
                checked={isSuperAdmin}
                onCheckedChange={setIsSuperAdmin}
                className="shrink-0"
              />
            </div>
          </FocusModal.Body>
          <div className="border-t px-6 py-4 flex items-center justify-end gap-3 bg-ui-bg-subtle">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={isPending}
              disabled={!email || !password || passwordTooShort}
            >
              Create User Account
            </Button>
          </div>
        </form>
      </FocusModal.Content>
    </FocusModal>
  )
}
