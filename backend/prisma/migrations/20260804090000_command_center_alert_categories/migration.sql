-- Sprint 8: Security Command Center. Additive only — two new enum
-- values so Camera Health (Part 6) can generate real, categorized alerts.
ALTER TYPE "AlertCategory" ADD VALUE 'CAMERA_OFFLINE';
ALTER TYPE "AlertCategory" ADD VALUE 'CAMERA_LOW_FPS';
