// Holds the initialized Socket.IO server instance so any service or
// controller can broadcast events without circular imports of server.js.
let ioInstance = null;

export function setIo(io) {
  ioInstance = io;
}

export function getIo() {
  if (!ioInstance) {
    throw new Error('Socket.IO has not been initialized yet.');
  }
  return ioInstance;
}
