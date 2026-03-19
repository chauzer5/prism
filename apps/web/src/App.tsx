import { useState, useCallback } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { trpc, createTRPCClient } from "./trpc";
import { routeTree } from "./routeTree.gen";
import { BootSequence } from "./components/BootSequence";

const router = createRouter({ routeTree });

export default function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5_000,
            retry: 1,
          },
        },
      })
  );
  const [trpcClient] = useState(createTRPCClient);
  const [booted, setBooted] = useState(false);
  const handleBootComplete = useCallback(() => setBooted(true), []);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {!booted && <BootSequence onComplete={handleBootComplete} />}
        <RouterProvider router={router} />
      </QueryClientProvider>
    </trpc.Provider>
  );
}
