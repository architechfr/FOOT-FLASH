#!/usr/bin/env node
/**
 * fetch-lineups.mjs — Compositions officielles via API-Football (api-sports.io).
 * Écrit app/src/main/assets/data/lineups.json au format attendu par l'app :
 *   { lastUpdated, data: { "<idMatchApp>": {
 *       home:{xi:[{n,num,pos}],subs:[…]}, away:{…},
 *       fHome, fAway, cHome, cAway, ts } } }
 *
 * Clé : secret GitHub APIFOOTBALL_KEY (plan gratuit = 100 requêtes/jour).
 * Économie de quota :
 *   - aucune requête si aucun match dans sa fenêtre [KO-75 min → KO+30 min] ;
 *   - 1 requête fixtures/jour (mapping id app ↔ id API-Football, mis en cache) ;
 *   - 1 requête lineup par match en attente, au plus toutes les 12 min,
 *     et plus aucune dès que le XI complet (11 joueurs) est enregistré.
 *
 * Usage : APIFOOTBALL_KEY=xxxx node scripts/fetch-lineups.mjs
 */
import fs from "node:fs";
import path from "node:path";

const KEY = process.env.APIFOOTBALL_KEY;
if(!KEY){ console.log("ℹ️ APIFOOTBALL_KEY absente → compos désactivées (étape facultative)."); process.exit(0); }

const API = "https://v3.football.api-sports.io";
const LEAGUE = process.env.AF_LEAGUE || "1";     // 1 = FIFA World Cup
const SEASON = process.env.AF_SEASON || "2026";

const DATA_DIR = path.join(process.cwd(), "app", "src", "main", "assets", "data");
const OUT = path.join(DATA_DIR, "lineups.json");
const WIN_BEFORE = 75*60000, WIN_AFTER = 30*60000, RETRY_MS = 12*60000;

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
// API-Football pos → app pos (G/D/M/F, l'app comprend ces 4 lettres)
const mapPlayer = p => ({ n: p.player.name, num: p.player.number||null, pos: (p.player.pos||"M").toUpperCase() });

async function main(){
  const mt = readJson(path.join(DATA_DIR,"matches.json"), {data:[]});
  const all = (mt.data||[]).filter(m => m && m.id && m.t1!=="TBD" && m.t2!=="TBD");
  const now = Date.now();
  const out = readJson(OUT, { lastUpdated:null, data:{} });
  if(!out.data) out.data = {};
  out._meta = out._meta || { fixtures:{}, tried:{} };

  // Matchs dans la fenêtre, sans XI complet déjà stocké, pas retentés depuis 12 min
  const pending = all.filter(m => {
    const ko = new Date(m.utc||m.d).getTime();
    if(!(now > ko - WIN_BEFORE && now < ko + WIN_AFTER)) return false;
    const cur = out.data[String(m.id)];
    if(cur && cur.home && (cur.home.xi||[]).length >= 11 && cur.away && (cur.away.xi||[]).length >= 11) return false;
    const tried = out._meta.tried[String(m.id)];
    return !(tried && now - new Date(tried).getTime() < RETRY_MS);
  });
  if(!pending.length){ console.log("↔️ Aucune compo à chercher (fenêtre/déjà complètes)."); return; }

  // Mapping id app ↔ fixture API-Football (1 requête / jour, mise en cache)
  const day = new Date().toISOString().slice(0,10);
  if(out._meta.fixturesDay !== day){
    const fxs = await af("/fixtures?league="+LEAGUE+"&season="+SEASON+"&date="+day);
    out._meta.fixtures = {}; out._meta.fixturesDay = day;
    for(const fx of fxs){
      const m = all.find(m => {
        const ko = new Date(m.utc||m.d).getTime();
        if(Math.abs(ko - new Date(fx.fixture.date).getTime()) > 6*3600000) return false;
        return (teamIs(m.t1,fx.teams.home.name)&&teamIs(m.t2,fx.teams.away.name))
            || (teamIs(m.t1,fx.teams.away.name)&&teamIs(m.t2,fx.teams.home.name));
      });
      if(m) out._meta.fixtures[String(m.id)] = { af: fx.fixture.id, homeIsT1: teamIs(m.t1, fx.teams.home.name) };
    }
    console.log("📅 Mapping fixtures du "+day+" : "+Object.keys(out._meta.fixtures).length+" match(s).");
  }

  let changed = false;
  for(const m of pending){
    const map = out._meta.fixtures[String(m.id)];
    out._meta.tried[String(m.id)] = new Date(now).toISOString();
    if(!map){ console.log("⚠️ id "+m.id+" sans fixture API-Football."); changed = true; continue; }
    const sides = await af("/fixtures/lineups?fixture="+map.af);
    if(sides.length < 2){ console.log("⏳ id "+m.id+" : compos pas encore publiées."); changed = true; continue; }
    // sides[i].team.name → rattacher au bon côté de l'app (t1 = home app)
    const sideFor = code => sides.find(s => teamIs(code, s.team.name));
    const s1 = sideFor(m.t1), s2 = sideFor(m.t2);
    if(!s1 || !s2){ console.log("⚠️ id "+m.id+" : équipes non reconnues ("+sides.map(s=>s.team.name).join(" / ")+")."); changed = true; continue; }
    out.data[String(m.id)] = {
      home: { xi:(s1.startXI||[]).map(mapPlayer), subs:(s1.substitutes||[]).map(mapPlayer) },
      away: { xi:(s2.startXI||[]).map(mapPlayer), subs:(s2.substitutes||[]).map(mapPlayer) },
      fHome: s1.formation||null, fAway: s2.formation||null,
      cHome: (s1.coach&&s1.coach.name)||null, cAway: (s2.coach&&s2.coach.name)||null,
      ts: new Date(now).toISOString()
    };
    changed = true;
    console.log("📋 id "+m.id+" "+m.t1+"-"+m.t2+" : XI "+out.data[String(m.id)].home.xi.length+"+"+out.data[String(m.id)].away.xi.length+" ("+(s1.formation||"?")+" vs "+(s2.formation||"?")+").");
  }
  if(changed){
    out.lastUpdated = new Date(now).toISOString();
    fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
    console.log("💾 lineups.json mis à jour.");
  }
}
main().catch(e => { console.error("❌", e.message); process.exit(0); }); // jamais bloquant pour le workflow
