import React, { useState, useEffect } from "react"
import { Button, FocusModal, Heading, Input, Label, Switch, Text } from "@medusajs/ui"

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
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
              <Heading level="h2">Create New Administrator</Heading>
            </div>
          </FocusModal.Header>
          <FocusModal.Body className="flex flex-col gap-6 max-w-lg mx-auto py-8">
            <div className="flex flex-col gap-2">
              <Label htmlFor="create-email">Email Address</Label>
              <Input
                id="create-email"
                type="email"
                required
                placeholder="e.g. manager@franchise.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="create-password">Initial Password</Label>
              <Input
                id="create-password"
                type="password"
                required
                placeholder="Must be at least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="create-first-name">First Name</Label>
                <Input
                  id="create-first-name"
                  placeholder="e.g. John"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="create-last-name">Last Name</Label>
                <Input
                  id="create-last-name"
                  placeholder="e.g. Doe"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-ui-border-base pt-6 mt-2">
              <div className="flex flex-col gap-0.5">
                <Label htmlFor="create-is-super-admin">Make Super Admin</Label>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Grant global, unrestricted access. Keep disabled for regular franchise owners.
                </Text>
              </div>
              <Switch
                id="create-is-super-admin"
                checked={isSuperAdmin}
                onCheckedChange={setIsSuperAdmin}
              />
            </div>
          </FocusModal.Body>
          <div className="border-t px-6 py-4 flex items-center justify-end gap-3 bg-ui-bg-subtle">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isPending} disabled={!email || !password}>
              Create User Account
            </Button>
          </div>
        </form>
      </FocusModal.Content>
    </FocusModal>
  )
}
