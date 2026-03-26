import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const slackChannels = sqliteTable("slack_channels", {
  id: text("id").primaryKey(),
  slackChannelId: text("slack_channel_id").notNull(),
  name: text("name").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastPolledAt: text("last_polled_at"),
  teamId: text("team_id"),
  sortOrder: integer("sort_order"),
  createdAt: text("created_at").notNull(),
});

export const slackConversations = sqliteTable("slack_conversations", {
  id: text("id").primaryKey(),
  channelId: text("channel_id").notNull(),
  channelName: text("channel_name").notNull(),
  conversationTs: text("conversation_ts").notNull(),
  day: text("day").notNull(),
  messages: text("messages").notNull(), // JSON array of {user, text, ts, threadTs?}
  mentionsMe: integer("mentions_me", { mode: "boolean" }).notNull().default(false),
  parentText: text("parent_text").notNull(),
  parentUser: text("parent_user").notNull(),
  messageCount: integer("message_count").notNull(),
  firstMessageAt: text("first_message_at").notNull(),
  lastMessageAt: text("last_message_at").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const slackChannelDirectory = sqliteTable("slack_channel_directory", {
  slackChannelId: text("slack_channel_id").primaryKey(),
  name: text("name").notNull(),
  teamId: text("team_id"),
  cachedAt: text("cached_at").notNull(),
});

export const slackUserDirectory = sqliteTable("slack_user_directory", {
  slackUserId: text("slack_user_id").primaryKey(),
  name: text("name").notNull(),
  teamId: text("team_id"),
  cachedAt: text("cached_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  type: text("type", { enum: ["slack_unread", "mr_pipeline", "mr_approval", "todo_created"] }).notNull(),
  title: text("title").notNull(),
  detail: text("detail"),
  url: text("url"),
  read: integer("read", { mode: "boolean" }).notNull().default(false),
  meta: text("meta"),
  createdAt: text("created_at").notNull(),
});

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  prompt: text("prompt"),
  status: text("status", { enum: ["running", "waiting", "completed", "failed", "stopped", "asked_question"] }).notNull().default("running"),
  mode: text("mode", { enum: ["background", "external"] }).notNull().default("background"),
  sessionId: text("session_id"),
  model: text("model"),
  cwd: text("cwd"),
  pid: integer("pid"),
  exitCode: integer("exit_code"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const agentMessages = sqliteTable("agent_messages", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  role: text("role", { enum: ["assistant", "user", "tool_use", "tool_result"] }).notNull(),
  content: text("content").notNull(),
  toolName: text("tool_name"),
  isError: integer("is_error", { mode: "boolean" }),
  createdAt: text("created_at").notNull(),
});

export const todos = sqliteTable("todos", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  status: text("status", { enum: ["active", "completed", "dismissed"] }).notNull().default("active"),
  priority: text("priority", { enum: ["low", "medium", "high"] }),
  dueDate: text("due_date"),
  url: text("url"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
