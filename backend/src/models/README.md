# models/

Prisma is the source of truth for data models (see `prisma/schema.prisma`).
This folder holds plain-JS constants/enums (e.g. `roles.model.js`) that
mirror Prisma enums for convenient use in middleware and validators,
without needing to import the generated Prisma Client just for a constant.
