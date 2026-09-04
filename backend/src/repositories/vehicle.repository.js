import { prisma } from '../config/db.js';

export const vehicleRepository = {
  create: (data) => prisma.vehicle.create({ data }),
  findById: (id) => prisma.vehicle.findUnique({ where: { id } }),
  findByVehicleNumber: (vehicleNumber) => prisma.vehicle.findUnique({ where: { vehicleNumber } }),
  // Critical bug fix: optional `client` param, same reasoning as
  // transportSessionRepository.update() -- lets this run inside the same
  // transaction as the session-status write it must stay in sync with.
  update: (id, data, client = prisma) => client.vehicle.update({ where: { id }, data }),
  list: ({ skip, take, where }) =>
    prisma.vehicle.findMany({ skip, take, where, orderBy: { vehicleNumber: 'asc' } }),
  count: (where) => prisma.vehicle.count({ where }),
};
