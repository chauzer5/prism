import type { WSEvent, WSCommand } from "@prism/shared";
import type { WSContext } from "hono/ws";
import { sendStdin, stopAgent, resizeAgent } from "../agents/manager.js";

const clients = new Set<WSContext>();

export function addClient(ws: WSContext) {
  clients.add(ws);
}

export function removeClient(ws: WSContext) {
  clients.delete(ws);
}

export function broadcast(event: WSEvent) {
  const data = JSON.stringify(event);
  for (const ws of clients) {
    ws.send(data);
  }
}

export function handleCommand(ws: WSContext, command: WSCommand) {
  switch (command.type) {
    case "pong":
      // Client acknowledged ping
      break;
    case "agent:stdin":
      sendStdin(command.agentId, command.data);
      break;
    case "agent:stop":
      stopAgent(command.agentId);
      break;
    case "agent:resize":
      resizeAgent(command.agentId, command.cols, command.rows);
      break;
    default:
      console.log("[ws] unhandled command:", command.type);
  }
}
