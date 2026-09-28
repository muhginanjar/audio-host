import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiClientError, api } from "../../../lib/api";
import { PageHeader } from "../../../components/Layout";
import {
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Spinner,
  Textarea,
  useToast,
} from "../../../components/ui";
import type { AppSettings } from "@shared/types";

export const Route = createFileRoute("/_auth/admin/settings")({
  component: AdminSettingsPage,
});

type NumericKey =
  | "api_rate_limit_per_minute"
  | "upload_rate_limit_per_minute"
  | "max_upload_size_mb"
  | "default_user_storage_limit_mb";

type FieldKey = NumericKey | "cors_allowed_origins";

const NUMERIC_FIELDS: { key: NumericKey; label: string; hint: string; max: number }[] = [
  {
    key: "api_rate_limit_per_minute",
    label: "API rate limit (requests / minute)",
    hint: "Per token, across the REST API. Maximum 100000.",
    max: 100_000,
  },
  {
    key: "upload_rate_limit_per_minute",
    label: "Upload rate limit (uploads / minute)",
    hint: "Per token, for POST /api/v1/audio. Maximum 10000.",
    max: 10_000,
  },
  {
    key: "max_upload_size_mb",
    label: "Max upload size (MB)",
    hint: "Largest single file accepted. Maximum 51200.",
    max: 51_200,
  },
  {
    key: "default_user_storage_limit_mb",
    label: "Default user storage (MB)",
    hint: "Quota for accounts without an individual limit. Maximum 100000000.",
    max: 100_000_000,
  },
];

function AdminSettingsPage() {
  const settings = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: () => api.admin.settings().then((r) => r.data),
  });

  return (
    <>
      <PageHeader title="System Settings" sub="Runtime limits & policies (persisted in DB, env vars are defaults)" />

      {settings.data ? (
        <SettingsForm current={settings.data} />
      ) : settings.isError ? (
        <Card className="max-w-3xl px-5 py-4">
          <p className="text-sm text-slate-600">
            {settings.error instanceof ApiClientError ? settings.error.message : "Network error. Try again."}
          </p>
        </Card>
      ) : (
        <div className="flex justify-center py-16 text-indigo-500">
          <Spinner className="h-7 w-7" />
        </div>
      )}
    </>
  );
}

function SettingsForm({ current }: { current: AppSettings }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<Partial<Record<FieldKey, string>>>({});

  const values: Record<FieldKey, string> = {
    api_rate_limit_per_minute: draft.api_rate_limit_per_minute ?? String(current.api_rate_limit_per_minute),
    upload_rate_limit_per_minute: draft.upload_rate_limit_per_minute ?? String(current.upload_rate_limit_per_minute),
    max_upload_size_mb: draft.max_upload_size_mb ?? String(current.max_upload_size_mb),
    default_user_storage_limit_mb:
      draft.default_user_storage_limit_mb ?? String(current.default_user_storage_limit_mb),
    cors_allowed_origins: draft.cors_allowed_origins ?? current.cors_allowed_origins,
  };

  const errors: Partial<Record<NumericKey, string>> = {};
  for (const field of NUMERIC_FIELDS) {
    const text = values[field.key].trim();
    const number = Number(text);
    if (!text) errors[field.key] = "Required.";
    else if (!Number.isInteger(number) || number < 1) errors[field.key] = "Whole number greater than zero.";
    else if (number > field.max) errors[field.key] = `Maximum ${field.max.toLocaleString()} allowed.`;
  }
  const invalid = Object.keys(errors).length > 0;

  const changes: Record<string, string | number> = {};
  for (const field of NUMERIC_FIELDS) {
    if (Number(values[field.key]) !== current[field.key]) changes[field.key] = Number(values[field.key]);
  }
  if (values.cors_allowed_origins !== current.cors_allowed_origins) {
    changes.cors_allowed_origins = values.cors_allowed_origins;
  }
  const dirty = Object.keys(changes).length > 0;

  const save = useMutation({
    mutationFn: () => api.admin.settingsPatch(changes),
    onSuccess: () => {
      toast("Saved.", "success");
      queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (err) => toast(err instanceof ApiClientError ? err.message : "Could not save the settings.", "error"),
  });

  return (
    <Card className="max-w-3xl">
      <CardHeader title="Limits & policies" sub="Applied to new requests immediately; no restart required." />
      <form
        className="space-y-4 px-5 py-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (invalid || !dirty) return;
          save.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {NUMERIC_FIELDS.map((field) => (
            <Field key={field.key} label={field.label} hint={field.hint} error={errors[field.key]}>
              <Input
                type="number"
                min={1}
                step={1}
                value={values[field.key]}
                onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
              />
            </Field>
          ))}
        </div>

        <Field
          label="CORS allowed origins"
          hint="Comma-separated exact origins; leave empty for same-origin only; * allows any."
        >
          <Textarea
            value={values.cors_allowed_origins}
            onChange={(e) => setDraft({ ...draft, cors_allowed_origins: e.target.value })}
            placeholder="https://app.example.com, https://embed.example.com"
            className="font-mono text-xs"
          />
        </Field>

        <Field label="Application URL" hint="Public base URL used to build stream, embed, and download links.">
          <Input readOnly value={current.app_url} className="font-mono text-xs" />
        </Field>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
          <Button
            variant="ghost"
            disabled={!dirty}
            onClick={() => {
              setDraft({});
              queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
            }}
          >
            Reset
          </Button>
          <Button type="submit" variant="primary" icon="check" loading={save.isPending} disabled={invalid || !dirty}>
            Save
          </Button>
        </div>
      </form>
    </Card>
  );
}
