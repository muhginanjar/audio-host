import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMe } from "../lib/auth";
import { Icon } from "../components/icons";
import { PlaylistHome } from "../components/PlaylistHome";

export const Route = createFileRoute("/")({
  component: PublicShell,
});

function PublicShell() {
  const me = useMe();

  return (
    <div className="flex min-h-full flex-col bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <Icon name="music" className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold leading-tight">Audio Host</span>
              <span className="block text-[11px] leading-tight text-slate-500">Public playlist</span>
            </span>
          </Link>
          <nav className="flex items-center gap-2">
            {me.data ? (
              <>
                <span className="hidden max-w-44 truncate text-sm text-slate-500 sm:block">{me.data.name}</span>
                <Link
                  to="/dashboard"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-500"
                >
                  <Icon name="dashboard" className="h-4 w-4" />
                  Open Dashboard
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Sign in
                </Link>
                <a
                  href="/api/public/feed"
                  className="hidden text-xs text-slate-400 hover:text-slate-600 sm:block"
                  title="Public JSON feed"
                >
                  API
                </a>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
        <PlaylistHome />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-slate-400 sm:px-6">
          <span>Public tracks on this Audio Host instance.</span>
          {me.data ? (
            <Link to="/dashboard" className="hover:text-slate-600">
              Go to your dashboard →
            </Link>
          ) : (
            <Link to="/login" className="hover:text-slate-600">
              Sign in to upload →
            </Link>
          )}
        </div>
      </footer>
    </div>
  );
}
