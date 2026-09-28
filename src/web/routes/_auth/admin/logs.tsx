import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ApiClientError, api } from "../../../lib/api";
import { formatDateTime } from "../../../lib/format";
import { PageHeader } from "../../../components/Layout";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  Pagination,
  Select,
  Spinner,
  Table,
  Td,
} from "../../../components/ui";

export const Route = createFileRoute("/_auth/admin/logs")({
  component: AdminLogsPage,
});

const STATUS_CODES = [200, 201, 204, 400, 401, 403, 404, 413, 422, 429, 500];
const PER_PAGE = 50;

function AdminLogsPage() {
  const [userId, setUserId] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const owners = useQuery({
    queryKey: ["admin", "users", { per_page: 100, page: 1 }],
    queryFn: () => api.admin.users({ page: 1, per_page: 100 }),
  });

  const logs = useQuery({
    queryKey: [
      "admin",
      "logs",
      {
        user_id: userId ? Number(userId) : undefined,
        status: status ? Number(status) : undefined,
        search: debounced,
        date_from: dateFrom,
        date_to: dateTo,
        page,
        per_page: PER_PAGE,
      },
    ],
    queryFn: () =>
      api.admin.logs({
        user_id: userId ? Number(userId) : undefined,
        status: status ? Number(status) : undefined,
        search: debounced || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page,
        per_page: PER_PAGE,
      }),
  });

  const rows = logs.data?.data ?? [];
  const meta = logs.data?.meta;
  const filtered = Boolean(userId || status || debounced || dateFrom || dateTo);

  function resetFilters() {
    setUserId("");
    setStatus("");
    setSearch("");
    setDebounced("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  return (
    <>
      <PageHeader
        title="API Logs"
        sub={meta ? `${meta.total} logged request${meta.total === 1 ? "" : "s"}` : "Every authenticated API call."}
      />

      <Card className="mb-6 px-5 py-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div>
            <Label>User</Label>
            <Select
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All users</option>
              {(owners.data?.data ?? []).map((u) => (
                <option key={u.id} value={String(u.id)}>
                  {u.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Any status</option>
              {STATUS_CODES.map((code) => (
                <option key={code} value={String(code)}>
                  {code}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Path contains</Label>
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="/api/v1/audio"
            />
          </div>
          <div>
            <Label>Date from</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div>
            <Label>Date to</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="flex items-end">
            <Button variant="ghost" icon="x" disabled={!filtered} onClick={resetFilters}>
              Clear filters
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        {logs.isPending && !logs.data ? (
          <div className="flex justify-center py-16 text-indigo-500">
            <Spinner className="h-7 w-7" />
          </div>
        ) : logs.isError ? (
          <EmptyState
            title="Could not load API logs"
            hint={logs.error instanceof ApiClientError ? logs.error.message : "Network error. Try again."}
            icon="logs"
          />
        ) : rows.length === 0 ? (
          <EmptyState
            title={filtered ? "No requests match these filters" : "No API requests yet"}
            hint={filtered ? "Try widening the date range or clearing filters." : "API calls will appear here as they happen."}
            icon="logs"
          />
        ) : (
          <Table
            head={[
              "Time",
              <div className="text-left">User</div>,
              <div className="text-left">Request</div>,
              <div className="text-left">Status</div>,
              "Resp.",
              "IP",
            ]}
          >
            {rows.map((log) => (
              <tr key={log.id}>
                <Td className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(log.created_at)}</Td>
                <Td className="text-left">
                  <p className="max-w-40 truncate text-slate-700">{log.user_name ?? "Anonymous"}</p>
                  {log.api_token_id && <p className="max-w-40 truncate text-[11px] text-slate-400">token {log.api_token_id}</p>}
                </Td>
                <Td className="text-left">
                  <div className="flex max-w-md items-center gap-2">
                    <Badge tone="indigo">{log.method}</Badge>
                    <span className="truncate font-mono text-xs text-slate-600" title={log.path}>
                      {log.path}
                    </span>
                  </div>
                  <p className="max-w-md truncate text-[11px] text-slate-400" title={log.user_agent}>
                    {log.user_agent}
                  </p>
                </Td>
                <Td className="text-left">
                  <Badge tone={log.status_code >= 500 ? "red" : log.status_code >= 400 ? "amber" : "green"}>
                    {log.status_code}
                  </Badge>
                </Td>
                <Td className="text-right tabular-nums text-slate-700">{log.response_time_ms} ms</Td>
                <Td className="text-right font-mono text-xs text-slate-500">{log.ip_address}</Td>
              </tr>
            ))}
          </Table>
        )}
        {meta && <Pagination page={meta.page} totalPages={meta.total_pages} onPage={setPage} />}
      </Card>
    </>
  );
}
