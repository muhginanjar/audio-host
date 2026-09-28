import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiClientError, api } from "../../../lib/api";
import { PageHeader } from "../../../components/Layout";
import { Icon } from "../../../components/icons";
import {
  Button,
  Card,
  CardHeader,
  CopyButton,
  Field,
  Input,
  Select,
  useToast,
} from "../../../components/ui";
import type { UserAdminDTO } from "@shared/types";

export const Route = createFileRoute("/_auth/admin/users/new")({
  component: AdminUserNewPage,
});

const EMPTY_FORM = { name: "", email: "", password: "", confirm: "", storageMb: "", status: "active" };

function AdminUserNewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [form, setForm] = useState(EMPTY_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [created, setCreated] = useState<{ user: UserAdminDTO; token: string } | null>(null);

  const limitNumber = Number(form.storageMb);
  const errors: Record<keyof typeof EMPTY_FORM, string | undefined> = {
    name: form.name.trim().length < 2 ? "Name must be at least 2 characters." : undefined,
    email: form.email.trim() ? undefined : "Email is required.",
    password: form.password.length < 8 ? "Password must be at least 8 characters." : undefined,
    confirm: form.confirm === form.password ? undefined : "Passwords do not match.",
    storageMb:
      form.storageMb && (!Number.isInteger(limitNumber) || limitNumber <= 0)
        ? "Use a whole number of megabytes greater than zero."
        : undefined,
    status: undefined,
  };

  const create = useMutation({
    mutationFn: () =>
      api.admin.userCreate({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        storage_limit_mb: form.storageMb ? limitNumber : undefined,
        status: form.status,
      }),
    onSuccess: ({ data }) => {
      setCreated({ user: data.user, token: data.token });
      toast(`${data.user.name} created.`, "success");
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
    },
    onError: (err) =>
      toast(err instanceof ApiClientError ? err.message : "Could not create the user.", "error"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return;
    create.mutate();
  }

  function createAnother() {
    setForm(EMPTY_FORM);
    setSubmitted(false);
    setCreated(null);
  }

  if (created) {
    return (
      <>
        <PageHeader title="Create User" sub="A new account with its own storage quota and API token." />
        <Card className="mx-auto max-w-xl">
          <div className="flex flex-col items-center gap-2 border-b border-slate-100 px-6 py-8 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <Icon name="check" className="h-6 w-6" />
            </div>
            <h2 className="text-base font-semibold text-slate-900">User {created.user.name} created</h2>
            <p className="max-w-sm text-sm text-slate-500">
              They can sign in with the email and password you chose. Their REST API token is shown below only once.
            </p>
          </div>
          <div className="space-y-4 px-6 py-5">
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              This is the only time the full token is visible. It is stored hashed and cannot be retrieved afterwards.
            </p>
            <Field label="API token">
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={created.token}
                  onFocus={(e) => e.currentTarget.select()}
                  className="font-mono text-xs"
                  aria-label="One-time API token"
                />
                <CopyButton text={created.token} label="Copy" variant="primary" />
              </div>
            </Field>
            <p className="text-xs text-slate-500">Store it now — it cannot be retrieved afterwards.</p>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={createAnother}>
                Create Another
              </Button>
              <Button
                variant="primary"
                icon="user"
                onClick={() => navigate({ to: "/admin/users/$id", params: { id: String(created.user.id) } })}
              >
                View User
              </Button>
            </div>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Create User" sub="A new account with its own storage quota and API token." />
      <Card className="mx-auto max-w-xl">
        <CardHeader title="Account details" sub="The API token is generated automatically and shown once." />
        <form onSubmit={onSubmit} className="space-y-4 px-6 py-5" noValidate>
          <Field label="Name" error={submitted ? errors.name : undefined} hint="Shown across the dashboard and audio library.">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Jordan Rivera"
              autoComplete="off"
            />
          </Field>
          <Field label="Email" error={submitted ? errors.email : undefined}>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="jordan@example.com"
              autoComplete="off"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Password" error={submitted ? errors.password : undefined} hint="At least 8 characters.">
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Confirm password" error={submitted ? errors.confirm : undefined}>
              <Input
                type="password"
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                autoComplete="new-password"
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Storage limit (MB)"
              error={submitted ? errors.storageMb : undefined}
              hint="Blank = system default."
            >
              <Input
                type="number"
                min={1}
                step={1}
                value={form.storageMb}
                onChange={(e) => setForm({ ...form, storageMb: e.target.value })}
                placeholder="Default"
              />
            </Field>
            <Field label="Status" hint="Disabled accounts cannot sign in or use the API.">
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => navigate({ to: "/admin/users" })}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" icon="plus" loading={create.isPending}>
              Create User
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
