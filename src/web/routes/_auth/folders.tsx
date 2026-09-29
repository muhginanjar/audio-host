import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiClientError, api } from "../../lib/api";
import { formatDuration, timeAgo } from "../../lib/format";
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
  Pagination,
  Select,
  Spinner,
  Textarea,
  useToast,
} from "../../components/ui";
import { Icon } from "../../components/icons";
import type { FolderDTO } from "@shared/types";

export const Route = createFileRoute("/_auth/folders")({
  component: FoldersPage,
});

function FoldersPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [showOnHomepage, setShowOnHomepage] = useState(false);
  const [editTarget, setEditTarget] = useState<FolderDTO | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FolderDTO | null>(null);
  const [deleteContents, setDeleteContents] = useState(false);

  const list = useQuery({
    queryKey: ["folders", "mine", { page, search }],
    queryFn: () => api.folders({ page, per_page: 20, search: search.trim() || undefined }),
  });

  const create = useMutation({
    mutationFn: () => api.folderCreate({ name: name.trim(), visibility, show_on_homepage: showOnHomepage }).then((r) => r.data),
    onSuccess: (f) => {
      qc.invalidateQueries({ queryKey: ["folders"] });
      setCreateOpen(false);
      setName("");
      setVisibility("private");
      setShowOnHomepage(false);
      toast(`Folder “${f.name}” created.`, "success");
    },
    onError: (err: unknown) => toast(err instanceof ApiClientError ? err.message : "Create failed.", "error"),
  });

  const save = useMutation({
    mutationFn: () =>
      api
        .folderPatch(editTarget!.id, {
          name: editTarget!.name,
          visibility: editTarget!.visibility,
          show_on_homepage: editTarget!.show_on_homepage,
        })
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["folders"] });
      setEditTarget(null);
      toast("Folder updated.", "success");
    },
    onError: (err: unknown) => toast(err instanceof ApiClientError ? err.message : "Update failed.", "error"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.folderDelete(id, deleteContents),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["folders"] });
      qc.invalidateQueries({ queryKey: ["audio"] });
      setDeleteTarget(null);
      setDeleteContents(false);
      toast(r.data.tracksDeleted > 0 ? `Folder deleted with ${r.data.tracksDeleted} tracks.` : "Folder deleted.", "success");
    },
    onError: (err: unknown) => toast(err instanceof ApiClientError ? err.message : "Delete failed.", "error"),
  });

  const rows = list.data?.data ?? [];
  const meta = list.data?.meta;

  return (
    <>
      <PageHeader
        title="Folders"
        sub="One level of virtual folders. Uploads and tracks can be assigned here."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setCreateOpen(true)}>
            New Folder
          </Button>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
          <div className="relative min-w-56 flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <Icon name="search" className="h-4 w-4" />
            </span>
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search folders…"
              className="pl-9"
            />
          </div>
        </div>

        {list.isError ? (
          <EmptyState title="Could not load folders" hint="Please try again." icon="music" />
        ) : list.isPending ? (
          <div className="flex h-40 items-center justify-center text-indigo-500">
            <Spinner className="h-6 w-6" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="No folders yet" hint="Create one to group uploads — e.g. Podcast, Khutbah, Kelas." icon="music" />
        ) : (
          <>
            <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((f) => (
                <div key={f.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                        <Icon name="music" className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{f.name}</p>
                        <p className="text-xs text-slate-400">
                          {f.track_count} tracks · {formatDuration(f.total_duration)} · {f.total_plays} plays
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge tone={f.visibility === "private" ? "amber" : "slate"}>{f.visibility === "private" ? "Private" : "Public"}</Badge>
                    {f.show_on_homepage && <Badge tone="indigo">Homepage</Badge>}
                    <Badge>{f.public_track_count} public</Badge>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">Updated {timeAgo(f.updated_at)}</p>
                  <div className="mt-3 flex items-center gap-1.5">
                    <Button size="sm" variant="ghost" icon="edit" title="Edit folder" onClick={() => setEditTarget({ ...f })} />
                    <Button size="sm" variant="ghost" icon="trash" title="Delete folder" onClick={() => setDeleteTarget(f)} />
                    <CopyButton text={f.id} label="Copy ID" variant="ghost" size="sm" />
                  </div>
                </div>
              ))}
            </div>
            {meta && meta.total_pages > 1 && <Pagination page={meta.page} totalPages={meta.total_pages} onPage={setPage} />}
          </>
        )}
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Folder" footer={
        <>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="primary" loading={create.isPending} disabled={!name.trim()} onClick={() => create.mutate()}>
            Create
          </Button>
        </>
      }>
        <div className="space-y-4">
          <Field label="Name" hint="Unique per account, max 120 characters.">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Podcast Ramadhan" autoFocus />
          </Field>
          <Field label="Visibility" hint="Public folders can be listed on the homepage only if you also check the homepage box.">
            <Select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
              <option value="private">Private</option>
              <option value="public">Public</option>
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={showOnHomepage} onChange={(e) => setShowOnHomepage(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            Show on public homepage (needs Public visibility)
          </label>
        </div>
      </Modal>

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Folder" footer={
        <>
          <Button onClick={() => setEditTarget(null)}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} disabled={!editTarget?.name.trim()} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }>
        {editTarget && (
          <div className="space-y-4">
            <Field label="Name">
              <Input value={editTarget.name} onChange={(e) => setEditTarget({ ...editTarget, name: e.target.value })} maxLength={120} />
            </Field>
            <Field label="Visibility">
              <Select
                value={editTarget.visibility}
                onChange={(e) => setEditTarget({ ...editTarget, visibility: e.target.value as "public" | "private" })}
              >
                <option value="private">Private</option>
                <option value="public">Public</option>
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={editTarget.show_on_homepage}
                onChange={(e) => setEditTarget({ ...editTarget, show_on_homepage: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300"
              />
              Show on public homepage
            </label>
          </div>
        )}
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => { setDeleteTarget(null); setDeleteContents(false); }} title="Delete Folder" footer={
        <>
          <Button onClick={() => { setDeleteTarget(null); setDeleteContents(false); }}>Cancel</Button>
          <Button variant="danger" loading={remove.isPending} onClick={() => deleteTarget && remove.mutate(deleteTarget.id)}>
            Delete
          </Button>
        </>
      }>
        {deleteTarget && (
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              Delete folder <strong className="text-slate-900">“{deleteTarget.name}”</strong> ({deleteTarget.track_count} tracks)?
            </p>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={deleteContents} onChange={(e) => setDeleteContents(e.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300" />
              <span>
                Also delete its tracks permanently.
                <span className="block text-xs text-slate-400">Unchecked = tracks move back to “No folder”.</span>
              </span>
            </label>
          </div>
        )}
      </Modal>
    </>
  );
}

