import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiClientError, api, uploadAudio } from "../../lib/api";
import type { AudioDTO } from "@shared/types";
import { useMe } from "../../lib/auth";
import { formatBytes } from "../../lib/format";
import { PageHeader } from "../../components/Layout";
import { AudioPlayer } from "../../components/AudioPlayer";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CopyButton,
  Field,
  Input,
  ProgressBar,
  Select,
  Textarea,
  cn,
  useToast,
} from "../../components/ui";
import { Icon } from "../../components/icons";

export const Route = createFileRoute("/_auth/upload")({
  component: UploadPage,
});

interface QueueItem {
  id: string;
  file: File;
  percent: number;
  status: "queued" | "uploading" | "done" | "error";
  audio?: AudioDTO;
  error?: string;
}

const STATUS_TONE: Record<QueueItem["status"], "slate" | "indigo" | "green" | "red"> = {
  queued: "slate",
  uploading: "indigo",
  done: "green",
  error: "red",
};

const STATUS_LABEL: Record<QueueItem["status"], string> = {
  queued: "Queued",
  uploading: "Uploading",
  done: "Uploaded",
  error: "Failed",
};

function embedTag(a: AudioDTO): string {
  return `<audio controls preload="metadata">\n    <source src="${a.url}" type="${a.mime_type}">\n</audio>`;
}

function UploadPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const me = useMe();
  const foldersQuery = useQuery({ queryKey: ["folders", "mine"], queryFn: () => api.folders({ per_page: 100 }).then((r) => r.data) });

  const [queue, setQueueState] = useState<QueueItem[]>([]);
  const queueRef = useRef<QueueItem[]>([]);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fieldsRef = useRef({ title: "", description: "", visibility: "public", folderId: "" });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [folderId, setFolderId] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const setQueue = (fn: (q: QueueItem[]) => QueueItem[]) => {
    queueRef.current = fn(queueRef.current);
    setQueueState(queueRef.current);
  };
  const patchItem = (id: string, p: Partial<QueueItem>) => setQueue((q) => q.map((i) => (i.id === id ? { ...i, ...p } : i)));

  function uploadOne(item: QueueItem) {
    patchItem(item.id, { status: "uploading", percent: 0, error: undefined });

    const form = new FormData();
    form.append("file", item.file, item.file.name);
    // The shared title only makes sense when exactly one file is in the queue.
    if (queueRef.current.length === 1 && fieldsRef.current.title.trim()) {
      form.append("title", fieldsRef.current.title.trim());
    }
    if (fieldsRef.current.description.trim()) {
      form.append("description", fieldsRef.current.description.trim());
    }
    form.append("visibility", fieldsRef.current.visibility);
    if (fieldsRef.current.folderId) form.append("folder_id", fieldsRef.current.folderId);

    return uploadAudio(form, (percent) => patchItem(item.id, { percent }))
      .then((audio) => {
        patchItem(item.id, { status: "done", percent: 100, audio });
        qc.invalidateQueries({ queryKey: ["me"] });
        qc.invalidateQueries({ queryKey: ["audio"] });
        qc.invalidateQueries({ queryKey: ["stats"] });
        toast(`“${audio.title || audio.filename}” uploaded.`, "success");
      })
      .catch((err: unknown) => {
        const message = err instanceof ApiClientError ? err.message : "Upload failed.";
        patchItem(item.id, { status: "error", percent: 0, error: message });
        toast(`“${item.file.name}” failed: ${message}`, "error");
      });
  }

  function addFiles(files: File[]) {
    if (files.length === 0) return;
    const remaining = me.data?.storage.remaining_bytes;
    const accepted: File[] = [];
    for (const f of files) {
      if (remaining !== undefined && f.size > remaining) {
        toast(`“${f.name}” (${formatBytes(f.size)}) exceeds your remaining storage (${formatBytes(remaining)}).`, "error");
        continue;
      }
      accepted.push(f);
    }
    if (accepted.length === 0) return;

    const items: QueueItem[] = accepted.map((file) => ({
      id: crypto.randomUUID(),
      file,
      percent: 0,
      status: "queued" as const,
    }));
    setQueue((q) => [...q, ...items]);
    // Upload sequentially: each file waits for the previous one to finish.
    for (const item of items) {
      chainRef.current = chainRef.current.then(() => uploadOne(item));
    }
  }

  function retry(item: QueueItem) {
    patchItem(item.id, { status: "queued", percent: 0, error: undefined });
    chainRef.current = chainRef.current.then(() => uploadOne(item));
  }

  const done = queue.filter((i): i is QueueItem & { audio: AudioDTO } => i.status === "done" && !!i.audio);

  return (
    <>
      <PageHeader
        title="Upload Audio"
        sub={
          me.data
            ? `${formatBytes(me.data.storage.remaining_bytes)} of ${formatBytes(me.data.storage.limit_bytes)} storage remaining`
            : "Add files to your library"
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              addFiles(Array.from(e.dataTransfer.files));
            }}
            className={cn(
              "cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40",
              dragOver ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-white hover:border-indigo-400",
            )}
          >
            <Icon name="upload" className="mx-auto h-10 w-10 text-indigo-500" />
            <p className="mt-3 text-sm font-medium text-slate-700">Drag &amp; drop audio files here, or browse</p>
            <p className="mt-1 text-xs text-slate-500">Supported formats: MP3, WAV, M4A, AAC, OGG, FLAC</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".mp3,.wav,.m4a,.aac,.ogg,.flac,audio/*"
              className="hidden"
              onChange={(e) => {
                addFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </div>

          {done.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {done.map((item) => (
                <Card key={item.id} className="p-4">
                  <p className="truncate text-sm font-semibold text-slate-900">{item.audio.title || item.audio.filename}</p>
                  <AudioPlayer audio={item.audio} className="mt-2" />
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Input
                      readOnly
                      value={item.audio.url}
                      className="min-w-0 flex-1 font-mono text-xs"
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <CopyButton text={item.audio.url} label="Copy URL" />
                    <CopyButton text={embedTag(item.audio)} label="Copy Embed" />
                  </div>
                  <Link
                    to="/audio"
                    className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    <Icon name="music" className="h-4 w-4" /> Manage
                  </Link>
                </Card>
              ))}
            </div>
          )}
        </div>

        <Card>
          <CardHeader title="Upload details" sub="Applied to the files you add" />
          <div className="space-y-4 px-5 py-4">
            <Field label="Title" hint="Only applied when uploading a single file.">
              <Input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  fieldsRef.current.title = e.target.value;
                }}
                placeholder="My Podcast Episode"
              />
            </Field>
            <Field label="Description">
              <Textarea
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  fieldsRef.current.description = e.target.value;
                }}
                placeholder="Optional notes about this recording"
              />
            </Field>
            <Field label="Visibility">
              <Select
                value={visibility}
                onChange={(e) => {
                  setVisibility(e.target.value);
                  fieldsRef.current.visibility = e.target.value;
                }}
              >
                <option value="public">Public — anyone with the URL can listen</option>
                <option value="private">Private — only streamed through the authenticated API</option>
              </Select>
            </Field>
            <Field label="Folder" hint="Optional — files land in this folder. Create folders from the Audio page.">
              <Select
                value={folderId}
                onChange={(e) => {
                  setFolderId(e.target.value);
                  fieldsRef.current.folderId = e.target.value;
                }}
              >
                <option value="">No folder (root)</option>
                {(foldersQuery.data ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="border-t border-slate-100">
            <CardHeader title="Queue" sub={queue.length === 0 ? "Files appear here as you add them" : `${queue.length} file${queue.length === 1 ? "" : "s"}`} />
            {queue.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-slate-500">Nothing queued yet.</p>
            ) : (
              <div>
                {queue.map((item) => (
                  <div key={item.id} className="border-b border-slate-100 px-5 py-3 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                        <Icon name="file" className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">{item.file.name}</p>
                        <p className="text-xs text-slate-500">{formatBytes(item.file.size)}</p>
                      </div>
                      <Badge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge>
                      {item.status === "error" && (
                        <Button size="sm" icon="upload" onClick={() => retry(item)}>
                          Retry
                        </Button>
                      )}
                    </div>
                    {item.status === "uploading" && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1">
                          <ProgressBar percent={item.percent} />
                        </div>
                        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-slate-500">{item.percent}%</span>
                      </div>
                    )}
                    {item.status === "error" && item.error && <p className="mt-1.5 text-xs text-red-600">{item.error}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
