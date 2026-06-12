#!/usr/bin/env node
/**
 * reseed-supabase.mjs — Corrige la table `matches` dans Supabase PRONO POTO.
 *
 * Problème : la Supabase a été seedée depuis le MAUVAIS calendrier de PRONO POTO
 *   (ex. Match 1 = MEX-KOR au lieu de MEX-RSA).
 * Ce script utilise matches.json (Foot Flash, source vérifiée football-data.org)
 *   + schedule-fd.json (UTC exacts de football-data.org pour les phases de groupes).
 *
 * Usage (une seule fois) :
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_KEY=xxx node scripts/reseed-supabase.mjs
 * Via GitHub Actions : workflow_dispatch → reseed-supabase.yml
 */
import fs from "node:fs";
import path from "node:path";

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPA_URL || !SUPA_KEY) {
  console.error("❌ SUPABASE_URL et SUPABASE_SERVICE_KEY requis.");
  process.exit(1);
}

const DATA = path.join(process.cwd(), "app", "src", "main", "assets", "data");
const readJson = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fb; } };

const matchesFile = readJson(path.join(DATA, "matches.json"), null);
if (!matchesFile || !Array.isArray(matchesFile.data)) {
  console.error("❌ matches.json introuvable ou mal formé."); process.exit(1);
}
const matches = matchesFile.data;

const scheduleFd = (readJson(path.join(DATA, "schedule-fd.json"), {}) || {}).data || {};

// Mapping Foot Flash stage → PRONO POTO / Supabase stage
const STAGE_MAP = {
  "16e de finale": "16es",
  "8e de finale":  "8es",
  "Quart de finale": "Quarts",
  "Demi-finale": "Demies",
  "3e place": "3e place",
  "FINALE": "Finale",
};
const mapStage = st => STAGE_MAP[st] || st; // "Groupe A"-"Groupe L" → inchangé

// Construit les 104 rows pour Supabase
const rows = matches.map(m => {
  // Kickoff UTC : schedule-fd.json pour phases de groupes (IDs 1-72, stage GROUP_STAGE)
  const fdEntry = scheduleFd[String(m.id)];
  let kickoff;
  if (fdEntry && fdEntry.utc && fdEntry.stage === "GROUP_STAGE") {
    kickoff = fdEntry.utc; // UTC fiable
  } else {
    // Knockouts : d est heure locale → on force UTC (approximation acceptable)
    kickoff = m.d.includes("T") ? m.d + ":00Z" : m.d + "T00:00:00Z";
  }

  // NE PAS inclure score1/score2 : un upsert merge-duplicates les écraserait à null
  // alors que les vrais scores sont déjà poussés (corrects par ID). On ne corrige
  // QUE le calendrier (équipes/horaire/stage) ; les scores restent intacts.
  return {
    id:      m.id,
    kickoff,
    stage:   mapStage(m.st),
    team1:   m.t1 !== "TBD" ? m.t1 : null,
    team2:   m.t2 !== "TBD" ? m.t2 : null,
  };
});

console.log(`🌱 Reseed de ${rows.length} matchs dans Supabase…`);

// Upsert en batch (résolution merge-duplicates par id PK)
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
  console.error(`❌ Supabase upsert HTTP ${r.status}: ${txt}`);
  process.exit(1);
}

console.log(`✅ ${rows.length} matchs seedés/corrigés dans Supabase.`);
console.log("   Exemples corrigés :");
console.log(`   Match 1 : ${rows[0].team1} vs ${rows[0].team2} (${rows[0].kickoff})`);
console.log(`   Match 2 : ${rows[1].team1} vs ${rows[1].team2} (${rows[1].kickoff})`);
