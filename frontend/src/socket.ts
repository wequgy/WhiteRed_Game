// src/socket.ts
import { io, Socket } from "socket.io-client";

const URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

export const socket: Socket = io(URL, {
  transports: ["websocket"],
});
