// frontend/src/services/socket.js
//
// Shared Socket.IO client singleton.
//
// ASSUMPTION: the backend uses socket.io (inferred from `getIo().emit(...)`
// in detection.service.js). Connects to the API origin (i.e. the backend
// root, WITHOUT the "/api/v1" REST prefix) and authenticates the handshake
// with the same access token used for REST calls.
//
// If the backend's actual config/socket.js uses a custom namespace, a
// different auth mechanism, or validates the token differently, update
// SOCKET_URL and the `auth` payload below accordingly.
//
// Requires: npm install socket.io-client

import { io } from "socket.io-client";

const SOCKET_URL = "http://localhost:5000";

let socket = null;

/**
 * Returns a lazily-created, reused Socket.IO client instance.
 * Multiple components (e.g. AIDetection, future AlertCenter integration)
 * can call this and share the same underlying connection instead of
 * opening a new socket per component.
 */
export function getSocket() {
  if (!socket) {
    const accessToken = sessionStorage.getItem("accessToken");

    socket = io(SOCKET_URL, {
      autoConnect: true,
      withCredentials: true,
      // Sent during the Socket.IO handshake so the backend's auth
      // middleware (if any) can validate the connecting user, mirroring
      // the Bearer token used on REST requests via api.js.
      auth: { token: accessToken },
    });

    socket.on("connect_error", (err) => {
      // Non-fatal: detections/alerts will simply stop updating live.
      // The rest of the app (REST polling via the Refresh button) keeps working.
      console.error("Socket connection error:", err.message);
    });
  }

  return socket;
}

/**
 * Tears down the shared socket connection. Useful on logout, so a stale
 * authenticated socket isn't left open under the next user's session.
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}