import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { formatBytes, formatDuration, timeAgo } from "../lib/format";
import { Button, EmptyState, Input, Pagination, Select, Spinner, cn, useToast } from "./ui";
import { Icon } from "./icons";
import type { AudioDTO } from "@shared/types";

const FEED_LIMIT = 30;

/** Single source for header + row columns: # | title | plays | time | added+actions. */
const ROW_GRID = "grid-cols-[2rem_minmax(0,1fr)_auto] sm:grid-cols-[2.5rem_minmax(0,1fr)_3.5rem_4rem_8.5rem]";

interface FeedTrack extends AudioDTO {
  ownerName: string;
}

export function PlaylistHome() {
  const toast = useToast();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sort, setSort] = useState("created_at");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const feedStats = useQuery({ queryKey: ["feed", "stats"], queryFn: () => api.feedStats().then((r) => r.data) });
  const feed = useQuery({
    queryKey: ["feed", { page, search: debounced, sort, order }],
    queryFn: () =>
      api.feedList({ page, per_page: FEED_LIMIT, search: debounced || undefined, sort, order: order as "asc" | "desc" }),
  });

  const tracks: FeedTrack[] = (feed.data?.data ?? []).map((a) => ({ ...a, ownerName: a.owner?.name ?? "Unknown" }));
  const meta = feed.data?.meta;
  const st = feedStats.data;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Public playlist</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Fresh Tracks</h1>
          <p className="mt-1 text-sm text-slate-500">
            {st
              ? `${st.total_tracks} tracks · ${st.total_plays} plays · ${formatBytes(st.total_size_bytes)} · ${st.contributors} creators`
              : "Every public upload on this platform, newest first."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input className="w-52" placeholder="Search tracks…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} className="w-36">
            <option value="created_at">Newest</option>
            <option value="play_count">Most played</option>
            <option value="duration">Duration</option>
            <option value="title">Title A–Z</option>
          </Select>
          <Select value={order} onChange={(e) => { setOrder(e.target.value as "asc" | "desc"); setPage(1); }} className="w-28">
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </Select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className={cn("hidden items-center gap-3 border-b border-slate-100 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:grid sm:px-5", ROW_GRID)}>
          <span className="text-right">#</span>
          <span>Title</span>
          <span className="text-right">Plays</span>
          <span className="text-right">Time</span>
          <span className="text-right">Added</span>
        </div>

        {feed.isPending ? (
          <div className="flex items-center justify-center py-16 text-indigo-500">
            <Spinner className="h-6 w-6" />
          </div>
        ) : feed.isError ? (
          <EmptyState title="Could not load the playlist" hint="Reload the page to try again." icon="music" />
        ) : tracks.length === 0 ? (
          <EmptyState title="No public tracks yet" hint="Be the first to upload something public." icon="upload" />
        ) : (
          <ol>
            {tracks.map((a, i) => {
              const active = playingId === a.id;
              return (
                <li key={a.id} className={cn("border-b border-slate-50 last:border-0", active && "bg-indigo-50/60")}>
                  <div
                    className={cn("group grid cursor-pointer items-center gap-3 px-4 py-2.5 sm:px-5", ROW_GRID)}
                    onClick={() => setPlayingId(active ? null : a.id)}
                    title={active ? "Stop" : `Play ${a.title}`}
                  >
                    <span className="text-right text-xs tabular-nums text-slate-400">{(meta ? (meta.page - 1) * meta.per_page : 0) + i + 1}</span>
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                        {active ? (
                          <span className="eq text-indigo-600">
                            <span />
                            <span />
                            <span />
                          </span>
                        ) : (
                          <Icon name="play" className="h-4 w-4 translate-x-[1px]" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className={cn("block truncate text-sm font-medium", active ? "text-indigo-700" : "text-slate-900")}>
                          {a.title || a.filename}
                        </span>
                        <span className="block truncate text-xs text-slate-400">{a.ownerName}</span>
                      </span>
                    </span>
                    <span className="hidden whitespace-nowrap text-right text-xs tabular-nums text-slate-400 sm:block">{a.play_count.toLocaleString()}</span>
                    <span className="whitespace-nowrap text-right text-xs tabular-nums text-slate-500">{formatDuration(a.duration)}</span>
                    <span className="hidden min-w-0 items-center justify-end gap-1 sm:flex">
                      <span className="truncate text-xs text-slate-400">{timeAgo(a.created_at)}</span>
                      <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          size="sm"
                          variant="ghost"
                          icon="link"
                          title="Copy public URL"
                          onClick={async (e) => {
                            e.stopPropagation();
                            await copyText(a.url, toast);
                          }}
                        />
                        <a
                          href={a.download_url}
                          title="Download"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          <Icon name="download" className="h-4 w-4" />
                        </a>
                      </span>
                    </span>
                    <span className="col-start-3 flex items-center justify-end gap-0.5 sm:hidden">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="link"
                        title="Copy public URL"
                        onClick={async (e) => {
                          e.stopPropagation();
                          await copyText(a.url, toast);
                        }}
                      />
                      <a
                        href={a.download_url}
                        title="Download"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Icon name="download" className="h-4 w-4" />
                      </a>
                    </span>
                  </div>
                  {active && (
                    <div className="border-t border-indigo-100 bg-indigo-50/40 px-4 py-2 sm:px-14">
                      <audio controls autoPlay preload="metadata" className="h-9 w-full" onEnded={() => setPlayingId(null)}>
                        <source src={a.url} type={a.mime_type} />
                      </audio>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {meta && meta.total_pages > 1 && (
          <div className="border-t border-slate-100">
            <Pagination page={meta.page} totalPages={meta.total_pages} onPage={setPage} />
          </div>
        )}
      </div>

      <StickyPlayer tracks={tracks} playingId={playingId} onStop={() => setPlayingId(null)} onNext={() => advance(tracks, playingId, setPlayingId, 1)} onPrev={() => advance(tracks, playingId, setPlayingId, -1)} />
    </div>
  );
}

function advance(tracks: FeedTrack[], current: string | null, set: (id: string | null) => void, dir: 1 | -1) {
  if (tracks.length === 0) return;
  const idx = tracks.findIndex((t) => t.id === current);
  const next = idx < 0 ? tracks[0] : tracks[(idx + dir + tracks.length) % tracks.length];
  set(next.id);
}

function StickyPlayer({
  tracks,
  playingId,
  onStop,
  onNext,
  onPrev,
}: {
  tracks: FeedTrack[];
  playingId: string | null;
  onStop: () => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const track = tracks.find((t) => t.id === playingId) ?? null;
  if (!track) return null;

  return (
    <div className="sticky bottom-4 z-30 mt-6 overflow-hidden rounded-2xl border border-slate-900 bg-slate-900 text-white shadow-2xl">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="eq text-emerald-400">
          <span />
          <span />
          <span />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{track.title || track.filename}</p>
          <p className="truncate text-xs text-slate-400">{track.ownerName}</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onPrev} title="Previous" className="rounded-full p-2 text-slate-300 hover:bg-white/10 hover:text-white">
            <Icon name="play" className="h-4 w-4 -scale-x-100" />
          </button>
          <button onClick={onStop} title="Stop" className="rounded-full bg-white p-2.5 text-slate-900 hover:bg-slate-200">
            <Icon name="x" className="h-4 w-4" />
          </button>
          <button onClick={onNext} title="Next" className="rounded-full p-2 text-slate-300 hover:bg-white/10 hover:text-white">
            <Icon name="play" className="h-4 w-4" />
          </button>
        </div>
      </div>
      <audio ref={audioRef} key={track.id} controls autoPlay preload="metadata" className="player-dark h-9 w-full px-2 pb-1" onEnded={onNext}>
        <source src={track.url} type={track.mime_type} />
      </audio>
    </div>
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
