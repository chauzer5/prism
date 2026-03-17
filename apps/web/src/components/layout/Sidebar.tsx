import { useLayoutStore } from "@/stores/layout";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  LayoutDashboard,
  CheckSquare,
  MessageSquare,
  Monitor,
  Users,
  GitCompareArrows,
  GitMerge,
  LayoutList,
  Settings,
  PanelLeftClose,
  PanelLeft,
  Cpu,
  Sprout,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import { useSlackEnabled } from "@/hooks/useSlackEnabled";
import { trpc } from "@/trpc";

export function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useLayoutStore();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const { enabled: slackEnabled } = useSlackEnabled();

  const todosQuery = trpc.todos.listAll.useQuery(undefined, { refetchInterval: 30_000 });
  const activeTodoCount = todosQuery.data?.counts.active ?? 0;

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
        { icon: GitMerge, label: "GitLab", href: "/gitlab" },
        { icon: LayoutList, label: "Linear", href: "/linear" },
        ...(slackEnabled ? [{ icon: MessageSquare, label: "Slack", href: "/slack" } as const] : []),
        { icon: Monitor, label: "Agents", href: "/agents" },
      ],
    },
    {
      label: "System",
      items: [
        { icon: Users, label: "Teams", href: "/teams" },
        { icon: GitCompareArrows, label: "Workflows", href: "/workflows" },
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
      <div className="flex h-14 items-center gap-2.5 px-3">
        {sidebarOpen && (
          <div className="flex items-center gap-2.5 px-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-neon-pink-dark to-neon-pink shadow-[0_2px_8px_rgba(255,45,123,0.3),inset_0_1px_0_rgba(255,255,255,0.1)]">
              <Cpu className="h-4 w-4 text-neon-pink-bright" />
            </div>
            <span className="font-display text-[13px] font-bold tracking-[3px] uppercase text-neon-pink" style={{ textShadow: "0 0 12px rgba(255, 45, 123, 0.6), 0 0 4px rgba(255, 45, 123, 0.3)" }}>
              PRISM
            </span>
          </div>
        )}
        <div className={cn("ml-auto", !sidebarOpen && "mx-auto")}>
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

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3">
        {sidebarOpen ? (
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-neon-pink-dark to-neon-pink">
              <Sprout className="h-4 w-4 text-neon-pink-bright" />
            </div>
            <div>
              <div className="text-xs font-medium text-text-primary">Aaron</div>
              <div className="text-[11px] text-text-muted">local session</div>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-neon-pink-dark to-neon-pink">
              <Sprout className="h-4 w-4 text-neon-pink-bright" />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
