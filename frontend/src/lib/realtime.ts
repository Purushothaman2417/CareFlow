import { io, type Socket } from "socket.io-client";

import { getRealtimeBaseUrl } from "@/lib/api";

interface QueueUpdate {
  queueId: string;
}

interface RealtimeHandlers {
  onQueueUpdate: (update: QueueUpdate) => void;
  onNotification: () => void;
}

let socket: Socket | null = null;
const queueRooms = new Set<string>();

export function connectRealtime(token: string, handlers: RealtimeHandlers): () => void {
  socket?.disconnect();
  socket = io(getRealtimeBaseUrl(), {
    auth: { token },
    reconnection: true,
  });

  const activeSocket = socket;
  activeSocket.on("connect", () => {
    for (const queueId of queueRooms) {
      activeSocket.emit("joinQueue", queueId);
    }
  });
  activeSocket.on("queueUpdated", handlers.onQueueUpdate);
  activeSocket.on("notification", handlers.onNotification);
  activeSocket.on("socketError", (error: { message?: string }) => {
    console.error("Live update authorization failed:", error.message ?? "Unknown error");
  });
  activeSocket.on("connect_error", (error: Error) => {
    console.error("Live updates unavailable; polling remains active:", error.message);
  });

  return () => {
    if (socket === activeSocket) {
      activeSocket.disconnect();
      socket = null;
      queueRooms.clear();
    }
  };
}

export function joinQueueRoom(queueId: string): void {
  queueRooms.add(queueId);
  if (socket?.connected) {
    socket.emit("joinQueue", queueId);
  }
}

export function leaveQueueRoom(queueId: string): void {
  queueRooms.delete(queueId);
  if (socket?.connected) {
    socket.emit("leaveQueue", queueId);
  }
}

export function refreshRealtimeAuthentication(token: string): void {
  if (!socket) return;
  socket.auth = { token };
  socket.disconnect();
  socket.connect();
}
