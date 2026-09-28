import { createFileRoute, Outlet, redirect, useLocation } from "@tanstack/react-router";
import { Layout } from "../components/Layout";
import { Spinner } from "../components/ui";
import { meOptions } from "../lib/auth";
import { useMe } from "../lib/auth";

export const Route = createFileRoute("/_auth")({
  beforeLoad: async ({ context }) => {
    try {
      await context.queryClient.fetchQuery(meOptions());
    } catch {
      throw redirect({ to: "/login" });
    }
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const me = useMe();
  const pathname = useLocation({ select: (l) => l.pathname });

  if (!me.data) {
    return (
      <div className="flex h-full items-center justify-center text-indigo-500">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }
  return (
    <Layout me={me.data} pathname={pathname}>
      <Outlet />
    </Layout>
  );
}
