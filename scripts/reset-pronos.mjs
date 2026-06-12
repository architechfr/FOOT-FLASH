#!/usr/bin/env node
/**
 * reset-pronos.mjs — Supprime les pronos invalides de Supabase.
 *
 * Contexte : ALL_MATCHES dans prono-poto/index.html avait un MAUVAIS calendrier
 * (ex. ID 1 = MEX-KOR au lieu de MEX-RSA). Les pronos déjà posés par les joueurs
 * sont donc associés aux mauvais matchs. Ce script les supprime pour que les
 * joueurs puissent tout recommencer sur le bon calendrier.
 *
 * Par défaut : supprime les pronos pour les matchs 1 à 72 (phase de groupes).
 * Les matchs à élimination directe (73-104) n'ont pas encore de pronos.
 *
 * Usage : SUPABASE_URL=xxx SUPABASE_SERVICE_KEY=xxx node scripts/reset-pronos.mjs
 * Via GitHub Actions : workflow_dispatch → reset-pronos.yml (à créer si besoin)
 */
import process from "node:process";

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPA_URL || !SUPA_KEY) {
  console.error("❌ SUPABASE_URL et SUPABASE_SERVICE_KEY requis.");
  process.exit(1);
}

// IDs des matchs dont les pronos sont invalides (phase de groupes = 1 à 72)
const FROM_ID = 1, TO_ID = 72;

console.log(`🗑️  Suppression des pronos pour les matchs ${FROM_ID} à ${TO_ID}…`);

const r = await fetch(
  `${SUPA_URL}/rest/v1/pronos?match_id=gte.${FROM_ID}&match_id=lte.${TO_ID}`,
  {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${SUPA_KEY}`,
      "apikey": SUPA_KEY,
      "Content-Type": "application/json",
      "Prefer": "return=minimal",
    },
  }
);

if (!r.ok) {
  const txt = await r.text().catch(() => "");
  // Essaie avec le nom de colonne alternatif "matchId"
  if (r.status === 400) {
    console.warn(`⚠️  Colonne 'match_id' introuvable (HTTP ${r.status}), essai avec 'matchId'…`);
    const r2 = await fetch(
      `${SUPA_URL}/rest/v1/pronos?matchId=gte.${FROM_ID}&matchId=lte.${TO_ID}`,
      {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${SUPA_KEY}`,
          "apikey": SUPA_KEY,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
      }
    );
    if (!r2.ok) {
      const txt2 = await r2.text().catch(() => "");
      console.error(`❌ Supabase DELETE HTTP ${r2.status}: ${txt2}`);
      process.exit(1);
    }
    console.log(`✅ Pronos supprimés (colonne matchId).`);
    process.exit(0);
  }
  console.error(`❌ Supabase DELETE HTTP ${r.status}: ${txt}`);
  process.exit(1);
}

console.log(`✅ Pronos des matchs ${FROM_ID}–${TO_ID} supprimés.`);
console.log("   Les joueurs peuvent maintenant re-saisir leurs pronos sur le bon calendrier.");
