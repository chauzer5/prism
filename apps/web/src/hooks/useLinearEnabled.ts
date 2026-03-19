import { trpc } from "@/trpc";

export function useLinearEnabled() {
  const query = trpc.settings.get.useQuery({ key: "linear.enabled" });
  const enabled = query.data === null || query.data === undefined ? true : query.data === "true";
  return { enabled, isLoading: query.isLoading };
}
