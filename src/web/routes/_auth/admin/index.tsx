import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ApiClientError, api } from "../../../lib/api";
import { formatBytes, formatDate, formatDuration } from "../../../lib/format";
import { PageHeader } from "../../../components/Layout";
import { AudioPlayer } from "../../../components/AudioPlayer";
import { Button, Card, CardHeader, EmptyState, Modal, ProgressBar, Spinner, StatCard, Table, Td } from "../../../components/ui";
import type { AudioDTO } from "@shared/types";

export const Route = createFileRoute("/_auth/admin/")({
  component: AdminDashboardPage,
});

function AdminDashboardPage() {
  const navigate = useNavigate();
  const [playing, setPlaying] = useState<AudioDTO | null>(null);

  const { data, isPending, error } = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => api.admin.overview().then((r) => r.data),
  });

  const stats = data?.overview;
  const heaviest = Math.max(1, ...(stats?.top_users_by_storage.map((u) => u.storage_used_bytes) ?? []));

  return (
    <>
      <PageHeader
        title="Admin Dashboard"
        sub="Platform-wide usage, the heaviest accounts, and the newest uploads."
        actions={
          <Button variant="primary" icon="users" onClick={() => navigate({ to: "/admin/users" })}>
            Manage Users
          </Button>
        }
      />

      {!data || !stats ? (
        error ? (
          <EmptyState
            title="Could not load the overview"
            hint={error instanceof ApiClientError ? error.message : "Network error. Try again."}
            icon="info"
          />
        ) : isPending ? (
          <div className="flex justify-center py-16 text-indigo-500">
            <Spinner className="h-7 w-7" />
          </div>
        ) : null
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <StatCard label="Total Users" value={stats.total_users} sub={`${stats.total_active_users} active`} />
            <StatCard label="Total Audio" value={stats.total_audio} sub="Across all accounts" />
            <StatCard label="Total Storage" value={formatBytes(stats.total_storage_bytes)} sub="Stored on disk" />
            <StatCard label="Uploads Today" value={stats.uploads_today} />
            <StatCard
              label="API Requests Today"
              value={stats.api_requests_today}
              sub={`${stats.api_errors_today} errors`}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader title="Top Storage Consumers" sub="Accounts using the most bytes" />
              {stats.top_users_by_storage.length === 0 ? (
                <EmptyState title="No storage in use yet" hint="Accounts appear here as they upload audio." icon="file" />
              ) : (
                <Table head={["User", "Audio", "Storage"]}>
                  {stats.top_users_by_storage.map((u) => (
                    <tr key={u.id}>
                      <Td>
                        <Link
                          to="/admin/users/$id"
                          params={{ id: String(u.id) }}
                          className="font-medium text-slate-900 hover:text-indigo-600"
                        >
                          {u.name}
                        </Link>
                        <p className="max-w-56 truncate text-xs text-slate-500">{u.email}</p>
                      </Td>
                      <Td className="text-right tabular-nums">{u.audio_count}</Td>
                      <Td className="w-40 text-right">
                        <p className="tabular-nums text-slate-700">{formatBytes(u.storage_used_bytes)}</p>
                        <div className="mt-1.5">
                          <ProgressBar percent={Math.round((u.storage_used_bytes / heaviest) * 100)} />
                        </div>
                      </Td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>

            <Card>
              <CardHeader title="Latest Uploads" sub="Newest files across the platform" />
              {data.recent_audio.length === 0 ? (
                <EmptyState title="Nothing uploaded yet" hint="New uploads show up here as soon as they land." icon="upload" />
              ) : (
                <Table head={["Track", "Size", "Duration", "Uploaded", ""]}>
                  {data.recent_audio.map((a) => (
                    <tr key={a.id}>
                      <Td>
                        <p className="max-w-56 truncate font-medium text-slate-900">{a.title}</p>
                        <p className="max-w-56 truncate text-xs text-slate-500">{a.owner ? `by ${a.owner.name}` : "—"}</p>
                      </Td>
                      <Td className="text-right tabular-nums">{formatBytes(a.size)}</Td>
                      <Td className="text-right tabular-nums">{formatDuration(a.duration)}</Td>
                      <Td className="text-right text-xs text-slate-500">{formatDate(a.created_at)}</Td>
                      <Td className="text-right">
                        <Button size="sm" variant="ghost" icon="play" aria-label={`Play ${a.title}`} onClick={() => setPlaying(a)} />
                      </Td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>
          </div>
        </div>
      )}

      <Modal open={playing !== null} onClose={() => setPlaying(null)} title={playing?.title ?? "Preview"}>
        {playing && <AudioPlayer audio={playing} />}
      </Modal>
    </>
  );
}
