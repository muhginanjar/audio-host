import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { formatBytes, formatDuration, timeAgo } from "../../lib/format";
import { Button, Card, EmptyState, Input, Pagination, Spinner, cn, useToast } from "../../components/ui";
import { PageHeader } from "../../components/Layout";
import { Icon } from "../../components/icons";
import type { AudioDTO } from "@shared/types";
export const Route = createFileRoute("/_auth/dashboard")({
  component: DashboardPage,
});

const TRACKS_LIMIT = 30;

type ListItem = AudioDTO;

function DashboardPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const stats = useQuery({ queryKey: ["stats"], queryFn: () => api.stats().then((r) => r.data) });
  const mine = useQuery({
    queryKey: ["audio", "mine", { page, search: debounced }],
    queryFn: () => api.audioList({ page, per_page: TRACKS_LIMIT, search: debounced || undefined, sort: "created_at", order: "desc" }),
  });

  if (stats.isError) return <EmptyState title="Could not load your dashboard" hint="Reload the page to try again." icon="logs" />;
  if (!stats.data) {
    return (
      <div className="flex h-64 items-center justify-center text-indigo-500">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }

  const s = stats.data;
  const tracks: ListItem[] = (mine.data?.data ?? []).map((a) => ({ ...a, url: a.url, ownerName: "You" }));
  const meta = mine.data?.meta;

  return (
    <>
      <PageHeader title="Dashboard" sub="Your personal library, uploads and API usage." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total Audio</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{s.audio_count}</p>
          <p className="mt-1 text-xs text-slate-500">files hosted</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Storage Used</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{s.storage.percent_used}%</p>
          <p className="mt-1 text-xs text-slate-500">
            {formatBytes(s.storage_used_bytes)} of {formatBytes(s.storage.limit_bytes)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Uploads Today</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{s.uploads_today}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Plays Today</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{s.plays_today}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">API Requests Today</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{s.api_requests_today}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Your Tracks</h3>
              <p className="mt-0.5 text-xs text-slate-500">Only files you uploaded — newest first.</p>
            </div>
            <Input
              className="w-56"
              placeholder="Search your tracks…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <TrackList tracks={tracks} loading={mine.isPending} playingId={playingId} onToggle={setPlayingId} qc={qc} toast={toast} />
          {meta && meta.total_pages > 1 && <Pagination page={meta.page} totalPages={meta.total_pages} onPage={setPage} />}
        </Card>

        <Card className="lg:col-span-2">
          <div className="border-b border-slate-100 px-5 py-4">
            <h3 className="text-sm font-semibold text-slate-900">Recent Activity</h3>
            <p className="mt-0.5 text-xs text-slate-500">Uploads, plays and API calls</p>
          </div>
          {s.recent_activity.length === 0 ? (
            <EmptyState title="No recent activity" hint="Events will appear here as your audio gets played and the API is used." icon="logs" />
          ) : (
            <div>
              {s.recent_activity.slice(0, 8).map((a, i) => (
                <div key={i} className="flex items-center gap-3 border-b border-slate-100 px-5 py-3 text-sm last:border-0">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                    <Icon name={a.kind === "upload" ? "upload" : a.kind === "play" ? "play" : "code"} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-800">{a.label}</p>
                    {a.detail && <p className="truncate text-xs text-slate-500">{a.detail}</p>}
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">{timeAgo(a.at)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function TrackList({
  tracks,
  loading,
  playingId,
  onToggle,
  qc,
  toast,
}: {
  tracks: ListItem[];
  loading: boolean;
  playingId: string | null;
  onToggle: (id: string | null) => void;
  qc: ReturnType<typeof useQueryClient>;
  toast: ReturnType<typeof useToast>;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-indigo-500">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }
  if (tracks.length === 0) return <EmptyState title="No tracks yet" hint="Upload your first audio file from the Upload page." icon="upload" />;

  return (
    <ol>
      {tracks.map((a, i) => {
        const active = playingId === a.id;
        return (
          <li key={a.id}>
            <div
              className={cn(
                "group flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm transition-colors sm:px-5",
                active ? "bg-indigo-50/70" : "hover:bg-slate-50",
              )}
              onClick={() => onToggle(active ? null : a.id)}
              title={active ? "Stop" : `Play ${a.title}`}
            >
              <span className="w-6 shrink-0 text-right text-xs tabular-nums text-slate-400">{String(i + 1).padStart(2, "0")}</span>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                {active ? (
                  <span className="eq text-indigo-600">
                    <span />
                    <span />
                    <span />
                  </span>
                ) : (
                  <Icon name="music" className="h-4 w-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate font-medium", active ? "text-indigo-700" : "text-slate-900")}>{a.title || a.filename}</span>
                <span className="block truncate text-xs text-slate-400">You</span>
              </span>
              <span className="hidden shrink-0 text-xs tabular-nums text-slate-400 sm:block">{formatBytes(a.size)}</span>
              <span className="shrink-0 text-xs tabular-nums text-slate-500">{formatDuration(a.duration)}</span>
              <span className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <CopyButtons track={a} qc={qc} toast={toast} />
              </span>
            </div>
            {active && (
              <div className="border-y border-indigo-100 bg-indigo-50/40 px-4 py-2 sm:px-12">
                <audio
                  ref={audioRef}
                  controls
                  autoPlay
                  preload="metadata"
                  className="h-9 w-full"
                  onEnded={() => onToggle(null)}
                >
                  <source src={a.url} type={a.mime_type} />
                </audio>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function CopyButtons({ track, qc, toast }: { track: ListItem; qc: ReturnType<typeof useQueryClient>; toast: ReturnType<typeof useToast> }) {
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        icon="link"
        title="Copy public URL"
        onClick={async (e) => {
          e.stopPropagation();
          await copyText(track.url, toast);
        }}
      />
      <a
        href={track.download_url}
        title="Download"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        <Icon name="download" className="h-4 w-4" />
      </a>
      <Button
        size="sm"
        variant="ghost"
        icon="trash"
        title={`Delete ${track.title}`}
        onClick={(e) => {
          e.stopPropagation();
          if (window.confirm(`Delete "${track.title}"? This removes the file permanently.`)) {
            api
              .audioDelete(track.id)
              .then(() => {
                toast("Track deleted.", "success");
                qc.invalidateQueries({ queryKey: ["audio"] });
                qc.invalidateQueries({ queryKey: ["stats"] });
                qc.invalidateQueries({ queryKey: ["me"] });
              })
              .catch((err: Error) => toast(err.message, "error"));
          }
        }}
      />
    </>
  );
}

async function copyText(text: string, toast: ReturnType<typeof useToast>) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied to clipboard.", "success");
  } catch {
    toast("Could not access the clipboard.", "error");
  }
}

