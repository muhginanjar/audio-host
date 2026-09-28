import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMe } from "../../lib/auth";
import { PageHeader } from "../../components/Layout";
import { Badge, Card, CardHeader, CopyButton } from "../../components/ui";

export const Route = createFileRoute("/_auth/docs")({
  component: DocsPage,
});

const HOST = "https://your-host.example";
const ID = "01JQ3Z9H4W2C8R7T5V6B7N8M9P";

const METHOD_TONE: Record<string, "slate" | "green" | "amber" | "red"> = {
  GET: "slate",
  POST: "green",
  PATCH: "amber",
  DELETE: "red",
};

const ENDPOINTS = [
  { method: "GET", path: "/api/v1/me", desc: "Account summary: name, email, storage usage, audio count and token info." },
  { method: "POST", path: "/api/v1/audio", desc: "Upload audio. Send multipart/form-data with file plus optional title, description and visibility." },
  { method: "GET", path: "/api/v1/audio", desc: "List your audio with search, filters, sorting and pagination." },
  { method: "GET", path: "/api/v1/audio/{id}", desc: "Fetch one audio object plus playback stats (play counts, unique visitors)." },
  { method: "PATCH", path: "/api/v1/audio/{id}", desc: "Update title, description and/or visibility with a JSON body (own files only)." },
  { method: "DELETE", path: "/api/v1/audio/{id}", desc: "Delete the file, its stored bytes and its access logs." },
  { method: "GET", path: "/a/{id}", desc: "Stream the audio bytes. Public files need no token; HTTP 206 Range responses are supported for seeking, and ?dl=1 forces a download. Private files return 403." },
  { method: "GET", path: "/embed/{id}", desc: "A minimal responsive HTML5 player page, safe to place inside an iframe." },
];

const ERROR_CODES = [
  { code: "VALIDATION_ERROR", status: "400", note: "Malformed or missing JSON fields." },
  { code: "UNAUTHORIZED", status: "401", note: "Missing or bad token, or the user is disabled." },
  { code: "TOKEN_REVOKED", status: "401", note: "The token was revoked or regenerated away." },
  { code: "FORBIDDEN", status: "403", note: "The token does not own this resource." },
  { code: "NOT_FOUND", status: "404", note: "Unknown ID (never reveals existence across accounts)." },
  { code: "NO_FILE_PROVIDED", status: "400", note: "Upload without a file part." },
  { code: "INVALID_FILE_TYPE", status: "422", note: "Magic bytes, extension and MIME disagree or are unsupported." },
  { code: "INVALID_FILE", status: "422", note: "The audio could not be parsed." },
  { code: "STORAGE_LIMIT_EXCEEDED", status: "422", note: "The upload does not fit the account quota." },
  { code: "PAYLOAD_TOO_LARGE", status: "413", note: "File bigger than max_upload_size_mb." },
  { code: "RATE_LIMITED", status: "429 + Retry-After", note: "Token exceeded its per-minute window." },
  { code: "INTERNAL_ERROR", status: "500", note: "Unexpected server failure." },
];

const LIST_PARAMS = [
  { name: "page", desc: "Page number, starting at 1. Default 1." },
  { name: "per_page", desc: "Items per page, default 20, maximum 100." },
  { name: "search", desc: "Substring matched against filename, title and description." },
  { name: "format", desc: "One of mp3, wav, m4a, aac, ogg, flac." },
  { name: "visibility", desc: "public or private." },
  { name: "sort", desc: "created_at (default), updated_at, title, size, duration or play_count." },
  { name: "order", desc: "asc or desc (default desc)." },
  { name: "date_from / date_to", desc: "Filter uploads by ISO-8601 created_at range." },
  { name: "min_size / max_size", desc: "Filter by file size in bytes." },
  { name: "min_duration / max_duration", desc: "Filter by duration in seconds." },
];

const UPLOAD_FIELDS = [
  { name: "file", desc: "Required. The audio file part of the multipart body." },
  { name: "title", desc: "Optional display title; defaults to the filename." },
  { name: "description", desc: "Optional free-text description." },
  { name: "visibility", desc: "Optional public (default) or private." },
];

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{lang}</span>
        <CopyButton text={code} variant="ghost" size="sm" label="Copy" />
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-xs leading-5 text-slate-800">{code}</pre>
    </div>
  );
}

function Row({ left, children }: { left: ReactNode; children: ReactNode }) {
  return (
    <div className="border-b border-slate-100 px-5 py-3 text-sm last:border-0">
      <div className="flex flex-wrap items-center gap-2">{left}</div>
      <p className="mt-1 text-xs leading-5 text-slate-500">{children}</p>
    </div>
  );
}

const CURL_EXAMPLE = `# Upload an audio file
curl -X POST "${HOST}/api/v1/audio" \\
  -H "Authorization: Bearer aud_YOUR_TOKEN" \\
  -F "file=@episode.mp3" \\
  -F "title=My Podcast Episode" \\
  -F "visibility=public"

# List your newest mp3 files (page 2, 50 per page)
curl "${HOST}/api/v1/audio?format=mp3&sort=created_at&order=desc&page=2&per_page=50" \\
  -H "Authorization: Bearer aud_YOUR_TOKEN"

# Delete one audio object
curl -X DELETE "${HOST}/api/v1/audio/${ID}" \\
  -H "Authorization: Bearer aud_YOUR_TOKEN"`;

const JS_EXAMPLE = `const BASE = "${HOST}/api/v1";
const TOKEN = "aud_YOUR_TOKEN";

// Upload a file selected in an <input type="file">
const form = new FormData();
form.append("file", fileInput.files[0]);
form.append("title", "My Podcast Episode");
form.append("visibility", "public");

const created = await fetch(BASE + "/audio", {
  method: "POST",
  headers: { Authorization: "Bearer " + TOKEN },
  body: form,
}).then((res) => res.json());

console.log(created.data.url);

// List mp3 files, newest first
const list = await fetch(BASE + "/audio?format=mp3&sort=created_at&order=desc", {
  headers: { Authorization: "Bearer " + TOKEN },
}).then((res) => res.json());

for (const audio of list.data) {
  console.log(audio.id, audio.title, audio.size);
}`;

const PHP_EXAMPLE = `<?php
$base  = "${HOST}/api/v1";
$token = "aud_YOUR_TOKEN";

// Upload
$ch = curl_init($base . "/audio");
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER     => ["Authorization: Bearer " . $token],
    CURLOPT_POSTFIELDS     => [
        "file"       => new CURLFile("/path/to/episode.mp3", "audio/mpeg", "episode.mp3"),
        "title"      => "My Podcast Episode",
        "visibility" => "public",
    ],
]);
$created = json_decode(curl_exec($ch), true);
curl_close($ch);

echo $created["data"]["url"], PHP_EOL;

// List
$ch = curl_init($base . "/audio?format=mp3&per_page=50");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER     => ["Authorization: Bearer " . $token],
]);
$list = json_decode(curl_exec($ch), true);
curl_close($ch);

foreach ($list["data"] as $audio) {
    echo $audio["id"], " ", $audio["title"], " (", $audio["size"], " bytes)", PHP_EOL;
}`;

const PY_EXAMPLE = `import requests

BASE = "${HOST}/api/v1"
HEADERS = {"Authorization": "Bearer aud_YOUR_TOKEN"}

# Upload
with open("episode.mp3", "rb") as fh:
    res = requests.post(
        f"{BASE}/audio",
        headers=HEADERS,
        files={"file": ("episode.mp3", fh, "audio/mpeg")},
        data={"title": "My Podcast Episode", "visibility": "public"},
        timeout=120,
    )
res.raise_for_status()
audio = res.json()["data"]
print(audio["url"], audio["embed_url"])

# List
res = requests.get(f"{BASE}/audio", headers=HEADERS, params={"format": "mp3", "per_page": 50})
for item in res.json()["data"]:
    print(item["id"], item["title"], item["size"])`;

const SUCCESS_ENVELOPE = `// 200 OK — collections also carry "meta"
{
  "success": true,
  "data": [ /* … */ ],
  "meta": { "page": 1, "per_page": 20, "total": 42, "total_pages": 3 }
}`;

const ERROR_ENVELOPE = `// 429 Too Many Requests — shape is the same for every error
{
  "success": false,
  "error": { "code": "RATE_LIMITED", "message": "Too many requests. Try again soon." }
}`;

const UPLOAD_RESPONSE = `// 201 Created
{
  "success": true,
  "data": {
    "id": "${ID}",
    "filename": "episode.mp3",
    "title": "My Podcast Episode",
    "description": "",
    "mime_type": "audio/mpeg",
    "extension": "mp3",
    "size": 8342156,
    "duration": 1864.2,
    "bitrate": 128000,
    "sample_rate": 44100,
    "channels": 2,
    "format": "mp3",
    "codec": "mp3",
    "artist": null,
    "album": null,
    "visibility": "public",
    "url": "${HOST}/a/${ID}",
    "embed_url": "${HOST}/embed/${ID}",
    "download_url": "${HOST}/a/${ID}?dl=1",
    "play_count": 0,
    "created_at": "2026-09-28T10:15:00Z",
    "updated_at": "2026-09-28T10:15:00Z"
  }
}`;

const PATCH_EXAMPLE = `PATCH /api/v1/audio/${ID}
Content-Type: application/json
Authorization: Bearer aud_YOUR_TOKEN

{ "title": "Season 2 — Episode 4", "visibility": "private" }`;

const DELETE_RESPONSE = `// 200 OK
{ "success": true, "data": { "deleted": true, "id": "${ID}" } }`;

const AUDIO_EMBED_SNIPPET = `<audio controls preload="metadata">
    <source src="{APP_URL}/a/{ID}" type="audio/mpeg">
</audio>`;

const IFRAME_EMBED_SNIPPET = `<iframe src="{APP_URL}/embed/{ID}" width="100%" height="80"
        style="border:0;border-radius:8px" allow="autoplay"></iframe>`;

function DocsPage() {
  const me = useMe();
  const baseUrl = `${window.location.origin}/api/v1`;
  const masked = me.data?.token?.masked;

  return (
    <>
      <PageHeader title="API Documentation" sub="Deliver your audio programmatically with the REST API v1" />

      <div className="space-y-6">
        <Card>
          <CardHeader title="Base URL" />
          <div className="flex flex-wrap items-center gap-2 px-5 py-4">
            <code className="font-mono text-sm font-medium text-indigo-700">{baseUrl}</code>
            <CopyButton text={baseUrl} label="Copy" />
            <span className="text-xs text-slate-500">Every endpoint below is relative to this base, except the stream and embed pages.</span>
          </div>
        </Card>

        <Card>
          <CardHeader title="Authentication" sub="Bearer token in the Authorization header" />
          <div className="space-y-4 px-5 py-4">
            <p className="text-sm text-slate-600">
              Use the API token issued for your account with every request:
            </p>
            <pre className="overflow-x-auto rounded-lg bg-slate-50 px-4 py-3 font-mono text-xs text-slate-800">
              Authorization: Bearer aud_…your-full-token…
            </pre>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <p className="text-slate-600">
                Your current token: <span className="font-mono text-slate-900">{masked ?? "no token issued yet"}</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                For security only the masked form is ever stored. The full token is shown once, at creation or regeneration — copy it then or
                generate a new one from your{" "}
                <Link to="/profile" className="font-medium text-indigo-600 hover:text-indigo-500">
                  Profile page
                </Link>
                . A regenerated or revoked token immediately stops working (401 TOKEN_REVOKED).
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Endpoints" sub="REST API v1 — token required" />
          <div>
            {ENDPOINTS.map((e) => (
              <Row key={e.method + e.path} left={<><Badge tone={METHOD_TONE[e.method] ?? "slate"}>{e.method}</Badge><code className="font-mono text-[13px] text-slate-800">{e.path}</code></>}>
                {e.desc}
              </Row>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Response format" sub="Every endpoint answers with the same envelope" />
          <div className="space-y-4 px-5 py-4">
            <CodeBlock lang="JSON — success" code={SUCCESS_ENVELOPE} />
            <CodeBlock lang="JSON — error" code={ERROR_ENVELOPE} />
            <p className="text-xs text-slate-500">
              Timestamps are ISO-8601 UTC; IDs are ULIDs (never filesystem paths or user IDs). Authenticated calls also carry{" "}
              <code className="font-mono">X-RateLimit-Limit</code> and <code className="font-mono">X-RateLimit-Remaining</code> headers.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Error codes" sub="code → HTTP status" />
          <div>
            {ERROR_CODES.map((e) => (
              <Row key={e.code} left={<><code className="font-mono text-[13px] text-slate-800">{e.code}</code><Badge tone={e.status.startsWith("429") ? "amber" : "slate"}>{e.status}</Badge></>}>
                {e.note}
              </Row>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Usage" sub="Per-endpoint details" />
          <div className="space-y-6 px-5 py-4">
            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-900">POST /api/v1/audio — upload</h4>
              <p className="text-sm text-slate-600">Send <code className="font-mono text-xs">Content-Type: multipart/form-data</code> with these fields:</p>
              <div className="rounded-xl border border-slate-200">
                {UPLOAD_FIELDS.map((f) => (
                  <Row key={f.name} left={<code className="font-mono text-[13px] text-indigo-700">{f.name}</code>}>{f.desc}</Row>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                Responses: 413 PAYLOAD_TOO_LARGE above the size cap, 422 INVALID_FILE_TYPE / INVALID_FILE for bad audio, 422 STORAGE_LIMIT_EXCEEDED
                when the upload does not fit your quota.
              </p>
              <CodeBlock lang="JSON — 201 Created" code={UPLOAD_RESPONSE} />
            </section>

            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-900">GET /api/v1/audio — list</h4>
              <div className="rounded-xl border border-slate-200">
                {LIST_PARAMS.map((p) => (
                  <Row key={p.name} left={<code className="font-mono text-[13px] text-indigo-700">?{p.name}</code>}>{p.desc}</Row>
                ))}
              </div>
              <p className="text-xs text-slate-500">Only public audio you own is ever returned; results are paginated via the meta object.</p>
            </section>

            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-900">GET /api/v1/audio/&#123;id&#125; — detail</h4>
              <p className="text-sm text-slate-600">
                Returns the full audio object plus a <code className="font-mono text-xs">stats</code> object with play counts, last play time and
                unique visitors of the past 7 days. Answers 404 for files owned by someone else — existence is never revealed across accounts.
              </p>
            </section>

            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-900">PATCH /api/v1/audio/&#123;id&#125; — update</h4>
              <CodeBlock lang="HTTP" code={PATCH_EXAMPLE} />
              <p className="text-xs text-slate-500">All three fields are optional; the updated audio object is returned on success.</p>
            </section>

            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-900">DELETE /api/v1/audio/&#123;id&#125; — delete</h4>
              <p className="text-sm text-slate-600">Removes the stored bytes, the database row and the access logs in one call.</p>
              <CodeBlock lang="JSON — 200 OK" code={DELETE_RESPONSE} />
            </section>
          </div>
        </Card>

        <Card>
          <CardHeader title="Code examples" sub="Copy, paste, replace the token" />
          <div className="grid gap-4 px-5 py-4 xl:grid-cols-2">
            <CodeBlock lang="cURL" code={CURL_EXAMPLE} />
            <CodeBlock lang="JavaScript (fetch)" code={JS_EXAMPLE} />
            <CodeBlock lang="PHP (cURL)" code={PHP_EXAMPLE} />
            <CodeBlock lang="Python (requests)" code={PY_EXAMPLE} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Embedding" sub="Play your audio on any site" />
          <div className="space-y-4 px-5 py-4">
            <p className="text-sm text-slate-600">
              Replace <code className="font-mono text-xs">&#123;APP_URL&#125;</code> with your instance URL and{" "}
              <code className="font-mono text-xs">&#123;ID&#125;</code> with the audio ID (both are returned by every API call as{" "}
              <code className="font-mono text-xs">url</code> and <code className="font-mono text-xs">embed_url</code>):
            </p>
            <CodeBlock lang="HTML — audio element" code={AUDIO_EMBED_SNIPPET} />
            <CodeBlock lang="HTML — iframe player page" code={IFRAME_EMBED_SNIPPET} />
            <p className="text-xs text-slate-500">
              The embed page is responsive and CSP-framable. Streams support HTTP Range requests, so players can seek instantly even for long files.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Rate limiting & CORS" />
          <div className="space-y-3 px-5 py-4 text-sm text-slate-600">
            <p>
              Limits are fixed windows counted per API token: by default <span className="font-medium text-slate-800">100 requests/minute</span> for
              all <code className="font-mono text-xs">/api/v1/*</code> endpoints and{" "}
              <span className="font-medium text-slate-800">10 uploads/minute</span> for <code className="font-mono text-xs">POST /api/v1/audio</code>.
              Your administrator can change both. Exceeding a limit answers 429 RATE_LIMITED with a{" "}
              <code className="font-mono text-xs">Retry-After</code> header in seconds; unauthenticated requests are rejected with 401 before
              counting.
            </p>
            <p>
              CORS applies to <code className="font-mono text-xs">/api/v1/*</code> only for origins the administrator added to the allow list (exact
              match). With no list configured the API is same-origin only; <code className="font-mono text-xs">*</code> is never implied. OPTIONS
              preflights allow the <code className="font-mono text-xs">Authorization</code> and <code className="font-mono text-xs">Content-Type</code>{" "}
              headers.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
