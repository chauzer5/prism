import { useLayoutStore } from "@/stores/layout";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  LayoutDashboard,
  CheckSquare,
  MessageSquare,
  Bot,
  GitMerge,
  LayoutList,
  Settings,
  PanelLeftClose,
  PanelLeft,
  User,
  Bell,
  GitPullRequest,
  AlertCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import { useSlackEnabled } from "@/hooks/useSlackEnabled";
import { useWebSocket } from "@/hooks/useWebSocket";
import { trpc } from "@/trpc";

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function getNotificationIcon(type: string, meta?: string | null): { icon: LucideIcon; color: string } {
  switch (type) {
    case "slack_unread":
      return { icon: MessageSquare, color: "text-neon-cyan" };
    case "mr_pipeline": {
      const parsed = meta ? JSON.parse(meta) : {};
      if (parsed.newStatus === "failed" || parsed.newStatus === "failure") {
        return { icon: AlertCircle, color: "text-red-400" };
      }
      if (parsed.newStatus === "success") {
        return { icon: GitPullRequest, color: "text-neon-green" };
      }
      return { icon: GitPullRequest, color: "text-neon-yellow" };
    }
    case "mr_approval":
      return { icon: GitPullRequest, color: "text-neon-green" };
    case "todo_created":
      return { icon: CheckSquare, color: "text-neon-yellow" };
    default:
      return { icon: Bell, color: "text-text-muted" };
  }
}

function NotificationsDropdown({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  const notificationsQuery = trpc.notifications.list.useQuery(
    { limit: 20 },
    { refetchInterval: 60_000 },
  );
  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => utils.notifications.invalidate(),
  });
  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => utils.notifications.invalidate(),
  });

  useWebSocket(
    useCallback(
      (event: { type: string }) => {
        if (event.type === "notification:new") {
          utils.notifications.list.invalidate();
        }
      },
      [utils],
    ),
  );

  const items = notificationsQuery.data ?? [];
  const unreadCount = items.filter((n) => !n.read).length;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-all duration-200",
          "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          open && "bg-sidebar-accent text-neon-pink",
          collapsed && "justify-center px-0",
        )}
      >
        <div className="relative shrink-0">
          <Bell className="h-4 w-4 opacity-60" />
          {unreadCount > 0 && (
            <div className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-neon-pink text-[8px] font-bold text-white">
              {unreadCount}
            </div>
          )}
        </div>
        {!collapsed && <span>Notifications</span>}
      </button>

      {open && (
        <div className="absolute bottom-0 left-full z-[100] ml-2 w-80 rounded-xl border border-border bg-popover shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-xs font-semibold text-cream">Notifications</h3>
            {unreadCount > 0 && (
              <span className="rounded-full bg-[rgba(255,45,123,0.12)] px-1.5 py-0.5 text-[10px] font-semibold text-neon-pink">
                {unreadCount} new
              </span>
            )}
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {items.length === 0 && (
              <div className="px-4 py-8 text-center text-xs text-text-muted">
                No notifications yet
              </div>
            )}
            {items.map((n) => {
              const { icon: Icon, color } = getNotificationIcon(n.type, n.meta);
              return (
                <div
                  key={n.id}
                  onClick={() => {
                    if (!n.read) markRead.mutate({ id: n.id });
                    if (n.url) window.open(n.url, "_blank");
                  }}
                  className={cn(
                    "flex cursor-pointer gap-3 border-b border-border/50 px-4 py-3 transition-colors hover:bg-[rgba(255,45,123,0.03)]",
                    !n.read && "bg-[rgba(255,45,123,0.04)]",
                  )}
                >
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", color)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-cream">{n.title}</span>
                      {!n.read && (
                        <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-neon-pink shadow-[0_0_6px_rgba(255,45,123,0.5)]" />
                      )}
                    </div>
                    {n.detail && (
                      <p className="mt-0.5 truncate text-[11px] text-text-muted">{n.detail}</p>
                    )}
                    <span className="mt-0.5 text-[10px] text-text-muted">{timeAgo(n.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
          {items.length > 0 && (
            <div className="border-t border-border px-4 py-2.5">
              <button
                onClick={() => markAllRead.mutate()}
                disabled={unreadCount === 0 || markAllRead.isPending}
                className="w-full text-center text-[11px] font-medium text-neon-pink hover:underline disabled:opacity-50"
              >
                Mark all as read
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useLayoutStore();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const { enabled: slackEnabled } = useSlackEnabled();

  const todosQuery = trpc.todos.listAll.useQuery(undefined, { refetchInterval: 30_000 });
  const activeTodoCount = todosQuery.data?.counts.active ?? 0;
  const whoami = trpc.settings.whoami.useQuery(undefined, { refetchOnWindowFocus: false, staleTime: 300_000 });
  const userName = whoami.data ?? "...";

  const navSections = [
    {
      label: "Overview",
      items: [
        { icon: LayoutDashboard, label: "Dashboard", href: "/" },
      ],
    },
    {
      label: "Work",
      items: [
        { icon: CheckSquare, label: "Todos", href: "/todos", count: activeTodoCount > 0 ? activeTodoCount : undefined },
        { icon: GitMerge, label: "Source Control", href: "/source-control" },
        { icon: LayoutList, label: "Linear", href: "/linear" },
        ...(slackEnabled ? [{ icon: MessageSquare, label: "Slack", href: "/slack" } as const] : []),
        { icon: Bot, label: "Agent", href: "/agents" },
      ],
    },
    {
      label: "System",
      items: [
        { icon: Settings, label: "Settings", href: "/settings" },
      ],
    },
  ];

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-sidebar-border backdrop-blur-xl transition-all duration-200",
        sidebarOpen ? "w-60" : "w-14",
        "bg-sidebar-background"
      )}
    >
      {/* Brand */}
      <div className="flex h-14 items-center gap-2.5 px-3 bg-black">
        {sidebarOpen && (
          <img src="/prism-logo.png" alt="PRISM" className="h-8 object-contain" />
        )}
        <div className={cn("ml-auto", !sidebarOpen && "ml-0")}>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="h-8 w-8 text-text-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            {sidebarOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeft className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-1">
        {navSections.map((section) => (
          <div key={section.label}>
            {sidebarOpen && (
              <div className="px-3 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                {section.label}
              </div>
            )}
            {!sidebarOpen && section.label !== "Overview" && (
              <Separator className="my-2 bg-sidebar-border" />
            )}
            {section.items.map((item) => {
              const isActive = item.href
                ? item.href === "/"
                  ? currentPath === "/"
                  : currentPath.startsWith(item.href)
                : false;

              const buttonContent = (
                <>
                  <item.icon
                    className={cn(
                      "h-4 w-4 shrink-0 opacity-60",
                      isActive && "opacity-100"
                    )}
                  />
                  {sidebarOpen && (
                    <>
                      <span>{item.label}</span>
                      {item.count !== undefined && (
                        <span className="ml-auto rounded-full bg-[rgba(255,45,123,0.12)] px-1.5 py-0.5 text-[10px] font-semibold text-neon-pink">
                          {item.count}
                        </span>
                      )}
                    </>
                  )}
                </>
              );

              if (item.href && !item.disabled) {
                return (
                  <Link key={item.label} to={item.href}>
                    <div
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-all duration-200",
                        "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        isActive &&
                          "bg-sidebar-accent text-neon-pink shadow-[inset_0_0_0_1px_rgba(255,45,123,0.12)]",
                        !sidebarOpen && "justify-center px-0"
                      )}
                    >
                      {buttonContent}
                    </div>
                  </Link>
                );
              }

              return (
                <Button
                  key={item.label}
                  variant="ghost"
                  disabled={item.disabled}
                  className={cn(
                    "w-full justify-start gap-2.5 text-[13px] font-medium transition-all duration-200",
                    "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    isActive &&
                      "bg-sidebar-accent text-neon-pink shadow-[inset_0_0_0_1px_rgba(255,45,123,0.12)]",
                    !sidebarOpen && "justify-center px-0"
                  )}
                >
                  {buttonContent}
                </Button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Notifications */}
      <div className="px-2 pb-1">
        <NotificationsDropdown collapsed={!sidebarOpen} />
      </div>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3">
        {sidebarOpen ? (
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-neon-pink-dark to-neon-pink">
              <User className="h-4 w-4 text-neon-pink-bright" />
            </div>
            <div>
              <div className="text-xs font-medium text-text-primary">{userName}</div>
              <div className="text-[11px] text-text-muted">local session</div>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-neon-pink-dark to-neon-pink">
              <User className="h-4 w-4 text-neon-pink-bright" />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
