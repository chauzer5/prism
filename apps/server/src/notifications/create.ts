import { execFile } from "node:child_process";
import { db } from "../db/index.js";
import { notifications } from "../db/schema.js";
import { broadcast } from "../ws/events.js";

interface CreateNotificationInput {
  type: "slack_unread" | "mr_pipeline" | "mr_approval" | "todo_created";
  title: string;
  detail?: string;
  url?: string;
  meta?: Record<string, unknown>;
}

export async function createNotification(input: CreateNotificationInput): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.insert(notifications).values({
    id,
    type: input.type,
    title: input.title,
    detail: input.detail ?? null,
    url: input.url ?? null,
    meta: input.meta ? JSON.stringify(input.meta) : null,
    read: false,
    createdAt: now,
  });
  broadcast({ type: "notification:new", notificationId: id });
  sendMacNotification(input.title, input.detail);
  return id;
}

function sendMacNotification(title: string, body?: string) {
  const script = body
    ? `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)}`
    : `display notification "" with title ${JSON.stringify(title)}`;
  execFile("osascript", ["-e", script], (err) => {
    if (err) console.warn("Native notification failed:", err.message);
  });
}
