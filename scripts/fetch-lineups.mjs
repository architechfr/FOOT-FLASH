#!/usr/bin/env node
/**
 * fetch-lineups.mjs — Compos + événements live via API-Football (api-sports.io).
 *
 * UN SEUL appel /fixtures?ids=… par passage (la réponse embarque lineups,
 * events, minute et score) pour tous les matchs dans leur fenêtre
 * [KO-75 min → KO+150 min]. Écrit :
 *   - lineups.json    : XI/banc/formation/coach (format app)
 *   - livescores.json : goals/cards/minute fusionnés dans l'entrée du match
 *     (fetch-livescores.mjs préserve ces champs s'il ne les fournit pas lui-même)
 *
 * Quota (plan gratuit 100 req/jour) : throttle global 7 min + 1 requête
 * fixtures/jour pour le mapping id app ↔ id API-Football. Hors fenêtre : 0 appel.
 *
 * Clé : secret GitHub APIFOOTBALL_KEY. Sans clé → sortie silencieuse.
 */
import fs from "node:fs";
import path from "node:path";

const KEY = process.env.APIFOOTBALL_KEY;
if(!KEY){ console.log("ℹ️ APIFOOTBALL_KEY absente → compos/événements désactivés (étape facultative)."); process.exit(0); }

const API = "https://v3.football.api-sports.io";
const LEAGUE = process.env.AF_LEAGUE || "1";     // 1 = FIFA World Cup
const SEASON = process.env.AF_SEASON || "2026";

const DATA_DIR = path.join(process.cwd(), "app", "src", "main", "assets", "data");
const LUP = path.join(DATA_DIR, "lineups.json");
const LSC = path.join(DATA_DIR, "livescores.json");
const WIN_BEFORE = 75*60000, WIN_AFTER = 150*60000, THROTTLE_MS = 7*60000;

const norm = s => String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"")
  .replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
const TEAM_ALIASES = {
  MEX:["mexico"],KOR:["south korea","korea republic","korea"],RSA:["south africa"],
  CZE:["czech republic","czechia"],BRA:["brazil"],MAR:["morocco"],GER:["germany"],
  NED:["netherlands","holland"],JPN:["japan"],BEL:["belgium"],ESP:["spain"],URU:["uruguay"],
  FRA:["france"],NOR:["norway"],SEN:["senegal"],ARG:["argentina"],POR:["portugal"],CRO:["croatia"],
  ENG:["england"],USA:["usa","united states"],CAN:["canada"],BIH:["bosnia and herzegovina","bosnia"],
  QAT:["qatar"],SUI:["switzerland"],HAI:["haiti"],SCO:["scotland"],PAR:["paraguay"],AUS:["australia"],
  TUR:["turkey","turkiye"],CIV:["ivory coast","cote d ivoire"],ECU:["ecuador"],CUR:["curacao"],
  SWE:["sweden"],TUN:["tunisia"],IRN:["iran"],NZL:["new zealand"],EGY:["egypt"],KSA:["saudi arabia"],
  CPV:["cape verde","cabo verde"],IRQ:["iraq"],AUT:["austria"],JOR:["jordan"],ALG:["algeria"],
  UZB:["uzbekistan"],COL:["colombia"],COD:["dr congo","congo dr","democratic republic of congo","congo"],
  GHA:["ghana"],PAN:["panama"]
};
function teamIs(code, name){
  const n = norm(name);
  return (TEAM_ALIASES[code]||[code]).map(norm).some(a => n===a || n.includes(a) || a.includes(n));
}
function readJson(p, fb){ try{ return JSON.parse(fs.readFileSync(p,"utf8")); }catch(e){ return fb; } }
async function af(pathname){
  const r = await fetch(API+pathname, { headers: { "x-apisports-key": KEY } });
  if(!r.ok) throw new Error("API-Football "+r.status);
  const j = await r.json();
  if(j.errors && Object.keys(j.errors).length) throw new Error("API-Football: "+JSON.stringify(j.errors));
  return j.response || [];
}
const mapPlayer = p => ({ n: p.player.name, num: p.player.number||null, pos: (p.player.pos||"M").toUpperCase() });

async function main(){
  const mt = readJson(path.join(DATA_DIR,"matches.json"), {data:[]});
  const all = (mt.data||[]).filter(m => m && m.id && m.t1!=="TBD" && m.t2!=="TBD");
  const now = Date.now();
  const lu = readJson(LUP, { lastUpdated:null, data:{} });
  if(!lu.data) lu.data = {};
  lu._meta = lu._meta || {};

  // Matchs dans la fenêtre utile
  const windowM = all.filter(m => {
    const ko = new Date(m.utc||m.d).getTime();
    return now > ko - WIN_BEFORE && now < ko + WIN_AFTER;
  });
  if(!windowM.length){ console.log("↔️ API-Football : aucun match en fenêtre."); return; }

  // Throttle global (7 min) — la boucle du workflow repasse toutes les ~3 min
  if(lu._meta.lastCall && now - new Date(lu._meta.lastCall).getTime() < THROTTLE_MS){
    console.log("⏳ API-Football : throttle (dernier appel < 7 min)."); return;
  }

  // Mapping id app ↔ fixture API-Football (1 requête / jour)
  const day = new Date().toISOString().slice(0,10);
  if(lu._meta.fixturesDay !== day){
    const fxs = await af("/fixtures?league="+LEAGUE+"&season="+SEASON+"&date="+day);
    lu._meta.fixtures = {}; lu._meta.fixturesDay = day;
    for(const fx of fxs){
      const m = all.find(m => {
        const ko = new Date(m.utc||m.d).getTime();
        if(Math.abs(ko - new Date(fx.fixture.date).getTime()) > 6*3600000) return false;
        return (teamIs(m.t1,fx.teams.home.name)&&teamIs(m.t2,fx.teams.away.name))
            || (teamIs(m.t1,fx.teams.away.name)&&teamIs(m.t2,fx.teams.home.name));
      });
      if(m) lu._meta.fixtures[String(m.id)] = fx.fixture.id;
    }
    console.log("📅 Mapping fixtures du "+day+" : "+Object.keys(lu._meta.fixtures).length+" match(s).");
  }

  const ids = windowM.map(m => lu._meta.fixtures[String(m.id)]).filter(Boolean);
  if(!ids.length){
    lu._meta.lastCall = new Date(now).toISOString();
    fs.writeFileSync(LUP, JSON.stringify(lu, null, 1));
    console.log("⚠️ Aucun id API-Football pour les matchs en fenêtre."); return;
  }

  // L'appel magique : lineups + events + minute + score dans une seule réponse
  const resp = await af("/fixtures?ids="+ids.join("-"));
  lu._meta.lastCall = new Date(now).toISOString();

  const lsc = readJson(LSC, { lastUpdated:null, data:{} });
  if(!lsc.data) lsc.data = {};
  let luChanged = true, lscChanged = false; // _meta.lastCall a déjà changé lu

  for(const fx of resp){
    const appId = Object.keys(lu._meta.fixtures).find(k => lu._meta.fixtures[k]===fx.fixture.id);
    if(!appId) continue;
    const m = all.find(x => String(x.id)===appId);
    if(!m) continue;
    const sideOf = name => teamIs(m.t1, name) ? 1 : 2;

    // ── Compositions (publiées ~40 min avant le KO) ──
    const L = fx.lineups || [];
    if(L.length >= 2){
      const cur = lu.data[appId];
      if(!cur || !cur.home || (cur.home.xi||[]).length < 11){
        const s1 = L.find(s => teamIs(m.t1, s.team.name)), s2 = L.find(s => teamIs(m.t2, s.team.name));
        if(s1 && s2 && (s1.startXI||[]).length >= 11){
          lu.data[appId] = {
            home: { xi:s1.startXI.map(mapPlayer), subs:(s1.substitutes||[]).map(mapPlayer) },
            away: { xi:s2.startXI.map(mapPlayer), subs:(s2.substitutes||[]).map(mapPlayer) },
            fHome: s1.formation||null, fAway: s2.formation||null,
            cHome: (s1.coach&&s1.coach.name)||null, cAway: (s2.coach&&s2.coach.name)||null,
            ts: new Date(now).toISOString()
          };
          console.log("📋 #"+appId+" "+m.t1+"-"+m.t2+" : compos "+s1.formation+" vs "+s2.formation+".");
        }
      }
    }

    // ── Événements live : buts + cartons + minute ──
    const evs = fx.events || [];
    const entry = lsc.data[appId] || {};
    const goals = evs.filter(e => e.type==="Goal" && e.detail!=="Missed Penalty").map(e => ({
      m: (e.time&&e.time.elapsed)||0, t: sideOf(e.team&&e.team.name), n: (e.player&&e.player.name)||"?",
      type: e.detail==="Penalty"?"P":(e.detail==="Own Goal"?"CSC":null),
      a: (e.assist&&e.assist.name)||null
    }));
    const cards = evs.filter(e => e.type==="Card").map(e => ({
      m: (e.time&&e.time.elapsed)||0, t: sideOf(e.team&&e.team.name), n: (e.player&&e.player.name)||"?",
      c: String(e.detail||"").indexOf("Red")>=0?"R":"Y"
    }));
    const minute = (fx.fixture.status && fx.fixture.status.elapsed!=null) ? String(fx.fixture.status.elapsed) : null;
    const before = JSON.stringify([entry.goals, entry.cards, entry.minute]);
    if(goals.length) entry.goals = goals;
    if(cards.length) entry.cards = cards;
    if(minute!=null) entry.minute = minute;
    // score de secours si football-data n'a encore rien publié
    if(entry.s1==null && fx.goals && fx.goals.home!=null){
      entry.s1 = sideOf(fx.teams.home.name)===1 ? fx.goals.home : fx.goals.away;
      entry.s2 = sideOf(fx.teams.home.name)===1 ? fx.goals.away : fx.goals.home;
      entry.status = entry.status || "IN_PLAY";
    }
    if(JSON.stringify([entry.goals, entry.cards, entry.minute]) !== before){
      lsc.data[appId] = entry; lscChanged = true;
      console.log("⚽ #"+appId+" : "+goals.length+" but(s), "+cards.length+" carton(s), "+(minute||"?")+"'.");
    }
  }

  if(luChanged){ lu.lastUpdated = new Date(now).toISOString(); fs.writeFileSync(LUP, JSON.stringify(lu, null, 1)); }
  if(lscChanged){ lsc.lastUpdated = new Date(now).toISOString(); fs.writeFileSync(LSC, JSON.stringify(lsc, null, 2)); console.log("💾 livescores.json enrichi (événements)."); }
}
main().catch(e => { console.error("❌", e.message); process.exit(0); }); // jamais bloquant
