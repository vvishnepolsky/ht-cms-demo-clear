import { ensureStaffSeeds, SEED_PASSWORD, STAFF_SEEDS } from "./auth.js";

const created = ensureStaffSeeds();
if (created.length) {
  console.log(`Created staff users: ${created.join(", ")} (password: ${SEED_PASSWORD})`);
} else {
  console.log("Staff users already seeded — nothing to do.");
}
for (const s of STAFF_SEEDS) {
  console.log(`  ${s.email} / ${SEED_PASSWORD} — ${s.role} (${s.firstName} ${s.lastName})`);
}
