// Shared AI-detection class classification. Extracted here in Integration
// Sprint 3 because it was about to be needed in a second place
// (detection.service.js's alert generation, and envelope.service.js's
// sealStatus update) beyond where it originally lived
// (riskScore.service.js's own DAMAGE_SEVERITY, Sprint 8) -- moving it
// once, here, is what "no duplicate logic" means concretely: one real
// definition of "how damaged does this class indicate the envelope is,"
// not three copies that could quietly drift out of sync with each other.
//
// Case-insensitive lookup throughout this project's history: this
// project's own training platform used UPPERCASE class names (SAFE/
// TORN/...); a separately-trained model merged in later (the AI model
// merge sprint) uses lowercase (sealed/torn/...). Every caller normalizes
// to uppercase before looking up here, same as EnvelopeScanner.jsx's
// long-standing getDamageVariant().
export const DAMAGE_SEVERITY = {
  SAFE: 0,
  SEALED: 0, // the second model's name for the same "no damage" class
  TAPED: 0.4,
  PARTIAL_DAMAGE: 0.6,
  OPENED: 0.7,
  CRUSHED: 0.85,
  TORN: 1.0,
};

export function damageSeverity(prediction) {
  return DAMAGE_SEVERITY[(prediction || '').toUpperCase()] ?? 0;
}

// A detection "represents tamper/damage" if its class has any real
// severity at all -- i.e., anything but a clean SAFE/SEALED read. Used to
// gate alert generation (a confident SAFE detection is not suspicious
// activity) and sealStatus updates (a SAFE detection should not change
// an envelope's recorded seal condition).
export function isTamperClass(prediction) {
  return damageSeverity(prediction) > 0;
}

// Integration Sprint 4: "assign an alert severity based on the existing
// detection type" -- combines the class's own real severity (0-1) with
// confidence, so severity reflects *what* was found, not just *how sure*
// the model was. Before this sprint, detection.service.js's alert
// severity was confidence-only (>=0.9 -> CRITICAL, else HIGH), meaning a
// TAPED envelope (this project's own least-severe real damage class) at
// 0.95 confidence scored just as CRITICAL as a TORN one at the same
// confidence, despite tape residue and a torn envelope not being equally
// serious. Lives here, not in detection.service.js itself, for the same
// reason damageSeverity() does: detection.service.js transitively
// imports config/db.js (PrismaClient at module load) and can't be
// imported at all without a live database in this sandbox, so a pure
// function that belongs next to it can't be unit-tested from there.
export function severityForDetection(prediction, confidence) {
  const combined = damageSeverity(prediction) * confidence;
  if (combined >= 0.8) return 'CRITICAL';
  if (combined >= 0.5) return 'HIGH';
  return 'MEDIUM'; // isTamperClass() already gates out non-damage classes before this is ever called
}

// Maps a detected damage class to the Envelope.sealStatus value it
// implies, for Integration Sprint 3's "update the envelope status" after
// a scan. A judgment call, documented here once: OPENED maps directly;
// every other real-damage class (TORN/CRUSHED/TAPED/PARTIAL_DAMAGE)
// maps to TAMPERED, since none of them literally mean "someone opened
// it" the way BROKEN/OPENED do, but all indicate the envelope's
// integrity was compromised in some way. SAFE/SEALED returns null,
// meaning "no change" -- a clean scan should not silently reset a seal
// status that a human officer may have deliberately recorded (e.g. via
// PATCH /envelopes/:id) for a reason the AI can't see in one photo.
export function sealStatusForPrediction(prediction) {
  const upper = (prediction || '').toUpperCase();
  if (upper === 'SAFE' || upper === 'SEALED') return null;
  if (upper === 'OPENED') return 'OPENED';
  if (isTamperClass(prediction)) return 'TAMPERED';
  return null;
}
