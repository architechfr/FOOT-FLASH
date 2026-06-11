#!/usr/bin/env node
/**
 * fetch-livescores.mjs — Scores du Mondial via football-data.org (gratuit).
 * Écrit app/src/main/assets/data/livescores.json :
 *   { lastUpdated, data: { "<idMatchApp>": { s1, s2, status, minute } } }
 *
 * La clé n'est JAMAIS dans l'app : lue ici via FOOTBALLDATA_KEY (secret GitHub).
 * 1 requête par exécution (/competitions/WC/matches renvoie tout).
 *
 * Usage : FOOTBALLDATA_KEY=xxxxx node scripts/fetch-livescores.mjs
 * Options env : COMP (défaut WC)
 */
import fs from "node:fs";
import path from "node:path";

const KEY = process.env.FOOTBALLDATA_KEY;
if(!KEY){ console.error("❌ FOOTBALLDATA_KEY manquante (secret)."); process.exit(1); }
const COMP = process.env.COMP || "WC";
const API = "https://api.football-data.org/v4/competitions/" + COMP + "/matches";

const DATA_DIR = path.join(process.cwd(), "app", "src", "main", "assets", "data");
const OUT = path.join(DATA_DIR, "livescores.json");

const norm = s => String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"")
  .replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();

// Codes app → alias de noms (football-data renvoie des noms anglais + un code "tla")
const TEAM_ALIASES = {
  MEX:["mexico"],KOR:["south korea","korea republic","korea"],RSA:["south africa"],
  CZE:["czech republic","czechia"],BRA:["brazil"],MAR:["morocco"],GER:["germany"],
  NED:["netherlands","holland"],JPN:["japan"],BEL:["belgium"],ESP:["spain"],URU:["uruguay"],
  FRA:["france"],NOR:["norway"],SEN:["senegal"],ARG:["argentina"],POR:["portugal"],CRO:["croatia"],
  ENG:["england"],USA:["united states","usa"],CAN:["canada"],BIH:["bosnia and herzegovina","bosnia"],
  QAT:["qatar"],SUI:["switzerland"],HAI:["haiti"],SCO:["scotland"],PAR:["paraguay"],AUS:["australia"],
  TUR:["turkey","turkiye"],CIV:["ivory coast","cote d ivoire"],ECU:["ecuador"],CUR:["curacao"],
  SWE:["sweden"],TUN:["tunisia"],IRN:["iran"],NZL:["new zealand"],EGY:["egypt"],KSA:["saudi arabia"],
  CPV:["cape verde","cabo verde"],IRQ:["iraq"],AUT:["austria"],JOR:["jordan"],ALG:["algeria"],
  UZB:["uzbekistan"],COL:["colombia"],COD:["dr congo","congo dr","democratic republic of congo","congo"],
  GHA:["ghana"],PAN:["panama"]
};
function matchTeam(code, fdName, fdTla){
  if(fdTla && String(fdTla).toUpperCase()===String(code).toUpperCase()) return true;
  var n = norm(fdName);
  var aliases = (TEAM_ALIASES[code]||[code]).map(norm);
  return aliases.some(a => n===a || n.includes(a) || a.includes(n));
}

function readJson(p, fb){ try{ return JSON.parse(fs.readFileSync(p,"utf8")); }catch(e){ return fb; } }

function loadAppMatches(){
  var mt = readJson(path.join(DATA_DIR,"matches.json"), {data:[]});
  var arr = Array.isArray(mt.data)?mt.data:(Array.isArray(mt)?mt:[]);
  return arr.filter(m => m && m.id && m.t1 && m.t2 && m.t1!=="TBD" && m.t2!=="TBD")
            .map(m => ({ id:m.id, t1:m.t1, t2:m.t2, ko:new Date(m.utc||m.d).getTime() }));
}

async function main(){
  const appMatches = loadAppMatches();
  let payload;
  try {
    const r = await fetch(API, { headers: { "X-Auth-Token": KEY } });
    if(!r.ok){ console.error("❌ football-data", r.status, await r.text().catch(()=> "")); process.exit(1); }
    payload = await r.json();
  } catch(e){ console.error("❌ requête KO:", e.message); process.exit(1); }

  const fixtures = payload.matches || [];
  console.log("ℹ️ "+fixtures.length+" matchs "+COMP+" renvoyés par football-data.org (1 requête).");
  if(!fixtures.length){ console.warn("⚠️ 0 match — la compétition "+COMP+" est peut-être hors de ton offre gratuite, ou pas encore peuplée."); }

  // Diagnostic auto-publié : compte des statuts + saison renvoyée par l'API.
  // Pas de timestamp ici → le fichier ne change (et n'est commité) que si la situation change.
  const statusCounts = {};
  for(const fx of fixtures){ const s = String(fx.status||"?").toUpperCase(); statusCounts[s] = (statusCounts[s]||0)+1; }
  const meta = {
    fixtures: fixtures.length,
    season: (payload.filters && payload.filters.season) || (fixtures[0] && fixtures[0].season && fixtures[0].season.startDate) || null,
    statuses: statusCounts,
    firstUtc: fixtures.length ? fixtures.reduce((a,b)=> a.utcDate < b.utcDate ? a : b).utcDate : null,
    lastUtc:  fixtures.length ? fixtures.reduce((a,b)=> a.utcDate > b.utcDate ? a : b).utcDate : null
  };

  const out = readJson(OUT, { lastUpdated:null, data:{} });
  if(!out.data) out.data = {};
  let changed = false, live = 0, fin = 0;
  if(JSON.stringify(out.meta||null) !== JSON.stringify(meta)){ out.meta = meta; changed = true; }

  // Calendrier de référence (autocontrôle) : id app ↔ utcDate football-data.
  // Écrit une seule fois par changement → schedule-fd.json, comparé hors-ligne
  // avec matches.json et openfootball pour repérer les horaires erronés.
  try {
    const SCHED = path.join(DATA_DIR, "schedule-fd.json");
    const sched = {};
    for(const fx of fixtures){
      const ko = new Date(fx.utcDate).getTime();
      const hN = fx.homeTeam && (fx.homeTeam.name||fx.homeTeam.shortName);
      const aN = fx.awayTeam && (fx.awayTeam.name||fx.awayTeam.shortName);
      const hTla = fx.homeTeam && fx.homeTeam.tla, aTla = fx.awayTeam && fx.awayTeam.tla;
      const m = appMatches.find(m => {
        if(Math.abs(m.ko - ko) > 36*3600000) return false;
        return (matchTeam(m.t1,hN,hTla)&&matchTeam(m.t2,aN,aTla)) || (matchTeam(m.t1,aN,aTla)&&matchTeam(m.t2,hN,hTla));
      });
      const key = m ? String(m.id) : ("fd-"+fx.id);
      sched[key] = { utc: fx.utcDate, home: hN, away: aN, stage: fx.stage||null };
    }
    const prevSched = readJson(SCHED, null);
    const next = { source:"football-data.org", data: sched };
    if(JSON.stringify(prevSched && prevSched.data || null) !== JSON.stringify(sched)){
      fs.writeFileSync(SCHED, JSON.stringify(next, null, 1));
      console.log("📅 schedule-fd.json mis à jour ("+Object.keys(sched).length+" matchs).");
    }
  } catch(e){ console.warn("schedule-fd:", e.message); }

  // Position football-data → poste app (G/D/M/F)
  const posMap = p => { p = String(p||"").toLowerCase();
    if(p.includes("keeper")) return "G";
    if(p.includes("back")||p.includes("defen")) return "D";
    if(p.includes("midfield")) return "M";
    if(p.includes("offence")||p.includes("forward")||p.includes("winger")||p.includes("striker")) return "F";
    return "M"; };

  for(const fx of fixtures){
    const st = String(fx.status||"").toUpperCase();
    const isLive = st==="IN_PLAY" || st==="PAUSED";
    const isFin  = st==="FINISHED" || st==="AWARDED";
    if(!isLive && !isFin) continue; // SCHEDULED/TIMED/… → rien à publier

    const ko = new Date(fx.utcDate).getTime();
    const hN = fx.homeTeam && (fx.homeTeam.name||fx.homeTeam.shortName);
    const aN = fx.awayTeam && (fx.awayTeam.name||fx.awayTeam.shortName);
    const hTla = fx.homeTeam && fx.homeTeam.tla, aTla = fx.awayTeam && fx.awayTeam.tla;

    const m = appMatches.find(m => {
      if(Math.abs(m.ko - ko) > 36*3600000) return false;
      return (matchTeam(m.t1,hN,hTla)&&matchTeam(m.t2,aN,aTla)) || (matchTeam(m.t1,aN,aTla)&&matchTeam(m.t2,hN,hTla));
    });
    if(!m) continue;

    const t1IsHome = matchTeam(m.t1, hN, hTla);
    const sc = (fx.score && fx.score.fullTime) || {};
    const gh = (sc.home==null)?null:sc.home, ga = (sc.away==null)?null:sc.away;
    const s1 = t1IsHome ? gh : ga, s2 = t1IsHome ? ga : gh;
    const status = isFin ? "FINISHED" : (st==="PAUSED" ? "HT" : "IN_PLAY");
    const entry = { s1:s1, s2:s2, status:status, minute:(fx.minute!=null)?String(fx.minute):null };

    // Score à la mi-temps (déjà dans la liste, aucune requête en plus)
    const htSc = fx.score && fx.score.halfTime;
    if(htSc && htSc.home!=null) entry.ht = t1IsHome ? [htSc.home,htSc.away] : [htSc.away,htSc.home];

    // ── Détail du match (1 requête) : buteurs, cartons, minute, arbitre, compos ──
    // Uniquement matchs en cours ou terminés depuis < 4 h (puis l'entrée est figée).
    const recentFin = isFin && (Date.now() - ko < 4*3600000);
    if(isLive || recentFin){
      try{
        const r = await fetch("https://api.football-data.org/v4/matches/"+fx.id, { headers:{ "X-Auth-Token": KEY } });
        if(r.ok){
          const det = await r.json();
          const dHomeId = det.homeTeam && det.homeTeam.id;
          const sideOf = team => (team && team.id===dHomeId) ? (t1IsHome?1:2) : (t1IsHome?2:1);
          if(det.minute!=null) entry.minute = String(det.minute);
          if(Array.isArray(det.goals) && det.goals.length){
            entry.goals = det.goals.map(g => ({
              m: g.minute, t: sideOf(g.team), n: (g.scorer&&g.scorer.name)||"?",
              type: (g.type==="PENALTY")?"P":(g.type==="OWN")?"CSC":null,
              a: (g.assist&&g.assist.name)||null
            }));
          }
          if(Array.isArray(det.bookings) && det.bookings.length){
            entry.cards = det.bookings.map(b => ({
              m: b.minute, t: sideOf(b.team), n: (b.player&&b.player.name)||"?",
              c: String(b.card||"").indexOf("RED")>=0?"R":"Y"
            }));
          }
          if(Array.isArray(det.referees) && det.referees.length) entry.ref = det.referees[0].name;
          // Compositions si le plan les expose → lineups.json (même format que l'app)
          const hl = det.homeTeam && det.homeTeam.lineup, al = det.awayTeam && det.awayTeam.lineup;
          if(hl && hl.length >= 11 && al && al.length >= 11){
            try{
              const LUP = path.join(DATA_DIR, "lineups.json");
              const lu = readJson(LUP, { lastUpdated:null, data:{} });
              if(!lu.data) lu.data = {};
              const cur = lu.data[String(m.id)];
              if(!cur || !cur.home || (cur.home.xi||[]).length < 11){
                const mp = p => ({ n:p.name, num:p.shirtNumber||null, pos:posMap(p.position) });
                const homeSide = { xi:hl.map(mp), subs:(det.homeTeam.bench||[]).map(mp) };
                const awaySide = { xi:al.map(mp), subs:(det.awayTeam.bench||[]).map(mp) };
                lu.data[String(m.id)] = {
                  home: t1IsHome?homeSide:awaySide, away: t1IsHome?awaySide:homeSide,
                  fHome: t1IsHome?det.homeTeam.formation:det.awayTeam.formation,
                  fAway: t1IsHome?det.awayTeam.formation:det.homeTeam.formation,
                  cHome: t1IsHome?(det.homeTeam.coach&&det.homeTeam.coach.name):(det.awayTeam.coach&&det.awayTeam.coach.name),
                  cAway: t1IsHome?(det.awayTeam.coach&&det.awayTeam.coach.name):(det.homeTeam.coach&&det.homeTeam.coach.name),
                  ts: new Date().toISOString()
                };
                lu.lastUpdated = new Date().toISOString();
                fs.writeFileSync(LUP, JSON.stringify(lu, null, 1));
                console.log("📋 compos #"+m.id+" via football-data ("+hl.length+"+"+al.length+").");
              }
            }catch(e){ console.warn("lineups fd:", e.message); }
          }
        } else { console.warn("détail "+fx.id+" → HTTP "+r.status); }
      }catch(e){ console.warn("détail "+fx.id+":", e.message); }
    }

    const prev = out.data[String(m.id)] || {};
    // Préserve les enrichissements posés par fetch-lineups.mjs (API-Football) :
    // si cette source-ci ne fournit pas le champ, on garde la valeur existante.
    for(const k of ["goals","cards","minute","ht","ref"]){
      if(entry[k]==null && prev[k]!=null) entry[k] = prev[k];
    }
    if(JSON.stringify(prev) !== JSON.stringify(entry)){
      out.data[String(m.id)] = entry;
      changed = true;
      console.log((isFin?"🏁":"🔴")+" #"+m.id+" "+hN+" "+gh+"-"+ga+" "+aN+" ("+status+(entry.minute?" "+entry.minute+"'":"")+(entry.goals?" · "+entry.goals.length+" but(s)":"")+")");
    }
    if(isLive) live++; else fin++;
  }

  // ── openfootball/worldcup.json : filet de sécurité RÉSULTATS (sans clé, sans quota) ──
  // Source communautaire fiable (a servi à valider le calendrier). Les scores y sont
  // ajoutés après les matchs : on complète ce que football-data n'aurait pas publié,
  // et on signale tout conflit entre les deux sources dans meta.ofConflicts.
  try{
    const r = await fetch("https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json");
    if(r.ok){
      const ofj = await r.json();
      let filled = 0; const conflicts = [];
      for(const x of (ofj.matches||[])){
        const n1 = (typeof x.team1==="string") ? x.team1 : (x.team1 && (x.team1.name||x.team1.code));
        const n2 = (typeof x.team2==="string") ? x.team2 : (x.team2 && (x.team2.name||x.team2.code));
        const a = (x.score1!=null) ? x.score1 : (x.score && x.score.ft && x.score.ft[0]!=null ? x.score.ft[0] : null);
        const b = (x.score2!=null) ? x.score2 : (x.score && x.score.ft && x.score.ft[1]!=null ? x.score.ft[1] : null);
        if(a==null || b==null || !n1 || !n2) continue;
        const t = new Date((x.date||"")+"T12:00:00Z").getTime();
        if(isNaN(t)) continue;
        const m = appMatches.find(m => Math.abs(m.ko - t) < 36*3600000 &&
          ((matchTeam(m.t1,n1)&&matchTeam(m.t2,n2)) || (matchTeam(m.t1,n2)&&matchTeam(m.t2,n1))));
        if(!m) continue;
        const t1Home = matchTeam(m.t1, n1);
        const s1 = t1Home ? a : b, s2 = t1Home ? b : a;
        const cur = out.data[String(m.id)];
        if(!cur || cur.s1==null){
          out.data[String(m.id)] = Object.assign({}, cur||{}, { s1:s1, s2:s2, status:"FINISHED", src:"openfootball" });
          changed = true; filled++;
        } else if(cur.status==="FINISHED" && (cur.s1!==s1 || cur.s2!==s2)){
          conflicts.push("#"+m.id+" fd="+cur.s1+"-"+cur.s2+" of="+s1+"-"+s2);
        }
      }
      if(filled) console.log("🟢 openfootball : "+filled+" résultat(s) complété(s).");
      if(conflicts.length){
        console.warn("⚠️ Conflits football-data / openfootball : "+conflicts.join(" ; "));
        if(JSON.stringify(out.meta.ofConflicts||null) !== JSON.stringify(conflicts)){ out.meta.ofConflicts = conflicts; changed = true; }
      }
    }
  }catch(e){ console.warn("openfootball:", e.message); }

  console.log("→ "+live+" en direct, "+fin+" terminé(s) rapprochés à des matchs de l'app.");
  if(!changed){ console.log("↔️ Aucun changement → pas de commit."); return; }
  out.lastUpdated = new Date().toISOString();
  fs.mkdirSync(DATA_DIR, { recursive:true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log("💾 livescores.json mis à jour.");
}
main().catch(e => { console.error("❌", e); process.exit(1); });
