import { prisma } from '../config/db.js';

const withContext = {
  envelope: { select: { id: true, envelopeCode: true, exam: true, center: true } },
  officer: { select: { id: true, name: true, role: true } },
  vehicle: true,
  // Sprint 6: deviation/delay detection needs the assigned route's
  // ordered checkpoints on every session read — included here once
  // rather than a separate query in gps.service.js for every update.
  route: { include: { checkpoints: { orderBy: { sequence: 'asc' } } } },
};

export const transportSessionRepository = {
  create: (data) => prisma.transportSession.create({ data, include: withContext }),
  findById: (id) => prisma.transportSession.findUnique({ where: { id }, include: withContext }),
  // Critical bug fix: optional `client` param so a caller can run this
  // inside a prisma.$transaction() alongside a related write (e.g.
  // Vehicle.status) that must succeed or fail together with this one.
  // Defaults to the module's own prisma singleton -- every existing call
  // site (none of which pass a third argument) is unaffected.
  update: (id, data, client = prisma) => client.transportSession.update({ where: { id }, data, include: withContext }),
  // "Active" here means non-terminal (ongoing) — ACTIVE or PAUSED — used
  // by the live map/dashboard, which should keep showing a paused
  // session's vehicle at its last known position, not drop it. Use
  // listActiveOnly() where the ACTIVE/PAUSED distinction specifically
  // matters (e.g. the stale-signal watcher, which must not treat an
  // intentional pause as a lost signal).
  listActive: () =>
    prisma.transportSession.findMany({
      where: { status: { in: ['ACTIVE', 'PAUSED'] } },
      include: withContext,
      orderBy: { startTime: 'desc' },
    }),
  listActiveOnly: () =>
    prisma.transportSession.findMany({
      where: { status: 'ACTIVE' },
      include: withContext,
      orderBy: { startTime: 'desc' },
    }),
  // Critical bug fix: the real source of truth for "is this vehicle
  // already on a transport" -- see gps.service.js's startTransport() for
  // why this replaced trusting Vehicle.status (a separately-maintained,
  // desyncable field) for that decision.
  findActiveForVehicle: (vehicleId) =>
    prisma.transportSession.findFirst({
      where: { vehicleId, status: { in: ['ACTIVE', 'PAUSED'] } },
      include: withContext,
    }),
  // Final Verification Sprint fix: the analogous, previously-missing
  // check for the envelope side of the same real-world constraint --
  // a physical envelope cannot legitimately be on two vehicles/
  // transport sessions at once, but nothing checked for this before.
  findActiveForEnvelope: (envelopeId) =>
    prisma.transportSession.findFirst({
      where: { envelopeId, status: { in: ['ACTIVE', 'PAUSED'] } },
      include: withContext,
    }),
  listByEnvelope: (envelopeId) =>
    prisma.transportSession.findMany({
      where: { envelopeId },
      include: withContext,
      orderBy: { startTime: 'desc' },
    }),
  list: ({ skip, take, where }) =>
    prisma.transportSession.findMany({
      skip,
      take,
      where,
      include: withContext,
      orderBy: { startTime: 'desc' },
    }),
  count: (where) => prisma.transportSession.count({ where }),
};
