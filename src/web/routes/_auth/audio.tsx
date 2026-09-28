import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiClientError, api } from "../../lib/api";
import type { AudioDTO } from "@shared/types";
import { formatBitrate, formatBytes, formatDate, formatDateTime, formatDuration, sampleRateHz, timeAgo } from "../../lib/format";
import { PageHeader } from "../../components/Layout";
import { AudioPlayer } from "../../components/AudioPlayer";
import {
  Badge,
  Button,
  Card,
  CopyButton,
  EmptyState,
  Field,
  Input,
  Label,
  Modal,
  Pagination,
  Select,
  Spinner,
  Table,
  Td,
  Textarea,
  useToast,
} from "../../components/ui";
import { Icon } from "../../components/icons";

export const Route = createFileRoute("/_auth/audio")({
  component: AudioPage,
});

const FORMATS = ["mp3", "wav", "m4a", "aac", "ogg", "flac"];

const SORTS: { value: string; label: string }[] = [
  { value: "created_at", label: "Upload date" },
  { value: "updated_at", label: "Last updated" },
  { value: "title", label: "Title" },
  { value: "size", label: "Size" },
  { value: "duration", label: "Duration" },
  { value: "play_count", label: "Plays" },
];

const STATUS_TONE: Record<string, "amber" | "red"> = { pending: "amber", error: "red" };

/** `<audio>` embed snippet for a delivered file. */
function audioTag(a: { url: string; mime_type: string }): string {
  return `<audio controls preload="metadata">\n    <source src="${a.url}" type="${a.mime_type}">\n</audio>`;
}

/** Iframe snippet pointing at the hosted player page. */
function iframeTag(embedUrl: string): string {
  return `<iframe src="${embedUrl}" width="100%" height="80" style="border:0;border-radius:8px" allow="autoplay"></iframe>`;
}

function DetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const detail = useQuery({
    queryKey: ["audio", "detail", id],
    queryFn: () => api.audioGet(id).then((r) => r.data),
    enabled: !!id,
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("public");

  useEffect(() => {
    if (detail.data) {
      setTitle(detail.data.title);
      setDescription(detail.data.description);
      setVisibility(detail.data.visibility);
    }
  }, [detail.data]);

  const patch = useMutation({
    mutationFn: (body: { title: string; description: string; visibility: string }) =>
      api.audioPatch(id, body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audio"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast("Audio updated.", "success");
    },
    onError: (err: unknown) => toast(err instanceof ApiClientError ? err.message : "Update failed.", "error"),
  });

  const a = detail.data;

  return (
    <Modal open onClose={onClose} title={a ? a.title || a.filename : "Audio details"} wide>
      {!a ? (
        <div className="flex h-40 items-center justify-center text-indigo-500">
          <Spinner className="h-6 w-6" />
        </div>
      ) : detail.isError ? (
        <p className="text-sm text-red-600">{detail.error instanceof ApiClientError ? detail.error.message : "Could not load details."}</p>
      ) : (
        <div className="space-y-6">
          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Metadata</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              {[
                { k: "MIME type", v: a.mime_type },
                { k: "Container", v: a.format ?? "—" },
                { k: "Codec", v: a.codec ?? "—" },
                { k: "Bitrate", v: formatBitrate(a.bitrate) },
                { k: "Sample rate", v: sampleRateHz(a.sample_rate) },
                { k: "Channels", v: a.channels ?? "—" },
                { k: "Duration", v: formatDuration(a.duration) },
                { k: "Size", v: formatBytes(a.size) },
                { k: "Plays", v: a.play_count },
                { k: "Created", v: formatDateTime(a.created_at) },
                { k: "Updated", v: formatDateTime(a.updated_at) },
                { k: "ID", v: <span className="break-all font-mono text-xs">{a.id}</span> },
              ].map((row, i) => (
                <div key={i}>
                  <dt className="text-[11px] uppercase tracking-wide text-slate-400">{row.k}</dt>
                  <dd className="mt-0.5 text-sm font-medium text-slate-800">{row.v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Playback stats</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                { k: "Total plays", v: a.stats.play_count },
                { k: "Today", v: a.stats.plays_today },
                { k: "Last 7 days", v: a.stats.plays_7d },
                { k: "Last played", v: timeAgo(a.stats.last_played_at) },
                { k: "Unique visitors (7d)", v: a.stats.unique_visitors_7d },
              ].map((row, i) => (
                <div key={i} className="rounded-lg bg-slate-50 px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">{row.k}</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-800">{row.v}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Edit</p>
            <div className="space-y-4">
              <Field label="Title">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Display title" />
              </Field>
              <Field label="Description">
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
              </Field>
              <Field label="Visibility" hint="Private files are only served through the authenticated stream endpoint.">
                <Select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                </Select>
              </Field>
              <Button variant="primary" size="sm" loading={patch.isPending} onClick={() => patch.mutate({ title, description, visibility })}>
                Save changes
              </Button>
            </div>
          </section>

          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Embed</p>
            <div className="space-y-4">
              <div>
                <Label>Audio element</Label>
                <Textarea
                  readOnly
                  value={audioTag(a)}
                  className="mt-1 font-mono text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <div className="mt-2">
                  <CopyButton text={audioTag(a)} label="Copy audio embed" />
                </div>
              </div>
              <div>
                <Label>Iframe (hosted player page)</Label>
                <Textarea
                  readOnly
                  value={iframeTag(a.embed_url)}
                  className="mt-1 font-mono text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <div className="mt-2 flex items-center gap-2">
                  <CopyButton text={iframeTag(a.embed_url)} label="Copy iframe embed" />
                  <a href={a.embed_url} target="_blank" rel="noreferrer" className="text-xs font-medium text-indigo-600 hover:text-indigo-500">
                    Open page
                  </a>
                </div>
                <div className="mt-3">
                  <Label>Live preview</Label>
                  <iframe src={a.embed_url} height={80} title="Embed preview" className="mt-1 w-full rounded-lg border border-slate-200" />
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
}

function AudioPage() {
  const qc = useQueryClient();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [format, setFormat] = useState("");
  const [sort, setSort] = useState("created_at");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const [playing, setPlaying] = useState<AudioDTO | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AudioDTO | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const list = useQuery({
    queryKey: ["audio", { page, search: debouncedSearch, format, sort, order }],
    queryFn: () =>
      api.audioList({
        page,
        search: debouncedSearch || undefined,
        format: format || undefined,
        sort,
        order,
      }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.audioDelete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audio"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast("Audio deleted.", "success");
      setDeleteTarget(null);
    },
    onError: (err: unknown) => toast(err instanceof ApiClientError ? err.message : "Delete failed.", "error"),
  });

  const rows = list.data?.data ?? [];
  const meta = list.data?.meta;

  return (
    <>
      <PageHeader
        title="Audio"
        sub={meta ? `${meta.total.toLocaleString()} file${meta.total === 1 ? "" : "s"} in your library` : "Manage your uploaded audio files"}
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
          <div className="relative min-w-56 flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <Icon name="search" className="h-4 w-4" />
            </span>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, filename, description…"
              className="pl-9"
            />
          </div>
          <Select value={format} onChange={(e) => { setFormat(e.target.value); setPage(1); }} className="w-36">
            <option value="">All formats</option>
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f.toUpperCase()}
              </option>
            ))}
          </Select>
          <Select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} className="w-40">
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <Select value={order} onChange={(e) => { setOrder(e.target.value as "asc" | "desc"); setPage(1); }} className="w-36">
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </Select>
        </div>

        {list.isError ? (
          <EmptyState
            title="Could not load audio"
            hint={list.error instanceof ApiClientError ? list.error.message : "Please try again."}
            icon="music"
          />
        ) : list.isPending ? (
          <div className="flex h-40 items-center justify-center text-indigo-500">
            <Spinner className="h-6 w-6" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No audio found"
            hint={debouncedSearch || format ? "Try different search terms or filters." : "Upload your first file from the Upload page."}
            icon="music"
          />
        ) : (
          <>
            <Table head={["Audio", "Size", "Duration", "Format", "Uploaded", "Actions"]}>
              {rows.map((a) => (
                <tr key={a.id}>
                  <Td>
                    <div className="min-w-0 max-w-[280px]">
                      <p className="truncate font-medium text-slate-900">{a.title || a.filename}</p>
                      <p className="truncate text-xs text-slate-400">{a.filename}</p>
                      <div className="mt-1 flex gap-1.5">
                        <Badge tone={a.visibility === "private" ? "amber" : "slate"}>
                          {a.visibility === "private" ? "Private" : "Public"}
                        </Badge>
                        {a.status !== "ready" && (
                          <Badge tone={STATUS_TONE[a.status] ?? "amber"}>{a.status}</Badge>
                        )}
                      </div>
                    </div>
                  </Td>
                  <Td className="text-right">{formatBytes(a.size)}</Td>
                  <Td className="text-right">{formatDuration(a.duration)}</Td>
                  <Td className="text-right">
                    <Badge>{a.extension.toUpperCase()}</Badge>
                  </Td>
                  <Td className="text-right">{formatDate(a.created_at)}</Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" icon="play" title="Play" onClick={() => setPlaying(a)} />
                      <Button size="sm" variant="ghost" icon="info" title="Details & embed" onClick={() => setDetailId(a.id)} />
                      <CopyButton text={a.url} variant="ghost" size="sm" icon="copy" label="URL" />
                      <a
                        href={a.download_url}
                        title="Download"
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100"
                      >
                        <Icon name="download" className="h-4 w-4" />
                      </a>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="trash"
                        title="Delete"
                        className="hover:bg-red-50 hover:text-red-600"
                        onClick={() => setDeleteTarget(a)}
                      />
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
            <div className="border-t border-slate-100">
              <Pagination page={meta?.page ?? page} totalPages={meta?.total_pages ?? 1} onPage={setPage} />
            </div>
          </>
        )}
      </Card>

      <Modal open={!!playing} onClose={() => setPlaying(null)} title={playing ? playing.title || playing.filename : "Play"} wide>
        {playing && (
          <div className="space-y-4">
            <AudioPlayer audio={playing} />
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton text={playing.url} label="Copy URL" />
              <CopyButton text={audioTag(playing)} label="Copy Embed" />
              <a
                href={playing.download_url}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <Icon name="download" className="h-4 w-4" /> Download
              </a>
            </div>
          </div>
        )}
      </Modal>

      {detailId && <DetailModal id={detailId} onClose={() => setDetailId(null)} />}

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete audio?"
        footer={
          <>
            <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => deleteTarget && remove.mutate(deleteTarget.id)}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Are you sure you want to delete{" "}
          <span className="font-semibold text-slate-900">“{deleteTarget?.title || deleteTarget?.filename}”</span>? The file, its public URL and all
          play history will be removed. This cannot be undone.
        </p>
      </Modal>
    </>
  );
}
