import { useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { GitMerge, MessageSquare } from "lucide-react";
import { trpc } from "@/trpc";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useSlackEnabled } from "@/hooks/useSlackEnabled";
import { useSourceControlEnabled } from "@/hooks/useSourceControlEnabled";
import { cn } from "@/lib/utils";

const COLOR_MAP = {
  pink: {
    value: "text-neon-pink",
    glow: "0 0 30px rgba(255, 45, 123, 0.4)",
    edge: "from-neon-pink",
  },
  cyan: {
    value: "text-neon-cyan",
    glow: "0 0 30px rgba(0, 240, 255, 0.4)",
    edge: "from-neon-cyan",
  },
  yellow: {
    value: "text-neon-yellow",
    glow: "0 0 30px rgba(250, 204, 21, 0.4)",
    edge: "from-neon-yellow",
  },
  green: {
    value: "text-neon-green",
    glow: "0 0 30px rgba(0, 255, 136, 0.4)",
    edge: "from-neon-green",
  },
  purple: {
    value: "text-neon-purple",
    glow: "0 0 30px rgba(192, 38, 211, 0.4)",
    edge: "from-neon-purple",
  },
} as const;

export function QuickStatsPanel() {
  const { enabled: slackEnabled } = useSlackEnabled();
  const { enabled: scEnabled } = useSourceControlEnabled();
  const unreadQuery = trpc.slack.unreadDms.useQuery(undefined, {
    refetchInterval: 30_000,
    enabled: slackEnabled,
  });
  const prsQuery = trpc.sourceControl.pullRequests.useQuery(undefined, {
    refetchInterval: 30_000,
    enabled: scEnabled,
  });

  const utils = trpc.useUtils();
  useWebSocket(
    useCallback(
      (event: { type: string }) => {
        if (event.type === "slack:unread") {
          utils.slack.unreadDms.invalidate();
        }
      },
      [utils],
    ),
  );

  const myPRs = prsQuery.data?.filter((pr) => pr.is_mine) ?? [];
  const myPRCount = myPRs.length;
  const needsReview = prsQuery.data?.filter((pr) => pr.needs_your_review).length ?? 0;
  const unreadCount = unreadQuery.data?.checkedAt
    ? unreadQuery.data.unreadCount
    : null;

  const visibleStats = useMemo(() => {
    const items: { key: string; label: string; color: keyof typeof COLOR_MAP; href: string; value: string; delta?: string; deltaUp?: boolean; icon: ReactNode }[] = [];

    if (scEnabled) {
      items.push({
        key: "prs",
        label: "Open MRs",
        color: "purple",
        href: "/source-control",
        value: String(myPRCount),
        delta: needsReview > 0 ? `${needsReview} need review` : undefined,
        deltaUp: needsReview > 0,
        icon: <GitMerge className="h-4 w-4" />,
      });
    }

    if (scEnabled) {
      items.push({
        key: "review",
        label: "Needs Review",
        color: "yellow",
        href: "/source-control",
        value: String(needsReview),
        icon: <GitMerge className="h-4 w-4" />,
      });
    }

    if (slackEnabled) {
      items.push({
        key: "unread",
        label: "Unread DMs",
        color: "cyan",
        href: "/slack",
        value: unreadCount != null ? String(unreadCount) : "--",
        delta: unreadCount != null && unreadCount > 0 ? `${unreadCount} new` : undefined,
        deltaUp: unreadCount != null && unreadCount > 0,
        icon: <MessageSquare className="h-4 w-4" />,
      });
    }

    return items;
  }, [myPRCount, needsReview, unreadCount, slackEnabled, scEnabled]);

  return (
    <div className="col-span-full grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-4">
      {visibleStats.map((s, i) => {
        const colors = COLOR_MAP[s.color];

        return (
          <Link
            key={s.key}
            to={s.href}
            className={cn(
              "animate-glass-in relative self-start overflow-hidden rounded-xl border border-[rgba(255,45,123,0.08)] bg-[rgba(30,22,55,0.7)] p-4 backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)]",
              `stagger-${i + 1}`
            )}
          >
            {/* Colored top edge */}
            <div
              className={cn(
                "absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r to-transparent",
                colors.edge
              )}
            />

            {/* Icon */}
            <div className="absolute top-3.5 right-3.5 text-text-muted opacity-40">
              {s.icon}
            </div>

            {/* Label */}
            <div className="mb-2 font-display text-[9px] font-semibold tracking-[3px] uppercase text-text-muted">
              {s.label}
            </div>

            {/* Value + delta row */}
            <div className="flex items-baseline gap-2">
              <div
                className={cn("font-heading text-[42px] leading-none", colors.value)}
                style={{ textShadow: colors.glow }}
              >
                {s.value}
              </div>
              {s.delta && (
                <span
                  className={cn(
                    "text-[10px] font-semibold",
                    s.deltaUp ? "text-neon-green" : "text-text-muted"
                  )}
                >
                  {s.delta}
                </span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
