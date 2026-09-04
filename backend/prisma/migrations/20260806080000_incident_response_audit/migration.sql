-- Integration Sprint 4: one shared AuditAction for AI-tamper and
-- transport-anomaly incidents. Additive only.
ALTER TYPE "AuditAction" ADD VALUE 'INCIDENT_RECORDED';
