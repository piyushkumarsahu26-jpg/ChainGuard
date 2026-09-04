// Central place for room subscriptions and inbound socket event names.
// Outbound broadcast events (detection:new, alert:new, camera:offline,
// envelope:updated) are emitted directly from the relevant services.
export function registerSocketEvents(io, socket) {
  socket.on('room:join', (roomName) => {
    socket.join(roomName);
  });

  socket.on('room:leave', (roomName) => {
    socket.leave(roomName);
  });
}
