// frontend/src/constants/roles.js
//
// Mirrors the backend's Role enum (backend/prisma/schema.prisma). Kept as a
// single shared list so every admin-facing component (UserManagement,
// UserDetails) renders the exact same role options instead of each
// hardcoding its own copy that could drift out of sync.

export const ROLE_OPTIONS = [
  { value: 'ADMINISTRATOR', label: 'Administrator' },
  { value: 'CHIEF_EXAMINATION_OFFICER', label: 'Chief Examination Officer' },
  { value: 'PRINTING_OFFICER', label: 'Printing Officer' },
  { value: 'STORAGE_OFFICER', label: 'Storage Officer' },
  { value: 'TRANSPORT_OFFICER', label: 'Transport Officer' },
  { value: 'EXAM_CENTER_OFFICER', label: 'Exam Center Officer' },
  { value: 'AUDITOR', label: 'Auditor' },
  { value: 'VIEWER', label: 'Viewer' },
  { value: 'AI_SYSTEM', label: 'AI System' },
];

export const roleLabel = (value) => ROLE_OPTIONS.find((r) => r.value === value)?.label || value;
