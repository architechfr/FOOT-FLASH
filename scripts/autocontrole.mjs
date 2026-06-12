#!/usr/bin/env node
/**
 * autocontrole.mjs — Vérifie la cohérence du calendrier entre TOUTES les sources.
 *
 * Croise 4 sources et signale la moindre divergence (équipes, instant UTC, stage) :
 *   1. matches.json          — source de vérité FOOtFLASH (football-data.org + openfootball)
 *   2. schedule-fd.json      — instants UTC exacts de football-data.org (phase de groupes)
 *   3. ALL_MATCHES           — calendrier embarqué dans prono-poto/index.html
 *   4. table `matches` Supabase — état réellement déployé (lecture seule, clé publique)
 *   + livescores.json        — scores poussés, comparés à Supabase
 *
 * Aucune écriture, aucun secret requis (clé anon publique en lecture seule).
 * Usage : node scripts/autocontrole.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATA = path.join(ROOT, "app", "src", "main", "assets", "data");
const readJson = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fb; } };

const matchesFile = readJson(path.join(DATA, "matches.json"), null);
const schedFd     = (readJson(path.join(DATA, "schedule-fd.json"), {}) || {}).data || {};
const livescores  = (readJson(path.join(DATA, "livescores.json"), {}) || {}).data || {};
if (!matchesFile || !Array.isArray(matchesFile.data)) {
  console.error("❌ matches.json introuvable ou mal formé."); process.exit(1);
}
const matches = matchesFile.data;

// ── Fuseau (offset été 2026) par ville — mêmes règles que compare-openfootball.py ──
function appOffset(city) {
  const c = city || "";
  if (/Mexico|Guadalajara|Zapopan|Monterrey|Guadalupe|Puebla/.test(c)) return -6;
  if (/Los Angeles|Inglewood|San Francisco|Santa Clara|San Diego|Seattle|Vancouver/.test(c)) return -7;
  if (/Dallas|Arlington|Houston|Kansas City|Chicago|St\. Louis|San Antonio/.test(c)) return -5;
  return -4; // côte Est
}
// Instant UTC d'un match app (heure murale locale + offset ville)
function appUtc(m) {
  const base = new Date(m.d + ":00Z").getTime();        // heure murale lue comme UTC
  return base - appOffset(m.city) * 3600000;            // - offset → vrai UTC
}
const iso = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

// ── Charge ALL_MATCHES depuis prono-poto/index.html ──
function loadAllMatches() {
  const html = fs.readFileSync(path.join(ROOT, "prono-poto", "index.html"), "utf8");
  const start = html.indexOf("var ALL_MATCHES=[");
  if (start === -1) throw new Error("var ALL_MATCHES introuvable");
  let depth = 0, end = -1;
  for (let i = html.indexOf("[", start); i < html.length; i++) {
    if (html[i] === "[") depth++;
    if (html[i] === "]") { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  // Requote uniquement les CLÉS (précédées de { ou ,) — pas les heures "19:00:00".
  const json = html.slice(html.indexOf("[", start), end).replace(/([{,])(\w+):/g, '$1"$2":');
  return JSON.parse(json);
}

let issues = [], ok = 0;
const add = (tag, msg) => issues.push([tag, msg]);

// ════════ 1. matches.json ↔ ALL_MATCHES (prono-poto) ════════
let allMatches;
try { allMatches = loadAllMatches(); }
catch (e) { console.error("❌ Lecture ALL_MATCHES :", e.message); process.exit(1); }

const ppById = new Map(allMatches.map(m => [m.id, m]));
if (allMatches.length !== matches.length)
  add("COMPTE", `ALL_MATCHES=${allMatches.length} vs matches.json=${matches.length}`);

for (const m of matches) {
  const pp = ppById.get(m.id);
  if (!pp) { add("PP-ABSENT", `id ${m.id} (${m.t1}-${m.t2}) absent de ALL_MATCHES`); continue; }
  const t1 = m.t1 === "TBD" ? null : m.t1, t2 = m.t2 === "TBD" ? null : m.t2;
  if (pp.team1 !== t1 || pp.team2 !== t2)
    add("PP-EQUIPE", `id ${m.id} : matches.json ${t1}-${t2} ≠ ALL_MATCHES ${pp.team1}-${pp.team2}`);
  if (pp.stage !== m.st)
    add("PP-STAGE", `id ${m.id} : stage "${m.st}" ≠ "${pp.stage}"`);
  // Instant UTC : référence = schedule-fd (groupes) sinon conversion app
  const fd = schedFd[String(m.id)];
  const refUtc = (fd && fd.utc && fd.stage === "GROUP_STAGE") ? new Date(fd.utc).getTime() : appUtc(m);
  const ppUtc = new Date(pp.kickoff).getTime();
  if (refUtc !== ppUtc)
    add("PP-HORAIRE", `id ${m.id} ${m.t1}-${m.t2} : réf UTC ${iso(refUtc)} ≠ ALL_MATCHES ${iso(ppUtc)}`);
  if (pp) ok++;
}

// ════════ 2. matches.json ↔ schedule-fd.json (cohérence interne FOOtFLASH) ════════
for (const m of matches) {
  const fd = schedFd[String(m.id)];
  if (!fd || fd.stage !== "GROUP_STAGE") continue;
  const diff = Math.abs(appUtc(m) - new Date(fd.utc).getTime());
  // tolérance 0 : doit être exact pour la phase de groupes
  if (diff !== 0)
    add("FD-HORAIRE", `id ${m.id} ${m.t1}-${m.t2} : matches.json (UTC ${iso(appUtc(m))}) ≠ schedule-fd ${fd.utc}`);
}

// ════════ 3. Doublons d'instant UTC suspects (deux matchs même groupe même heure) ════════
const slotMap = new Map();
for (const m of matches) {
  if (m.t1 === "TBD") continue;
  const fd = schedFd[String(m.id)];
  const u = (fd && fd.utc && fd.stage === "GROUP_STAGE") ? new Date(fd.utc).getTime() : appUtc(m);
  const key = u + "|" + m.st;
  (slotMap.get(key) || slotMap.set(key, []).get(key)).push(m.id);
}
for (const [key, ids] of slotMap) {
  // Normal en phase de groupes : les 2 derniers matchs d'un groupe se jouent
  // SIMULTANÉMENT (règle FIFA anti-arrangement). On ne signale qu'au-delà de 2.
  if (ids.length > 2) {
    const [u, st] = key.split("|");
    add("SLOT-DUP", `${st} : ${ids.length} matchs (${ids.join(",")}) au même instant ${iso(+u)}`);
  }
}

// ════════ 4. Supabase (lecture seule, clé anon publique) ════════
const SUPA_URL = "https://ojbmfagxjcqpptruwnzl.supabase.co";
const SUPA_ANON = "sb_publishable_sy0HEo0wpTuEenFd3X5Swg__2A31sFe";
let supaRows = null;
try {
  const r = await fetch(`${SUPA_URL}/rest/v1/matches?select=id,team1,team2,kickoff,stage,score1,score2&order=id`, {
    headers: { "apikey": SUPA_ANON, "Authorization": `Bearer ${SUPA_ANON}` },
  });
  if (r.ok) supaRows = await r.json();
  else add("SUPA-HTTP", `lecture table matches HTTP ${r.status} (RLS ? skip vérif Supabase)`);
} catch (e) { add("SUPA-NET", `Supabase injoignable : ${e.message}`); }

if (Array.isArray(supaRows)) {
  const supById = new Map(supaRows.map(r => [r.id, r]));
  if (supaRows.length !== matches.length)
    add("SUPA-COMPTE", `Supabase=${supaRows.length} lignes vs matches.json=${matches.length}`);
  for (const m of matches) {
    const s = supById.get(m.id);
    if (!s) { add("SUPA-ABSENT", `id ${m.id} (${m.t1}-${m.t2}) absent de Supabase`); continue; }
    const t1 = m.t1 === "TBD" ? null : m.t1, t2 = m.t2 === "TBD" ? null : m.t2;
    if (s.team1 !== t1 || s.team2 !== t2)
      add("SUPA-EQUIPE", `id ${m.id} : matches.json ${t1}-${t2} ≠ Supabase ${s.team1}-${s.team2}`);
    const fd = schedFd[String(m.id)];
    const refUtc = (fd && fd.utc && fd.stage === "GROUP_STAGE") ? new Date(fd.utc).getTime() : appUtc(m);
    if (s.kickoff) {
      const su = new Date(s.kickoff).getTime();
      if (su !== refUtc)
        add("SUPA-HORAIRE", `id ${m.id} ${m.t1}-${m.t2} : réf UTC ${iso(refUtc)} ≠ Supabase ${iso(su)}`);
    }
    // Scores : livescores.json doit correspondre à Supabase
    const ls = livescores[String(m.id)];
    if (ls && ls.s1 != null) {
      if (s.score1 !== ls.s1 || s.score2 !== ls.s2)
        add("SCORE", `id ${m.id} : livescores ${ls.s1}-${ls.s2} ≠ Supabase ${s.score1}-${s.score2} (push en retard ?)`);
    }
  }
  console.log(`ℹ️  Supabase : ${supaRows.length} matchs lus (lecture seule).`);
} else {
  console.log("ℹ️  Supabase non vérifié (lecture impossible — RLS ou réseau).");
}

// ════════ Rapport ════════
console.log(`\n✅ ${ok}/${matches.length} matchs croisés matches.json ↔ ALL_MATCHES.`);
if (!issues.length) {
  console.log("🎉 AUCUNE divergence. Toutes les sources concordent.");
} else {
  console.log(`⚠️  ${issues.length} divergence(s) :`);
  const byTag = {};
  for (const [tag, msg] of issues) (byTag[tag] = byTag[tag] || []).push(msg);
  for (const tag of Object.keys(byTag)) {
    console.log(`\n  ── [${tag}] (${byTag[tag].length}) ──`);
    for (const msg of byTag[tag]) console.log(`    ${msg}`);
  }
}
// process.exitCode (pas process.exit) → laisse les sockets fetch se fermer proprement
// (évite l'assertion libuv UV_HANDLE_CLOSING sous Windows).
process.exitCode = issues.length ? 1 : 0;
