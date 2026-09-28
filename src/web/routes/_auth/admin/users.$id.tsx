import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiClientError, api } from "../../../lib/api";
import { formatBytes, formatDate, formatDuration, timeAgo } from "../../../lib/format";
import { PageHeader } from "../../../components/Layout";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CopyButton,
  EmptyState,
  Field,
  Input,
  Modal,
  ProgressBar,
  Select,
  Spinner,
  Table,
  Td,
  useToast,
} from "../../../components/ui";
import type { AudioDTO, UserAdminDTO } from "@shared/types";

export const Route = createFileRoute("/_auth/admin/users/$id")({
  component: AdminUserDetailPage,
});

const MB = 1024 * 1024;

function AdminUserDetailPage() {
  const { id: idParam } = Route.useParams();
  const id = Number(idParam);

  const user = useQuery({
    queryKey: ["user", id],
    queryFn: () => api.admin.userGet(id).then((r) => r.data),
  });

  if (user.isError) {
    return (
      <>
        <PageHeader
          title="User not found"
          actions={
            <Link to="/admin/users" className="text-sm font-medium text-slate-500 hover:text-slate-900">
              ← Back to users
            </Link>
          }
        />
        <EmptyState
          title="Could not load this user"
          hint={user.error instanceof ApiClientError ? user.error.message : "Network error. Try again."}
          icon="users"
        />
      </>
    );
  }

  if (!user.data) {
    return (
      <div className="flex justify-center py-16 text-indigo-500">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }

  const account = user.data;
  return (
    <>
      <PageHeader
        title={account.name}
        sub={account.email}
        actions={
          <>
            <Badge tone={account.status === "active" ? "green" : "red"}>{account.status}</Badge>
            <Link to="/admin/users" className="text-sm font-medium text-slate-500 hover:text-slate-900">
              ← Back to users
            </Link>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <DetailsCard key={account.updated_at} account={account} />
          <DangerZoneCard account={account} />
        </div>
        <div className="min-w-0 space-y-6 lg:col-span-3">
          <TokenCard account={account} />
          <UsageCard account={account} />
          <AudioCard account={account} />
        </div>
      </div>
    </>
  );
}

/* ---------------- left column ---------------- */

function DetailsCard({ account }: { account: UserAdminDTO }) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [name, setName] = useState(account.name);
  const [email, setEmail] = useState(account.email);
  const [status, setStatus] = useState<string>(account.status);
  const [limitMb, setLimitMb] = useState(
    account.storage_limit_bytes === null ? "" : String(Math.round(account.storage_limit_bytes / MB)),
  );

  const currentLimitMb = account.storage_limit_bytes === null ? null : Math.round(account.storage_limit_bytes / MB);
  const parsedLimit = limitMb.trim() === "" ? null : Number(limitMb);

  const errors = {
    name: name.trim().length < 2 ? "Name must be at least 2 characters." : undefined,
    email: email.trim() ? undefined : "Email is required.",
    limitMb:
      parsedLimit !== null && (!Number.isInteger(parsedLimit) || parsedLimit <= 0)
        ? "Use a whole number of megabytes greater than zero."
        : undefined,
  };
  const invalid = Boolean(errors.name || errors.email || errors.limitMb);

  const changes: Record<string, unknown> = {};
  if (name.trim() !== account.name) changes.name = name.trim();
  if (email.trim() !== account.email) changes.email = email.trim();
  if (status !== account.status) changes.status = status;
  if (parsedLimit !== currentLimitMb) changes.storage_limit_mb = parsedLimit;
  const dirty = Object.keys(changes).length > 0;

  const save = useMutation({
    mutationFn: () => api.admin.userPatch(account.id, changes),
    onSuccess: () => {
      toast("User updated.", "success");
      queryClient.invalidateQueries({ queryKey: ["user", account.id] });
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
    },
    onError: (err) => toast(err instanceof ApiClientError ? err.message : "Could not save this user.", "error"),
  });

  return (
    <Card>
      <CardHeader title="Details" sub="Name, email, quota override, and account status." />
      <div className="space-y-4 px-5 py-4">
        <Field label="Name" error={errors.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Storage limit (MB)" error={errors.limitMb} hint="Blank = system default.">
            <Input
              type="number"
              min={1}
              step={1}
              value={limitMb}
              onChange={(e) => setLimitMb(e.target.value)}
              placeholder="Default"
            />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </Select>
          </Field>
        </div>
        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-xs text-slate-400">Created {formatDate(account.created_at)}</p>
          <Button
            variant="primary"
            icon="check"
            loading={save.isPending}
            disabled={invalid || !dirty}
            onClick={() => save.mutate()}
          >
            {dirty ? "Save changes" : "Saved"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function DangerZoneCard({ account }: { account: UserAdminDTO }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [oneTimeToken, setOneTimeToken] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"revoke" | "delete" | null>(null);

  const resetPassword = useMutation({
    mutationFn: () => api.admin.userResetPassword(account.id, password),
    onSuccess: () => {
      setPassword("");
      setConfirm("");
      toast(`Password reset for ${account.email}.`, "success");
    },
    onError: (err) => toast(err instanceof ApiClientError ? err.message : "Could not reset the password.", "error"),
  });

  const regenerate = useMutation({
    mutationFn: () => api.admin.userTokenRegenerate(account.id),
    onSuccess: ({ data }) => {
      setOneTimeToken(data.token);
      toast("New token issued.", "success");
      queryClient.invalidateQueries({ queryKey: ["user", account.id] });
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (err) => toast(err instanceof ApiClientError ? err.message : "Could not regenerate the token.", "error"),
  });

  const revoke = useMutation({
    mutationFn: () => api.admin.userTokenRevoke(account.id),
    onSuccess: () => {
      setConfirming(null);
      toast("Token revoked.", "success");
      queryClient.invalidateQueries({ queryKey: ["user", account.id] });
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (err) => toast(err instanceof ApiClientError ? err.message : "Could not revoke the token.", "error"),
  });

  const remove = useMutation({
    mutationFn: () => api.admin.userDelete(account.id),
    onSuccess: () => {
      setConfirming(null);
      toast(`${account.name} deleted.`, "success");
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "audio"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate({ to: "/admin/users" });
    },
    onError: (err) => toast(err instanceof ApiClientError ? err.message : "Could not delete this user.", "error"),
  });

  const passwordMismatch = confirm.length > 0 && confirm !== password;
  const passwordTooShort = password.length > 0 && password.length < 8;

  return (
    <Card>
      <CardHeader title="Danger Zone" sub="Password reset, token rotation, and account removal." />
      <div className="space-y-5 px-5 py-4">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (password.length < 8 || password !== confirm) return;
            resetPassword.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="New password"
              hint="At least 8 characters."
              error={passwordTooShort ? "Password must be at least 8 characters." : undefined}
            >
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="••••••••"
              />
            </Field>
            <Field label="Confirm" error={passwordMismatch ? "Passwords do not match." : undefined}>
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                placeholder="••••••••"
              />
            </Field>
          </div>
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            icon="key"
            loading={resetPassword.isPending}
            disabled={password.length < 8 || password !== confirm}
          >
            Reset password
          </Button>
        </form>

        <div className="border-t border-slate-100 pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">API token</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" icon="key" loading={regenerate.isPending} onClick={() => regenerate.mutate()}>
              Regenerate
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon="x"
              disabled={!account.token.has_token || account.token.revoked_at !== null}
              onClick={() => setConfirming("revoke")}
            >
              Revoke
            </Button>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <Button variant="danger" size="sm" icon="trash" onClick={() => setConfirming("delete")}>
            Delete user
          </Button>
        </div>
      </div>

      <Modal
        open={oneTimeToken !== null}
        onClose={() => setOneTimeToken(null)}
        title="New API token"
        footer={
          <Button variant="primary" onClick={() => setOneTimeToken(null)}>
            Done
          </Button>
        }
      >
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Copy this token now — the old one stopped working the moment it was issued.
        </p>
        <div className="flex gap-2">
          <Input
            readOnly
            value={oneTimeToken ?? ""}
            onFocus={(e) => e.currentTarget.select()}
            className="font-mono text-xs"
            aria-label="One-time API token"
          />
          <CopyButton text={oneTimeToken ?? ""} label="Copy" variant="primary" />
        </div>
        <p className="mt-2 text-xs text-slate-500">Store it now — it cannot be retrieved afterwards.</p>
      </Modal>

      <Modal
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={confirming === "delete" ? "Delete user" : "Revoke API token"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            {confirming === "delete" ? (
              <Button variant="danger" icon="trash" loading={remove.isPending} onClick={() => remove.mutate()}>
                Delete user
              </Button>
            ) : (
              <Button variant="danger" icon="x" loading={revoke.isPending} onClick={() => revoke.mutate()}>
                Revoke token
              </Button>
            )}
          </>
        }
      >
        {confirming === "delete" ? (
          <>
            <p className="text-sm text-slate-700">
              Delete <span className="font-semibold text-slate-900">{account.name}</span> ({account.email})?
            </p>
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              This deletes all of their audio files, API tokens, and sessions. It cannot be undone.
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-700">
            Revoke {account.name}'s current token? Every API call using it fails immediately. You can regenerate a new
            one afterwards.
          </p>
        )}
      </Modal>
    </Card>
  );
}

/* ---------------- right column ---------------- */

function TokenCard({ account }: { account: UserAdminDTO }) {
  const token = account.token;
  return (
    <Card>
      <CardHeader
        title="API Token"
        sub="Bearer token for the public REST API."
        action={
          !token.has_token ? (
            <Badge tone="slate">none</Badge>
          ) : token.revoked_at ? (
            <Badge tone="red">revoked</Badge>
          ) : (
            <Badge tone="green">active</Badge>
          )
        }
      />
      <div className="space-y-2 px-5 py-4">
        {token.masked ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">{token.masked}</p>
        ) : (
          <p className="text-sm text-slate-500">This account has no API token yet.</p>
        )}
        <p className="text-xs text-slate-500">
          Created {formatDate(token.created_at)} · last used {timeAgo(token.last_used_at)}
          {token.revoked_at ? ` · revoked ${timeAgo(token.revoked_at)}` : ""}
        </p>
        <p className="text-xs text-slate-400">Regenerate to issue a new one.</p>
      </div>
    </Card>
  );
}

function UsageCard({ account }: { account: UserAdminDTO }) {
  const limit = account.storage_limit_bytes;
  const percent = limit && limit > 0 ? Math.round((account.storage_used_bytes / limit) * 100) : null;
  return (
    <Card>
      <CardHeader title="Usage" sub="Storage quota and recent activity." />
      <div className="space-y-4 px-5 py-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Audio files</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{account.audio_count}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Storage</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
              {formatBytes(account.storage_used_bytes)}
            </p>
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
            <span>{limit ? `Limit ${formatBytes(limit)}` : "System default limit"}</span>
            <span className="tabular-nums">{percent === null ? "—" : `${percent}%`}</span>
          </div>
          <ProgressBar percent={percent ?? 0} />
        </div>
        <dl className="space-y-1.5 text-xs">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Last login</dt>
            <dd className="text-slate-700">{timeAgo(account.last_login_at)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Last API request</dt>
            <dd className="text-slate-700">{timeAgo(account.last_api_request_at)}</dd>
          </div>
        </dl>
      </div>
    </Card>
  );
}

function AudioCard({ account }: { account: UserAdminDTO }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [pendingDelete, setPendingDelete] = useState<AudioDTO | null>(null);

  const audio = useQuery({
    queryKey: ["admin", "audio", { user_id: account.id, per_page: 100 }],
    queryFn: () => api.admin.audioList({ user_id: account.id, per_page: 100 }),
  });

  const remove = useMutation({
    mutationFn: (target: AudioDTO) => api.admin.audioDelete(target.id),
    onSuccess: (_result, target) => {
      setPendingDelete(null);
      toast(`“${target.title}” deleted.`, "success");
      queryClient.invalidateQueries({ queryKey: ["admin", "audio"] });
      queryClient.invalidateQueries({ queryKey: ["user", account.id] });
      queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
    },
    onError: (err) => toast(err instanceof ApiClientError ? err.message : "Could not delete this file.", "error"),
  });

  const rows = audio.data?.data ?? [];
  return (
    <Card>
      <CardHeader
        title="Audio Files"
        sub={`${account.audio_count} file${account.audio_count === 1 ? "" : "s"} owned by this account`}
      />
      {audio.isPending && !audio.data ? (
        <div className="flex justify-center py-12 text-indigo-500">
          <Spinner className="h-6 w-6" />
        </div>
      ) : audio.isError ? (
        <EmptyState
          title="Could not load audio files"
          hint={audio.error instanceof ApiClientError ? audio.error.message : "Network error. Try again."}
          icon="music"
        />
      ) : rows.length === 0 ? (
        <EmptyState title="No audio yet" hint={`${account.name} has not uploaded anything.`} icon="music" />
      ) : (
        <Table head={["Track", "Size", "Duration", "Uploaded", ""]}>
          {rows.map((a) => (
            <tr key={a.id}>
              <Td>
                <p className="max-w-64 truncate font-medium text-slate-900">{a.title}</p>
                <p className="max-w-64 truncate text-xs text-slate-500">{a.filename}</p>
              </Td>
              <Td className="text-right tabular-nums">{formatBytes(a.size)}</Td>
              <Td className="text-right tabular-nums">{formatDuration(a.duration)}</Td>
              <Td className="text-right text-xs text-slate-500">{formatDate(a.created_at)}</Td>
              <Td className="text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  icon="trash"
                  aria-label={`Delete ${a.title}`}
                  onClick={() => setPendingDelete(a)}
                />
              </Td>
            </tr>
          ))}
        </Table>
      )}

      <Modal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Delete audio file"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon="trash"
              loading={remove.isPending}
              onClick={() => pendingDelete && remove.mutate(pendingDelete)}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          Delete <span className="font-semibold text-slate-900">{pendingDelete?.title}</span> from this account?
        </p>
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          The file is removed from storage and every stream or embed URL for it stops working. This cannot be undone.
        </p>
      </Modal>
    </Card>
  );
}
