#!/usr/bin/env node
/**
 * fetch-lineups.mjs — Remplit app/src/main/assets/data/lineups.json
 * avec les compositions officielles (XI + remplaçants + formation + entraîneur)
 * depuis API-Football, pour les matchs du Mondial 2026 proches du coup d'envoi.
 *
 * La clé API n'est JAMAIS dans l'app : elle est lue ici depuis la variable
 * d'environnement APIFOOTBALL_KEY (secret GitHub côté Action).
 *
 * Usage local :   APIFOOTBALL_KEY=xxxxx node scripts/fetch-lineups.mjs
 * Options (env) :
 *   WINDOW_HOURS   fenêtre autour du coup d'envoi pour aller chercher la compo (défaut 3)
 *   LEAGUE_ID      id API-Football du Mondial (défaut 1)
 *   SEASON         saison (défaut 2026)
 *   FORCE_ALL=1    récupère les compos de TOUS les matchs connus (test)
 */

import fs from "node:fs";
import path from "node:path";

const KEY = process.env.APIFOOTBALL_KEY;
if (!KEY) { console.error("❌ APIFOOTBALL_KEY manquante (variable d'environnement)."); process.exit(1); }

const API = "https://v3.football.api-sports.io";
const LEAGUE_ID = parseInt(process.env.LEAGUE_ID || "1", 10);   // 1 = World Cup chez API-Football
const SEASON = parseInt(process.env.SEASON || "2026", 10);
const WINDOW_MS = (parseFloat(process.env.WINDOW_HOURS || "3")) * 3600000;
const FORCE_ALL = process.env.FORCE_ALL === "1";

const ROOT = path.resolve(process.cwd());
const DATA_DIR = path.join(ROOT, "app", "src", "main", "assets", "data");
const OUT = path.join(DATA_DIR, "lineups.json");

// ── Codes équipes (app) → noms/alias pour le rapprochement avec API-Football ──
const TEAM_ALIASES = {
  MEX:["mexico","mexique"], KOR:["south korea","korea republic","coree du sud","korea"],
  RSA:["south africa","afrique du sud"], CZE:["czech republic","czechia","tchequie","republique tcheque"],
  BRA:["brazil","bresil"], MAR:["morocco","maroc"], GER:["germany","allemagne"],
  NED:["netherlands","pays-bas","holland"], JPN:["japan","japon"], BEL:["belgium","belgique"],
  ESP:["spain","espagne"], URU:["uruguay"], FRA:["france"], NOR:["norway","norvege"],
  SEN:["senegal"], ARG:["argentina","argentine"], POR:["portugal"], CRO:["croatia","croatie"],
  ENG:["england","angleterre"], USA:["usa","united states","etats-unis"], CAN:["canada"],
  BIH:["bosnia and herzegovina","bosnia","bosnie"], QAT:["qatar"], SUI:["switzerland","suisse"],
  HAI:["haiti"], SCO:["scotland","ecosse"], PAR:["paraguay"], AUS:["australia","australie"],
  TUR:["turkey","turkiye","türkiye","turquie"], CIV:["ivory coast","cote d'ivoire","côte d'ivoire"],
  ECU:["ecuador","equateur"], CUR:["curacao","curaçao"], SWE:["sweden","suede"], TUN:["tunisia","tunisie"],
  IRN:["iran","ir iran"], NZL:["new zealand","nouvelle-zelande"], EGY:["egypt","egypte"],
  KSA:["saudi arabia","arabie saoudite"], CPV:["cape verde","cabo verde","cap-vert"],
  IRQ:["iraq","irak"], AUT:["austria","autriche"], JOR:["jordan","jordanie"], ALG:["algeria","algerie"],
  UZB:["uzbekistan","ouzbekistan"], COL:["colombia","colombie"], COD:["dr congo","congo dr","rd congo","congo"],
  GHA:["ghana"], PAN:["panama"]
};

const norm = s => String(s||"").toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g,"")
  .replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();

function codeMatchesName(code, apiName){
  const n = norm(apiName);
  const aliases = TEAM_ALIASES[code] || [norm(code)];
  return aliases.some(a => { const an = norm(a); return n === an || n.includes(an) || an.includes(n); });
}

async function api(endpoint){
  const r = await fetch(API + endpoint, { headers: { "x-apisports-key": KEY } });
  if(!r.ok) throw new Error("API "+r.status+" "+endpoint);
  const j = await r.json();
  if(j.errors && Object.keys(j.errors).length) console.warn("⚠️ API errors:", JSON.stringify(j.errors));
  return j.response || [];
}

function readJson(p, fallback){ try { return JSON.parse(fs.readFileSync(p,"utf8")); } catch(e){ return fallback; } }

// Charge les matchs de l'app (ids internes + codes + date) pour le rapprochement
function loadAppMatches(){
  const matches = readJson(path.join(DATA_DIR,"matches.json"), {data:[]});
  const arr = Array.isArray(matches.data) ? matches.data : (Array.isArray(matches) ? matches : []);
  // attendu : { id, t1, t2, d (ISO locale) ou utc }
  return arr.filter(m => m && m.id && m.t1 && m.t2 && m.t1!=="TBD" && m.t2!=="TBD")
            .map(m => ({ id:m.id, t1:m.t1, t2:m.t2, ko: new Date(m.utc || m.d).getTime() }));
}

function parseSide(entry){
  if(!entry) return { xi:[], subs:[] };
  const mapP = p => ({ n: p.player?.name || "", pos: (p.player?.pos||"").toUpperCase(), num: p.player?.number || null });
  return {
    formation: entry.formation || null,
    coach: entry.coach?.name || null,
    xi: (entry.startXI||[]).map(mapP),
    subs: (entry.substitutes||[]).map(mapP)
  };
}

async function main(){
  const appMatches = loadAppMatches();
  if(!appMatches.length){ console.warn("⚠️ Aucun match app exploitable (matches.json)."); }

  // 1) Fixtures API-Football du Mondial
  let fixtures = [];
  try { fixtures = await api(`/fixtures?league=${LEAGUE_ID}&season=${SEASON}`); }
  catch(e){ console.error("❌ Échec récupération fixtures:", e.message); process.exit(1); }
  console.log(`ℹ️ ${fixtures.length} fixtures API-Football récupérées (league=${LEAGUE_ID}, season=${SEASON}).`);

  const now = Date.now();
  const out = readJson(OUT, { lastUpdated:null, data:{} });
  if(!out.data) out.data = {};
  let updated = 0;

  for(const fx of fixtures){
    const homeName = fx.teams?.home?.name, awayName = fx.teams?.away?.name;
    const fxId = fx.fixture?.id;
    const fxKo = new Date(fx.fixture?.date).getTime();
    if(!fxId || !homeName || !awayName) continue;

    // Rapprochement avec un match de l'app (date ±36h + noms)
    const cand = appMatches.find(m => {
      if(Math.abs(m.ko - fxKo) > 36*3600000) return false;
      const direct = codeMatchesName(m.t1, homeName) && codeMatchesName(m.t2, awayName);
      const swap   = codeMatchesName(m.t1, awayName) && codeMatchesName(m.t2, homeName);
      return direct || swap;
    });
    if(!cand) continue;

    // Fenêtre : seulement les matchs proches du coup d'envoi (sauf FORCE_ALL)
    if(!FORCE_ALL && !(now > fxKo - WINDOW_MS && now < fxKo + WINDOW_MS)) continue;

    // 2) Compos du match
    let lu = [];
    try { lu = await api(`/fixtures/lineups?fixture=${fxId}`); }
    catch(e){ console.warn(`⚠️ lineups KO fixture ${fxId}:`, e.message); continue; }
    if(!lu.length){ console.log(`… pas encore de compo pour ${homeName}-${awayName}`); continue; }

    // Associer entrée API home/away aux côtés home/away de l'app match
    const apiHome = lu.find(x => x.team?.name === homeName) || lu[0];
    const apiAway = lu.find(x => x.team?.name === awayName) || lu[1];
    // L'app affiche t1 (home) / t2 (away). On respecte l'ordre app.
    const t1IsApiHome = codeMatchesName(cand.t1, homeName);
    const homeEntry = t1IsApiHome ? apiHome : apiAway;
    const awayEntry = t1IsApiHome ? apiAway : apiHome;
    const H = parseSide(homeEntry), A = parseSide(awayEntry);

    out.data[String(cand.id)] = {
      fHome: H.formation, fAway: A.formation,
      cHome: H.coach, cAway: A.coach,
      home: { xi: H.xi, subs: H.subs },
      away: { xi: A.xi, subs: A.subs },
      ts: new Date().toISOString()
    };
    updated++;
    console.log(`✅ Compo enregistrée : match #${cand.id} ${homeName} vs ${awayName} (${H.xi.length}+${A.xi.length} joueurs)`);
  }

  out.lastUpdated = new Date().toISOString();
  fs.mkdirSync(DATA_DIR, { recursive:true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`💾 lineups.json écrit — ${updated} match(s) mis à jour, ${Object.keys(out.data).length} au total.`);
}

main().catch(e => { console.error("❌", e); process.exit(1); });
