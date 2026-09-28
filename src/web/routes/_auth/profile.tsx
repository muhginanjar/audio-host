import { useState, type FormEvent, type ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiClientError, api } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { formatBytes, formatDate, formatDateTime, timeAgo } from "../../lib/format";
import { PageHeader } from "../../components/Layout";
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
  Spinner,
  useToast,
} from "../../components/ui";

export const Route = createFileRoute("/_auth/profile")({
  component: ProfilePage,
});

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-2.5 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900">{children}</span>
    </div>
  );
}

function ProfilePage() {
  const me = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();

  const [plainToken, setPlainToken] = useState<string | null>(null);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);

  const regenerate = useMutation({
    mutationFn: () => api.regenerateOwnToken().then((r) => r.data.token),
    onSuccess: (token: string) => setPlainToken(token),
    onError: (err: unknown) => toast(err instanceof ApiClientError ? err.message : "Could not regenerate the token.", "error"),
  });

  const changePassword = useMutation({
    mutationFn: (body: { current: string; next: string }) => api.changePassword(body.current, body.next),
    onSuccess: () => {
      toast("Password changed. Please sign in again.", "success");
      qc.clear();
      navigate({ to: "/login" });
    },
    onError: (err: unknown) => {
      setPwError(err instanceof ApiClientError ? err.message : "Could not change the password.");
    },
  });

  if (me.isError) {
    return (
      <>
        <PageHeader title="Profile" />
        <Card>
          <EmptyState
            title="Could not load your profile"
            hint={me.error instanceof ApiClientError ? me.error.message : "Please try again."}
            icon="user"
          />
        </Card>
      </>
    );
  }

  if (!me.data) {
    return (
      <div className="flex h-64 items-center justify-center text-indigo-500">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }

  const user = me.data;
  const token = user.token;

  function onSubmitPassword(e: FormEvent) {
    e.preventDefault();
    setPwError(null);
    if (newPw.length < 8) {
      setPwError("The new password must be at least 8 characters.");
      return;
    }
    if (newPw !== confirmPw) {
      setPwError("The new passwords do not match.");
      return;
    }
    changePassword.mutate({ current: currentPw, next: newPw });
  }

  return (
    <>
      <PageHeader title="Profile" sub="Your account, storage and API access" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Account" />
          <div className="py-2">
            <InfoRow label="Name">{user.name}</InfoRow>
            <InfoRow label="Email">{user.email}</InfoRow>
            <InfoRow label="Role">
              <Badge tone={user.role === "admin" ? "indigo" : "slate"}>{user.role}</Badge>
            </InfoRow>
            <InfoRow label="Status">
              <Badge tone={user.status === "active" ? "green" : "red"}>{user.status}</Badge>
            </InfoRow>
            <InfoRow label="Member since">{formatDate(user.created_at)}</InfoRow>
            <InfoRow label="Last login">{user.last_login_at ? formatDateTime(user.last_login_at) : "never"}</InfoRow>
          </div>
        </Card>

        <Card>
          <CardHeader title="Storage" sub={`${user.audio_count} file${user.audio_count === 1 ? "" : "s"} uploaded`} />
          <div className="px-5 py-5">
            <div className="mb-2 flex items-baseline justify-between text-sm">
              <span className="font-semibold text-slate-900">{formatBytes(user.storage.used_bytes)}</span>
              <span className="text-slate-500">of {formatBytes(user.storage.limit_bytes)}</span>
            </div>
            <ProgressBar percent={user.storage.percent_used} />
            <p className="mt-2 text-xs text-slate-500">
              {user.storage.percent_used}% used · {formatBytes(user.storage.remaining_bytes)} remaining
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="API Token"
            sub="Used for the REST API — see the Documentation page"
            action={
              <Button
                size="sm"
                variant="danger"
                icon="key"
                loading={regenerate.isPending}
                onClick={() => regenerate.mutate()}
              >
                Regenerate Token
              </Button>
            }
          />
          <div className="py-2">
            <InfoRow label="Token">
              <span className="break-all font-mono text-xs">{token.masked ?? "No token issued"}</span>
            </InfoRow>
            <InfoRow label="State">
              {token.revoked_at ? (
                <Badge tone="red">Revoked</Badge>
              ) : token.has_token ? (
                <Badge tone="green">Active</Badge>
              ) : (
                <Badge tone="slate">None</Badge>
              )}
            </InfoRow>
            <InfoRow label="Created">{timeAgo(token.created_at)}</InfoRow>
            <InfoRow label="Last used">{timeAgo(token.last_used_at)}</InfoRow>
          </div>
        </Card>

        <Card>
          <CardHeader title="Change Password" />
          <form onSubmit={onSubmitPassword} className="space-y-4 px-5 py-4">
            <Field label="Current password">
              <Input
                type="password"
                autoComplete="current-password"
                required
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                placeholder="••••••••"
              />
            </Field>
            <Field label="New password" error={pwError ?? undefined} hint="At least 8 characters.">
              <Input
                type="password"
                autoComplete="new-password"
                required
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="••••••••"
              />
            </Field>
            <Field label="Confirm new password">
              <Input
                type="password"
                autoComplete="new-password"
                required
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="••••••••"
              />
            </Field>
            <div>
              <Button type="submit" variant="primary" loading={changePassword.isPending}>
                Change password
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              Changing your password signs you out of every device and browser session immediately.
            </p>
          </form>
        </Card>
      </div>

      <Modal
        open={!!plainToken}
        onClose={() => {
          setPlainToken(null);
          qc.invalidateQueries({ queryKey: ["me"] });
        }}
        title="Your new API token"
        footer={
          <Button
            variant="primary"
            onClick={() => {
              setPlainToken(null);
              qc.invalidateQueries({ queryKey: ["me"] });
            }}
          >
            Done
          </Button>
        }
      >
        <div className="space-y-4">
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            This is the only time it will be shown. Copy it now and store it somewhere safe — the old token stopped working the moment this page
            loaded.
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900">{plainToken}</code>
            <CopyButton text={plainToken ?? ""} label="Copy" />
          </div>
        </div>
      </Modal>
    </>
  );
}
