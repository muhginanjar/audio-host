import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiClientError, api } from "../../../lib/api";
import { formatBytes, formatDate } from "../../../lib/format";
import { PageHeader } from "../../../components/Layout";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Pagination,
  Spinner,
  Table,
  Td,
  useToast,
} from "../../../components/ui";
import type { UserAdminDTO } from "@shared/types";

export const Route = createFileRoute("/_auth/admin/users/")({
  component: AdminUsersPage,
});

const PER_PAGE = 20;

function AdminUsersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<UserAdminDTO | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const users = useQuery({
    queryKey: ["admin", "users", { search: debounced, page, per_page: PER_PAGE }],
    queryFn: () => api.admin.users({ search: debounced || undefined, page, per_page: PER_PAGE }),
  });

  function refreshUserLists() {
    queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
  }

  const toggleStatus = useMutation({
    mutationFn: (user: UserAdminDTO) =>
      api.admin.userPatch(user.id, { status: user.status === "active" ? "disabled" : "active" }),
    onSuccess: (_result, user) => {
      toast(user.status === "active" ? `${user.name} disabled.` : `${user.name} enabled.`, "success");
      refreshUserLists();
    },
    onError: (err) =>
      toast(err instanceof ApiClientError ? err.message : "Could not change this user's status.", "error"),
  });

  const deleteUser = useMutation({
    mutationFn: (user: UserAdminDTO) => api.admin.userDelete(user.id),
    onSuccess: (_result, user) => {
      toast(`${user.name} deleted.`, "success");
      setPendingDelete(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "audio"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (err) => toast(err instanceof ApiClientError ? err.message : "Could not delete this user.", "error"),
  });

  const rows = users.data?.data ?? [];
  const meta = users.data?.meta;

  return (
    <>
      <PageHeader
        title="Users"
        sub={meta ? `${meta.total} account${meta.total === 1 ? "" : "s"}` : "Accounts, storage limits, and API tokens."}
        actions={
          <>
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search name or email"
              className="max-w-64"
            />
            <Button variant="primary" icon="plus" onClick={() => navigate({ to: "/admin/users/new" })}>
              New User
            </Button>
          </>
        }
      />

      <Card>
        {users.isPending && !users.data ? (
          <div className="flex justify-center py-16 text-indigo-500">
            <Spinner className="h-7 w-7" />
          </div>
        ) : users.isError ? (
          <EmptyState
            title="Could not load users"
            hint={users.error instanceof ApiClientError ? users.error.message : "Network error. Try again."}
            icon="users"
          />
        ) : rows.length === 0 ? (
          <EmptyState
            title={debounced ? "No users match that search" : "No users yet"}
            hint={debounced ? "Try a different name or email." : "Create the first account to get going."}
            icon="users"
          />
        ) : (
          <Table head={["User", <div className="text-left">Status</div>, "Audio", "Storage", "Created", "Actions"]}>
            {rows.map((user) => (
              <tr key={user.id}>
                <Td>
                  <Link
                    to="/admin/users/$id"
                    params={{ id: String(user.id) }}
                    className="font-medium text-slate-900 hover:text-indigo-600"
                  >
                    {user.name}
                  </Link>
                  <p className="max-w-64 truncate text-xs text-slate-500">{user.email}</p>
                </Td>
                <Td className="text-left">
                  <Badge tone={user.status === "active" ? "green" : "red"}>{user.status}</Badge>
                </Td>
                <Td className="text-right tabular-nums">{user.audio_count}</Td>
                <Td className="text-right">
                  <p className="tabular-nums text-slate-700">{formatBytes(user.storage_used_bytes)}</p>
                  <p className="text-xs text-slate-400">
                    {user.storage_limit_bytes
                      ? `${Math.round((user.storage_used_bytes / user.storage_limit_bytes) * 100)}% of ${formatBytes(user.storage_limit_bytes)}`
                      : "system default limit"}
                  </p>
                </Td>
                <Td className="text-right text-xs text-slate-500">{formatDate(user.created_at)}</Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-1.5">
                    <Button
                      size="sm"
                      variant={user.status === "active" ? "danger" : "secondary"}
                      disabled={toggleStatus.isPending}
                      onClick={() => toggleStatus.mutate(user)}
                    >
                      {user.status === "active" ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="trash"
                      aria-label={`Delete ${user.name}`}
                      onClick={() => setPendingDelete(user)}
                    />
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
        {meta && <Pagination page={meta.page} totalPages={meta.total_pages} onPage={setPage} />}
      </Card>

      <Modal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Delete user"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon="trash"
              loading={deleteUser.isPending}
              onClick={() => pendingDelete && deleteUser.mutate(pendingDelete)}
            >
              Delete user
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          Delete <span className="font-semibold text-slate-900">{pendingDelete?.name}</span> ({pendingDelete?.email})?
        </p>
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          This deletes all of their audio files, API tokens, and sessions. It cannot be undone.
        </p>
      </Modal>
    </>
  );
}
