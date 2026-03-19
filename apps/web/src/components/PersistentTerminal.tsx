import { useEffect, useRef, useCallback } from "react";
import { trpc } from "@/trpc";
import { useWebSocket } from "@/hooks/useWebSocket";
import { XTerm, type XTermHandle } from "@/components/XTerm";

/**
 * A persistent Claude Code terminal that stays alive for the entire app session.
 * Mount this once at the root layout level. Show/hide with the `visible` prop.
 * The XTerm instance and PTY process persist even when hidden.
 */
export function PersistentTerminal({ visible }: { visible: boolean }) {
  const xtermRef = useRef<XTermHandle>(null);
  const agentIdRef = useRef<string | null>(null);
  const startedRef = useRef(false);
  const spawnedRef = useRef(false);
  const pendingDimsRef = useRef<{ cols: number; rows: number } | null>(null);

  const statusQuery = trpc.agents.status.useQuery(undefined, {
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const startAgent = trpc.agents.start.useMutation();

  const spawnAgent = trpc.agents.spawn.useMutation({
    onSuccess: (data) => {
      agentIdRef.current = data.id;
      // If resize already fired while we were waiting, start now
      if (pendingDimsRef.current && !startedRef.current) {
        startedRef.current = true;
        const { cols, rows } = pendingDimsRef.current;
        pendingDimsRef.current = null;
        startAgent.mutate({ cols, rows });
      }
    },
  });

  // On first load: check for existing agent or spawn one
  useEffect(() => {
    if (statusQuery.isLoading || spawnedRef.current) return;

    if (statusQuery.data?.running && statusQuery.data.id) {
      agentIdRef.current = statusQuery.data.id;
      startedRef.current = true; // already running, no need to start
      spawnedRef.current = true;
    } else {
      spawnedRef.current = true;
      spawnAgent.mutate({});
    }
  }, [statusQuery.isLoading, statusQuery.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // WS handler — always active, writes to xterm whether visible or not
  const onWsEvent = useCallback(
    (event: { type: string; agentId?: string; data?: string }) => {
      if (
        (event.type === "agent:stdout" || event.type === "agent:stderr") &&
        event.agentId &&
        event.data &&
        event.agentId === agentIdRef.current
      ) {
        xtermRef.current?.write(event.data);
      }
    },
    [],
  );

  const { send } = useWebSocket(onWsEvent);

  const handleResize = useCallback(
    (cols: number, rows: number) => {
      const id = agentIdRef.current;

      // Agent not ready yet — store dimensions for when it is
      if (!id) {
        pendingDimsRef.current = { cols, rows };
        return;
      }

      // Pending agent needs to be started with real dimensions
      if (!startedRef.current) {
        startedRef.current = true;
        startAgent.mutate({ cols, rows });
        return;
      }

      send({ type: "agent:resize", agentId: id, cols, rows });
    },
    [send, startAgent],
  );

  const handleXTermData = useCallback(
    (data: string) => {
      const id = agentIdRef.current;
      if (!id) return;
      send({ type: "agent:stdin", agentId: id, data });
    },
    [send],
  );

  return (
    <div className="flex-1 min-h-0 overflow-hidden bg-[rgba(0,0,0,0.3)]">

      <XTerm
        ref={xtermRef}
        onData={handleXTermData}
        onResize={handleResize}
        convertEol={false}
      />
    </div>
  );
}
