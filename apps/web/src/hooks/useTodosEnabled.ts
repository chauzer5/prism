import { trpc } from "@/trpc";

export function useTodosEnabled() {
  const query = trpc.settings.get.useQuery({ key: "todos.enabled" });
  const enabled = query.data === null || query.data === undefined ? true : query.data === "true";
  return { enabled, isLoading: query.isLoading };
}
