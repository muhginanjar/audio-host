import { useState, type FormEvent } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ApiClientError, api } from "../lib/api";
import { Button, Card, Field, Input } from "../components/ui";
import { Icon } from "../components/icons";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const res = await fetch("/api/client/me", { credentials: "same-origin" });
    if (res.ok) throw redirect({ to: "/" });
  },
  component: LoginPage,
});

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.login(email, password);
      queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Login failed. Try again.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/20">
            <Icon name="music" className="h-6 w-6" />
          </div>
          <div className="text-center">
            <h1 className="text-lg font-semibold text-slate-900">Audio Hosting Platform</h1>
            <p className="text-sm text-slate-500">Sign in to manage your audio library</p>
          </div>
        </div>

        <Card className="p-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Email">
              <Input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>
            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" loading={loading} className="w-full">
              Sign in
            </Button>
          </form>
        </Card>
        <p className="mt-4 text-center text-xs text-slate-400">Accounts are created by your administrator.</p>
      </div>
    </div>
  );
}
