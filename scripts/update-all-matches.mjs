#!/usr/bin/env node
/**
 * update-all-matches.mjs — Met à jour ALL_MATCHES dans prono-poto/index.html
 * en utilisant matches.json (calendrier vérifié) + schedule-fd.json (horaires UTC).
 *
 * Usage : node scripts/update-all-matches.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATA = path.join(ROOT, "app", "src", "main", "assets", "data");

const matchesFile = JSON.parse(fs.readFileSync(path.join(DATA, "matches.json"), "utf8"));
const schedFd     = JSON.parse(fs.readFileSync(path.join(DATA, "schedule-fd.json"), "utf8")).data || {};

// Offset UTC (heures) par ville/stade — été 2026 (DST en vigueur sauf Mexique)
const CITY_OFFSET = {
  "Mexico City": -6, "Guadalajara": -6, "Monterrey": -6,
  "Los Angeles": -7, "Santa Clara": -7, "Seattle": -7, "Vancouver": -7,
  "Houston": -5, "Arlington": -5, "Kansas City": -5,
  "East Rutherford": -4, "Philadelphia": -4, "Foxborough": -4,
  "Miami": -4, "Atlanta": -4, "Toronto": -4,
};

function localToUtc(localIso, city) {
  const offset = CITY_OFFSET[city];
  if (offset == null) throw new Error(`Ville inconnue: ${city}`);
  const [datePart, timePart] = localIso.split("T");
  const [h, m] = timePart.split(":").map(Number);
  const totalMinutes = h * 60 + m - offset * 60;
  const date = new Date(datePart);
  date.setUTCMinutes(date.getUTCMinutes() + totalMinutes);
  // correction: la date locale est interprétée comme UTC=0 ici, on décale manuellement
  // nouvelle approche : construire le timestamp correctement
  const base = new Date(datePart + "T" + timePart + ":00Z");
  // base is local time treated as UTC; subtract offset to get real UTC
  const utc = new Date(base.getTime() - offset * 3600000);
  return utc.toISOString().replace(".000Z", "Z").replace(/\.\d{3}Z$/, "Z");
}

const lines = [];
for (const m of matchesFile.data) {
  // Kickoff UTC : schedule-fd.json pour les groupes (IDs 1-72 avec entrée valide)
  let kickoff;
  const fd = schedFd[String(m.id)];
  if (fd && fd.utc && fd.stage === "GROUP_STAGE") {
    kickoff = fd.utc;
  } else {
    // Knockout ou ID sans entrée de groupe : conversion locale → UTC
    kickoff = localToUtc(m.d, m.city);
  }

  const t1   = m.t1 === "TBD" ? null : m.t1;
  const t2   = m.t2 === "TBD" ? null : m.t2;
  const t1s  = t1 == null ? "null" : `"${t1}"`;
  const t2s  = t2 == null ? "null" : `"${t2}"`;
  const stad = (m.stad || "").replace(/"/g, '\\"');
  const city = (m.city || "").replace(/"/g, '\\"');

  lines.push(
    `{id:${m.id},kickoff:"${kickoff}",stage:"${m.st}",` +
    `team1:${t1s},team2:${t2s},` +
    `stadium:"${stad}",city:"${city}",score1:null,score2:null}`
  );
}

const newBlock = "var ALL_MATCHES=[\n" + lines.join(",\n") + "\n];";

// Remplacement dans prono-poto/index.html
const htmlPath = path.join(ROOT, "prono-poto", "index.html");
let html = fs.readFileSync(htmlPath, "utf8");

const start = html.indexOf("var ALL_MATCHES=[");
if (start === -1) { console.error("❌ var ALL_MATCHES=[ non trouvé dans index.html"); process.exit(1); }

// Trouve la ligne `];` qui ferme ALL_MATCHES (cherche depuis start)
let depth = 0, end = -1;
for (let i = start; i < html.length; i++) {
  if (html[i] === "[") depth++;
  if (html[i] === "]") { depth--; if (depth === 0) { end = i + 1; break; } }
}
if (end === -1) { console.error("❌ Fin de ALL_MATCHES non trouvée"); process.exit(1); }
// inclure le `;` qui suit `]`
if (html[end] === ";") end++;

html = html.slice(0, start) + newBlock + html.slice(end);
fs.writeFileSync(htmlPath, html, "utf8");

console.log(`✅ ALL_MATCHES mis à jour : ${matchesFile.data.length} matchs dans prono-poto/index.html`);
console.log(`   ID 1 → ${matchesFile.data[0].t1} vs ${matchesFile.data[0].t2} (${schedFd["1"]?.utc})`);
console.log(`   ID 2 → ${matchesFile.data[1].t1} vs ${matchesFile.data[1].t2} (${schedFd["2"]?.utc})`);
