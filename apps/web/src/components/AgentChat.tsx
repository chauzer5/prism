import { useState, useRef, useEffect, useCallback } from "react";
import { Send, ChevronRight, Loader2, AlertCircle, Wrench, HelpCircle } from "lucide-react";
import { trpc } from "@/trpc";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAgentsStore } from "@/stores/agents";
import { cn } from "@/lib/utils";

interface AgentChatProps {
  agentId: string;
}

interface ToolGroup {
  kind: "tool_group";
  id: string; // first message id
  items: Array<{
    id: string;
    role: "tool_use" | "tool_result";
    content: string;
    toolName?: string | null;
    isError?: boolean | null;
  }>;
}

interface TextMessage {
  kind: "text";
  id: string;
  role: "assistant" | "user";
  content: string;
}

interface QuestionMessage {
  kind: "question";
  id: string;
  question: string;
}

type ChatBlock = ToolGroup | TextMessage | QuestionMessage;

/** Group consecutive tool_use/tool_result messages into collapsible blocks */
function groupMessages(
  messages: Array<{
    id: string;
    role: string;
    content: string;
    toolName?: string | null;
    isError?: boolean | null;
  }>,
): ChatBlock[] {
  const blocks: ChatBlock[] = [];
  let currentToolGroup: ToolGroup | null = null;

  for (const msg of messages) {
    if (msg.role === "tool_use" && msg.toolName === "AskUserQuestion") {
      // Flush any pending tool group before the question
      if (currentToolGroup) {
        blocks.push(currentToolGroup);
        currentToolGroup = null;
      }
      // Extract question text from the tool input JSON
      let question = msg.content;
      try {
        const parsed = JSON.parse(msg.content);
        question = parsed.question || parsed.text || msg.content;
      } catch { /* use raw content */ }
      blocks.push({ kind: "question", id: msg.id, question });
      // Skip the next tool_result for AskUserQuestion (it's a default/empty response)
      continue;
    }
    if (msg.role === "tool_result" && currentToolGroup === null) {
      // Orphaned tool_result (e.g. from skipped AskUserQuestion) — ignore
      continue;
    }
    if (msg.role === "tool_use" || msg.role === "tool_result") {
      if (!currentToolGroup) {
        currentToolGroup = { kind: "tool_group", id: msg.id, items: [] };
      }
      currentToolGroup.items.push({
        id: msg.id,
        role: msg.role as "tool_use" | "tool_result",
        content: msg.content,
        toolName: msg.toolName,
        isError: msg.isError,
      });
    } else {
      // Flush any pending tool group
      if (currentToolGroup) {
        blocks.push(currentToolGroup);
        currentToolGroup = null;
      }
      blocks.push({
        kind: "text",
        id: msg.id,
        role: msg.role as "assistant" | "user",
        content: msg.content,
      });
    }
  }

  // Flush trailing tool group
  if (currentToolGroup) {
    blocks.push(currentToolGroup);
  }

  return blocks;
}

export function AgentChat({ agentId }: AgentChatProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  const agentQuery = trpc.agents.get.useQuery({ id: agentId });
  const messagesQuery = trpc.agents.messages.useQuery({ agentId });
  const respond = trpc.agents.respond.useMutation({
    onSuccess: () => {
      setInput("");
      agentQuery.refetch();
      messagesQuery.refetch();
    },
  });

  const streamingText = useAgentsStore((s) => s.streamingText[agentId] || "");
  const appendStreamingText = useAgentsStore((s) => s.appendStreamingText);
  const clearStreamingText = useAgentsStore((s) => s.clearStreamingText);

  const agent = agentQuery.data;
  const messages = messagesQuery.data ?? [];
  const isRunning = agent?.status === "running";
  const isAskedQuestion = agent?.status === "asked_question";
  const canRespond = agent?.status === "completed" || agent?.status === "waiting" || isAskedQuestion;

  const blocks = groupMessages(messages);

  // WebSocket listener for real-time updates
  const onWsEvent = useCallback(
    (event: { type: string; agentId?: string; [key: string]: unknown }) => {
      if (event.agentId !== agentId) return;

      switch (event.type) {
        case "agent:text":
          appendStreamingText(agentId, event.text as string);
          break;
        case "agent:tool_use":
        case "agent:tool_result":
          clearStreamingText(agentId);
          messagesQuery.refetch();
          break;
        case "agent:status":
          clearStreamingText(agentId);
          agentQuery.refetch();
          messagesQuery.refetch();
          break;
      }
    },
    [agentId, appendStreamingText, clearStreamingText, messagesQuery, agentQuery],
  );
  useWebSocket(onWsEvent);

  // Auto-scroll to bottom using the scroll container directly
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [blocks.length, streamingText]);

  function handleSend() {
    const msg = input.trim();
    if (!msg || !canRespond) return;
    respond.mutate({ id: agentId, message: msg });
  }

  function toggleGroup(id: string) {
    setExpandedGroups((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTool(id: string) {
    setExpandedTools((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex h-full flex-col min-h-0">
      {/* Messages — this is the only scrollable area */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
        {blocks.map((block) => {
          if (block.kind === "text" && block.role === "user") {
            return (
              <div key={block.id} className="flex justify-end">
                <div className="max-w-[80%] rounded-xl bg-neon-pink/15 border border-neon-pink/20 px-4 py-2.5 text-sm text-cream">
                  <pre className="whitespace-pre-wrap font-sans">{block.content}</pre>
                </div>
              </div>
            );
          }

          if (block.kind === "text" && block.role === "assistant") {
            return (
              <div key={block.id} className="max-w-[90%]">
                <pre className="whitespace-pre-wrap font-sans text-sm text-cream/90 leading-relaxed">
                  {block.content}
                </pre>
              </div>
            );
          }

          if (block.kind === "question") {
            return (
              <div key={block.id} className="max-w-[90%]">
                <div className="flex items-start gap-3 rounded-xl border border-neon-cyan/30 bg-neon-cyan/[0.06] px-4 py-3">
                  <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-neon-cyan" />
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-neon-cyan/70 mb-1">
                      Agent has a question
                    </p>
                    <pre className="whitespace-pre-wrap font-sans text-sm text-cream leading-relaxed">
                      {block.question}
                    </pre>
                  </div>
                </div>
              </div>
            );
          }

          if (block.kind === "tool_group") {
            const isExpanded = expandedGroups.has(block.id);
            const toolCount = block.items.filter((i) => i.role === "tool_use").length;
            const hasError = block.items.some((i) => i.role === "tool_result" && i.isError);

            return (
              <div key={block.id} className="max-w-[90%]">
                <button
                  onClick={() => toggleGroup(block.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-mono transition-colors",
                    hasError
                      ? "bg-[rgba(239,68,68,0.06)] border-[rgba(239,68,68,0.15)] text-red-400/80 hover:bg-[rgba(239,68,68,0.1)]"
                      : "bg-[rgba(139,92,246,0.06)] border-[rgba(139,92,246,0.15)] text-neon-purple/80 hover:bg-[rgba(139,92,246,0.1)]",
                  )}
                >
                  <ChevronRight
                    className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-90")}
                  />
                  <Wrench className="h-3 w-3" />
                  Working
                  <span className="text-text-muted">
                    ({toolCount} tool{toolCount !== 1 ? "s" : ""})
                  </span>
                </button>

                {isExpanded && (
                  <div className="mt-2 ml-2 space-y-1.5 border-l border-border/50 pl-3">
                    {block.items.map((item) => {
                      if (item.role === "tool_use") {
                        const isToolExpanded = expandedTools.has(item.id);
                        return (
                          <div key={item.id}>
                            <button
                              onClick={() => toggleTool(item.id)}
                              className="flex items-center gap-1.5 rounded-md bg-[rgba(139,92,246,0.06)] px-2 py-1 text-[11px] font-mono text-neon-purple/70 transition-colors hover:bg-[rgba(139,92,246,0.1)]"
                            >
                              <ChevronRight
                                className={cn("h-2.5 w-2.5 transition-transform", isToolExpanded && "rotate-90")}
                              />
                              {item.toolName || "Tool"}
                            </button>
                            {isToolExpanded && item.content && (
                              <pre className="mt-1 max-h-40 overflow-auto rounded-md bg-[rgba(0,0,0,0.3)] p-2 font-mono text-[10px] text-text-muted leading-relaxed">
                                {formatToolInput(item.content)}
                              </pre>
                            )}
                          </div>
                        );
                      }

                      if (item.role === "tool_result") {
                        const isToolExpanded = expandedTools.has(item.id);
                        return (
                          <div key={item.id}>
                            <button
                              onClick={() => toggleTool(item.id)}
                              className={cn(
                                "flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-mono transition-colors",
                                item.isError
                                  ? "bg-[rgba(239,68,68,0.06)] text-red-400/70 hover:bg-[rgba(239,68,68,0.1)]"
                                  : "bg-[rgba(34,211,238,0.04)] text-neon-cyan/50 hover:bg-[rgba(34,211,238,0.08)]",
                              )}
                            >
                              <ChevronRight
                                className={cn("h-2.5 w-2.5 transition-transform", isToolExpanded && "rotate-90")}
                              />
                              {item.isError && <AlertCircle className="h-2.5 w-2.5" />}
                              Result
                            </button>
                            {isToolExpanded && item.content && (
                              <pre className="mt-1 max-h-40 overflow-auto rounded-md bg-[rgba(0,0,0,0.3)] p-2 font-mono text-[10px] text-text-muted leading-relaxed">
                                {item.content.slice(0, 2000)}
                                {item.content.length > 2000 && "\n... (truncated)"}
                              </pre>
                            )}
                          </div>
                        );
                      }

                      return null;
                    })}
                  </div>
                )}
              </div>
            );
          }

          return null;
        })}

        {/* Streaming text (in-progress assistant output) */}
        {streamingText && (
          <div className="max-w-[90%]">
            <pre className="whitespace-pre-wrap font-sans text-sm text-cream/90 leading-relaxed">
              {streamingText}
              <span className="animate-pulse text-neon-pink">|</span>
            </pre>
          </div>
        )}

        {/* Empty state */}
        {blocks.length === 0 && !streamingText && !isRunning && (
          <div className="flex h-full items-center justify-center text-text-muted text-sm">
            No messages yet
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-border p-4">
        {isRunning ? (
          <div className="flex items-center gap-2 text-xs text-neon-yellow">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Agent is working...
          </div>
        ) : canRespond ? (
          <div className="flex items-center gap-2">
            {isAskedQuestion && (
              <HelpCircle className="h-4 w-4 shrink-0 text-neon-cyan" />
            )}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isAskedQuestion ? "Answer the agent's question..." : "Send a message..."}
              rows={1}
              className="flex-1 resize-none rounded-lg border border-border bg-[rgba(0,0,0,0.3)] px-3 py-2 text-sm text-cream placeholder:text-text-muted/50 focus:border-neon-pink/50 focus:outline-none focus:ring-1 focus:ring-neon-pink/30"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || respond.isPending}
              className="rounded-lg bg-neon-pink/20 p-2 text-neon-pink transition-colors hover:bg-neon-pink/30 disabled:opacity-30"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="text-xs text-text-muted">
            Agent has {agent?.status === "failed" ? "failed" : "stopped"}
          </div>
        )}
      </div>
    </div>
  );
}

function formatToolInput(content: string): string {
  try {
    const parsed = JSON.parse(content);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return content;
  }
}
