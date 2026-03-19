import { trpc } from "@/trpc";

/**
 * Returns whether Source Control is enabled (defaults to true if the setting hasn't been set).
 */
export function useSourceControlEnabled() {
  const query = trpc.settings.get.useQuery({ key: "sourceControl.enabled" });
  const enabled = query.data === null || query.data === undefined ? true : query.data === "true";
  return { enabled, isLoading: query.isLoading };
}
