import { queryOptions, useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { MeDTO } from "@shared/types";

export const meKey = ["me"] as const;

export function meOptions() {
  return queryOptions({
    queryKey: meKey,
    queryFn: () => api.me().then((r) => r.data),
    staleTime: 30_000,
  });
}

export function useMe() {
  return useQuery(meOptions());
}

export function isAdmin(me: MeDTO | undefined): boolean {
  return me?.role === "admin";
}
