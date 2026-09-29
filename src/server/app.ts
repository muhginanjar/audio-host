import { readFileSync } from "node:fs";
import { Hono } from "hono";
import type { NotFoundHandler } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { apiV1 } from "./routes/api-v1";
import { clientAuth } from "./routes/client-auth";
import { clientUser } from "./routes/client-user";
import { clientAdmin } from "./routes/client-admin";
import { media } from "./routes/media";
import { embed } from "./routes/embed";
import { publicApi } from "./routes/public";
import { publicFolders } from "./routes/public-folders";
import { clientFolders } from "./routes/client-folders";
import { corsForApi } from "./middleware/cors";
import { AppError, apiError } from "./lib/errors";
import { env } from "./env";

const APP_PREFIXES = ["/api", "/a/", "/embed/"];

export function createApp() {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ success: false, error: apiError(err) }, err.status as 400, err.headers);
    }
    console.error("[unhandled]", err);
    return c.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "The server encountered an unexpected error." } },
      500,
    );
  });

  const notFound: NotFoundHandler = (c) =>
    c.json({ success: false, error: { code: "NOT_FOUND", message: `No route for ${c.req.method} ${c.req.path}` } }, 404);
  app.notFound(notFound);

  /* security headers everywhere */
  app.use("*", async (c, next) => {
    await next();
    const h = c.res.headers;
    h.set("X-Content-Type-Options", "nosniff");
    h.set("Referrer-Policy", "strict-origin-when-cross-origin");
    h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (!c.req.path.startsWith("/embed/")) h.set("X-Frame-Options", "DENY");
  });

  app.use("/api/v1*", corsForApi);

  app.get("/api/health", (c) =>
    c.json({ success: true, data: { ok: true, time: new Date().toISOString(), app_url: env.appUrl } }),
  );

  app.route("/api/v1", apiV1);

  const client = new Hono();
  client.route("/auth", clientAuth);
  client.route("/", clientUser);
  client.route("/admin", clientAdmin);
  client.route("/folders", clientFolders);
  app.route("/api/client", client);
  app.route("/api/public", publicApi);
  app.route("/api/public/folders", publicFolders);
  app.route("/a", media);
  app.route("/embed", embed);

  /* static SPA: real files win; unknown non-API GETs fall back to index.html */
  app.use("*", serveStatic({ root: "dist/client" }));
  app.get("*", (c) => {
    if (APP_PREFIXES.some((p) => c.req.path.startsWith(p))) {
      throw new AppError("NOT_FOUND", `No route for ${c.req.method} ${c.req.path}`, { status: 404 });
    }
    return c.html(indexHtml(), 200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'",
    });
  });

  return app;
}

let cachedIndex: string | null = null;
function indexHtml(): string {
  if (cachedIndex === null) {
    try {
      cachedIndex = readFileSync("dist/client/index.html", "utf8");
    } catch {
      cachedIndex =
        '<!doctype html><meta charset=utf-8><title>Audio Host</title><body style="font-family:system-ui;padding:40px"><h1>Frontend not built</h1><p>Run <code>npm run build</code> (or use <code>npm run dev</code> during development).</p></body>';
    }
  }
  return cachedIndex;
}
