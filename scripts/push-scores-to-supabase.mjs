#!/usr/bin/env node
/**
 * push-scores-to-supabase.mjs — Pousse les vrais scores vers Supabase PRONO POTO.
 *
 * Lit livescores.json (mis à jour par fetch-livescores.mjs via football-data.org)
 * et upserte dans la table `matches` de Supabase les champs score1/score2
 * pour chaque match FINISHED ou en cours (IN_PLAY/HT).
 *
 * Appelé automatiquement depuis update-livescores.yml à chaque itération.
 * Idempotent : si les scores n'ont pas changé, l'upsert ne modifie rien côté DB.
 *
 * Usage : SUPABASE_URL=xxx SUPABASE_SERVICE_KEY=xxx node scripts/push-scores-to-supabase.mjs
 */
import fs from "node:fs";
import path from "node:path";

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPA_URL || !SUPA_KEY) {
  // Pas de secret configuré → on skippe silencieusement (pas une erreur bloquante)
  console.log("ℹ️ SUPABASE_SERVICE_KEY absent → push-scores-to-supabase ignoré.");
  process.exit(0);
}

const DATA  = path.join(process.cwd(), "app", "src", "main", "assets", "data");
const lsFile = path.join(DATA, "livescores.json");
const ls = (() => { try { return JSON.parse(fs.readFileSync(lsFile, "utf8")); } catch { return null; } })();
if (!ls || !ls.data) { console.log("ℹ️ livescores.json vide → rien à pousser."); process.exit(0); }

const rows = [];
for (const [idStr, entry] of Object.entries(ls.data)) {
  if (!entry) continue;
  const st = String(entry.status || "").toUpperCase();
  const finished = ["FINISHED", "FT", "AET", "PEN", "AWARDED"].includes(st);
  const live     = ["IN_PLAY", "HT", "PAUSED"].includes(st);
  if (!finished && !live) continue;   // TIMED/SCHEDULED → pas encore joué
  if (entry.s1 == null || entry.s2 == null) continue;

  rows.push({
    id:     parseInt(idStr, 10),
    score1: entry.s1,
    score2: entry.s2,
    // On n'écrase PAS team1/team2/kickoff/stage (déjà corrects après reseed)
  });
}

if (!rows.length) {
  console.log("ℹ️ Aucun score à pousser vers Supabase.");
  process.exit(0);
}

console.log(`📤 Push ${rows.length} score(s) → Supabase…`);

const r = await fetch(`${SUPA_URL}/rest/v1/matches`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${SUPA_KEY}`,
    "apikey":        SUPA_KEY,
    "Content-Type":  "application/json",
    "Prefer":        "resolution=merge-duplicates,return=minimal",
  },
  body: JSON.stringify(rows),
});

if (!r.ok) {
  const txt = await r.text().catch(() => "");
  console.error(`❌ Supabase scores HTTP ${r.status}: ${txt}`);
  process.exit(1);
}

for (const row of rows) {
  console.log(`✅ Match #${row.id} → score ${row.score1}-${row.score2} poussé.`);
}
