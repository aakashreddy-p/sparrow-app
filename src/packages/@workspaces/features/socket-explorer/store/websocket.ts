import { writable } from "svelte/store";

export type WebSocketData = {
  messages: {
    data: string;
    transmitter: string;
    timestamp: string;
    uuid: string;
  }[];
  status: "connected" | "disconnected" | "connecting" | "disconnecting";
  search: string;
  body: string;
  contentType: string;
  url: string;
  filter: "All messages" | "Sent" | "Received";
};

export const webSocketDataStore = writable<Map<string, WebSocketData>>(
  new Map(),
);