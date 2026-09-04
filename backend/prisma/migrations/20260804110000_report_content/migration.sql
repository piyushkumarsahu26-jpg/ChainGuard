-- Sprint 8, Part 11: real report content generation.
-- Additive only — one nullable JSON column, no existing data touched.
ALTER TABLE "reports" ADD COLUMN "content" JSONB;
