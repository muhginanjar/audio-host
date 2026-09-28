import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiClientError, api } from "../../../lib/api";
import { formatBitrate, formatBytes, formatDate, formatDateTime, formatDuration, sampleRateHz } from "../../../lib/format";
import { PageHeader } from "../../../components/Layout";
import { AudioPlayer } from "../../../components/AudioPlayer";
import { Icon } from "../../../components/icons";
import {
  Badge,
  Button,
  Card,
  CopyButton,
  EmptyState,
  Input,
  Label,
  Modal,
  Pagination,
  Select,
  Spinner,
  Table,
  Td,
  useToast,
} from "../../../components/ui";
import type { AudioDTO } from "@shared/types";

export const Route = createFileRoute("/_auth/admin/audio")({
  component: AdminAudioPage,
});

const FORMATS = ["mp3", "wav", "m4a", "aac", "ogg", "flac"];
const SORTS: { value: string; label: string }[] = [
  { value: "created_at", label: "Upload date" },
  { value: "updated_at", label: "Last modified" },
  { value: "title", label: "Title" },
  { value: "size", label: "File size" },
  { value: "duration", label: "Duration" },
  { value: "play_count", label: "Play count" },
];
const PER_PAGE = 20;

function embedSnippet(audio: AudioDTO): string {
  return `<audio controls preload="metadata">\n    <source src="${audio.url}" type="${audio.mime_type}">\n</audio>`;
}

function AdminAudioPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [ownerId, setOwnerId] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [format, setFormat] = useState("");
  const [sort, setSort] = useState("created_at");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const [playing, setPlaying] = useState<AudioDTO | null>(null);
  const [detail, setDetail] = useState<AudioDTO | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AudioDTO | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const owners = useQuery({
    queryKey: ["admin", "users", { per_page: 100, page: 1 }],
    queryFn: () => api.admin.users({ page: 1, per_page: 100 }),
  });

  const audio = useQuery({
    queryKey: [
      "admin",
      "audio",
      { user_id: ownerId ? Number(ownerId) : undefined, search: debounced, format, sort, order, page, per_page: PER_PAGE },
    ],
    queryFn: () =>
      api.admin.audioList({
        user_id: ownerId ? Number(ownerId) : undefined,
        search: debounced || undefined,
        format: format || undefined,
        sort,
        order,
        page,
        per_page: PER_PAGE,
      }),
  });

  const remove = useMutation({
    mutationFn: (target: AudioDTO) => api.admin.audioDelete(target.id),
    onSuccess: (_result, target) => {
      setPendingDelete(null);
      setDetail(null);
      toast(`“${target.title}” deleted.`, "success");
      queryClient.invalidateQueries({ queryKey: ["admin", "audio"] });
      queryClient.invalidateQueries({ queryKey: ["user"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
    },
    onError: (err) => toast(err instanceof ApiClientError ? err.message : "Could not delete this file.", "error"),
  });

  const rows = audio.data?.data ?? [];
  const meta = audio.data?.meta;

  const selectedOwner = owners.data?.data.find((u) => String(u.id) === ownerId)?.name;

  return (
    <>
      <PageHeader
        title="All Audio"
        sub={meta ? `${meta.total} file${meta.total === 1 ? "" : "s"} across every account` : "Every upload on the platform."}
      />

      <Card className="mb-6 px-5 py-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <Label>Owner</Label>
            <Select
              value={ownerId}
              onChange={(e) => {
                setOwnerId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All owners</option>
              {(owners.data?.data ?? []).map((u) => (
                <option key={u.id} value={String(u.id)}>
                  {u.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Search</Label>
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Title, filename, or description"
            />
          </div>
          <div>
            <Label>Format</Label>
            <Select
              value={format}
              onChange={(e) => {
                setFormat(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All formats</option>
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f.toUpperCase()}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Sort by</Label>
            <div className="flex gap-2">
              <Select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  setPage(1);
                }}
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
              <Select
                value={order}
                aria-label="Sort direction"
                onChange={(e) => {
                  setOrder(e.target.value as "asc" | "desc");
                  setPage(1);
                }}
              >
                <option value="desc">Desc</option>
                <option value="asc">Asc</option>
              </Select>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        {audio.isPending && !audio.data ? (
          <div className="flex justify-center py-16 text-indigo-500">
            <Spinner className="h-7 w-7" />
          </div>
        ) : audio.isError ? (
          <EmptyState
            title="Could not load audio"
            hint={audio.error instanceof ApiClientError ? audio.error.message : "Network error. Try again."}
            icon="music"
          />
        ) : rows.length === 0 ? (
          <EmptyState title="No audio matches these filters" hint="Widen the search or pick another owner." icon="music" />
        ) : (
          <Table
            head={[
              "Track",
              <div className="text-left">Visibility</div>,
              "Size",
              "Duration",
              "Plays",
              "Uploaded",
              "Actions",
            ]}
          >
            {rows.map((a) => (
              <tr key={a.id}>
                <Td>
                  <p className="max-w-64 truncate font-medium text-slate-900">{a.title}</p>
                  <p className="max-w-64 truncate text-xs text-slate-500">
                    {a.owner ? `by ${a.owner.name}` : `by ${selectedOwner ?? "unknown owner"}`}
                  </p>
                </Td>
                <Td className="text-left">
                  <Badge tone={a.visibility === "public" ? "green" : "slate"}>{a.visibility}</Badge>
                </Td>
                <Td className="text-right tabular-nums">{formatBytes(a.size)}</Td>
                <Td className="text-right tabular-nums">{formatDuration(a.duration)}</Td>
                <Td className="text-right tabular-nums">{a.play_count}</Td>
                <Td className="text-right text-xs text-slate-500">{formatDate(a.created_at)}</Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="ghost" icon="play" aria-label={`Play ${a.title}`} onClick={() => setPlaying(a)} />
                    <CopyButton text={a.url} label="" size="sm" variant="ghost" icon="link" />
                    <CopyButton text={embedSnippet(a)} label="" size="sm" variant="ghost" icon="code" />
                    <a
                      href={a.download_url}
                      download
                      aria-label={`Download ${a.title}`}
                      className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    >
                      <Icon name="download" className="h-4 w-4" />
                    </a>
                    <Button size="sm" variant="ghost" icon="info" aria-label={`Details for ${a.title}`} onClick={() => setDetail(a)} />
                    <Button size="sm" variant="ghost" icon="trash" aria-label={`Delete ${a.title}`} onClick={() => setPendingDelete(a)} />
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
        {meta && <Pagination page={meta.page} totalPages={meta.total_pages} onPage={setPage} />}
      </Card>

      <Modal open={playing !== null} onClose={() => setPlaying(null)} title={playing?.title ?? "Preview"}>
        {playing && <AudioPlayer audio={playing} />}
      </Modal>

      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail ? detail.title : "File details"}
        wide
        footer={
          <Button variant="secondary" onClick={() => setDetail(null)}>
            Close
          </Button>
        }
      >
        {detail && (
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <Badge tone={detail.visibility === "public" ? "green" : "slate"}>{detail.visibility}</Badge>
              <Badge tone={detail.status === "ready" ? "slate" : detail.status === "error" ? "red" : "amber"}>
                {detail.status}
              </Badge>
              <p className="text-xs text-slate-500">
                {detail.owner ? `by ${detail.owner.name} (${detail.owner.email})` : "owner unknown"}
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
              {[
                ["Format", detail.format ?? detail.extension.toUpperCase()],
                ["Codec", detail.codec ?? "—"],
                ["Bitrate", formatBitrate(detail.bitrate)],
                ["Sample rate", sampleRateHz(detail.sample_rate)],
                ["Channels", detail.channels === null ? "—" : String(detail.channels)],
                ["Duration", formatDuration(detail.duration)],
                ["Size", formatBytes(detail.size)],
                ["Plays", String(detail.play_count)],
                ["Uploaded", formatDateTime(detail.created_at)],
                ["Updated", formatDateTime(detail.updated_at)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="font-medium uppercase tracking-wide text-slate-400">{label}</dt>
                  <dd className="text-slate-700">{value}</dd>
                </div>
              ))}
              <div className="col-span-2 sm:col-span-3">
                <dt className="font-medium uppercase tracking-wide text-slate-400">ID</dt>
                <dd className="break-all font-mono text-slate-700">{detail.id}</dd>
              </div>
            </dl>

            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Description</p>
              <p className="whitespace-pre-wrap text-sm text-slate-700">
                {detail.description || <span className="text-slate-400">No description.</span>}
              </p>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Stream URL</p>
                <CopyButton text={detail.url} label="Copy URL" size="sm" icon="link" />
              </div>
              <p className="break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">{detail.url}</p>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Embed snippet</p>
                <CopyButton text={embedSnippet(detail)} label="Copy snippet" size="sm" icon="code" />
              </div>
              <pre className="overflow-x-auto rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">
                {embedSnippet(detail)}
              </pre>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">Embed preview</p>
              <iframe
                src={detail.embed_url}
                title={`Embed preview for ${detail.title}`}
                className="h-28 w-full rounded-lg border border-slate-200"
              />
            </div>
          </div>
        )}
      </Modal>

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
          Delete <span className="font-semibold text-slate-900">{pendingDelete?.title}</span>
          {pendingDelete?.owner ? ` from ${pendingDelete.owner.name}` : ""}?
        </p>
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          The file is removed from storage and every stream or embed URL for it stops working. This cannot be undone.
        </p>
      </Modal>
    </>
  );
}
