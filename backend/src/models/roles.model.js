// Role constants mirrored from prisma schema's Role enum.
// Prisma generates the actual DB-level enum; this file gives the rest
// of the app (routes, middleware) a single import for role names.
export const ROLES = Object.freeze({
  ADMINISTRATOR: 'ADMINISTRATOR',
  PRINTING_OFFICER: 'PRINTING_OFFICER',
  TRANSPORT_OFFICER: 'TRANSPORT_OFFICER',
  EXAM_CENTER_OFFICER: 'EXAM_CENTER_OFFICER',
  AI_SYSTEM: 'AI_SYSTEM',
  // --- Added in Phase 2 (additive only) ---
  CHIEF_EXAMINATION_OFFICER: 'CHIEF_EXAMINATION_OFFICER',
  STORAGE_OFFICER: 'STORAGE_OFFICER',
  AUDITOR: 'AUDITOR',
  VIEWER: 'VIEWER',
});

export const ALL_ROLES = Object.values(ROLES);
