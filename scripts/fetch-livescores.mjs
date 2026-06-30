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
  if(!n) return false; // nom vide (KO sans équipe encore assignée) → AUCUNE correspondance
                       // (sinon a.includes("") renvoyait true et matchait n'importe quelle équipe)
  var aliases = (TEAM_ALIASES[code]||[code]).map(norm);
  return aliases.some(a => n===a || n.includes(a) || a.includes(n));
}

function readJson(p, fb){ try{ return JSON.parse(fs.readFileSync(p,"utf8")); }catch(e){ return fb; } }

// ── Score "du jeu" + tirs au but + prolongation, à partir du node score de
// football-data.org. ATTENTION : score.fullTime ADDITIONNE la séance de tirs au
// but au score du jeu (ex. EC96 Allemagne 7-6 = 1-1 a.p. + t.a.b. 6-5). On isole
// donc : play = score à la fin du jeu (90'/120', SANS t.a.b.) ; pen = la séance ;
// dur = "AET" (prolongation, sans t.a.b.) ou "PEN" (tirs au but) ou null.
// Réf. : https://docs.football-data.org/general/v4/overtime.html
// Exporté pour test unitaire (scripts/test-scores.mjs).
export function splitScore(score){
  const sc = score || {};
  const ft = sc.fullTime || {};
  const dur = String(sc.duration||"REGULAR").toUpperCase();
  let h = (ft.home==null)?null:ft.home, a = (ft.away==null)?null:ft.away;
  let penH=null, penA=null, tag=null;
  if(dur==="PENALTY_SHOOTOUT"){
    const p = sc.penalties || {};
    penH = (p.home==null)?null:p.home; penA = (p.away==null)?null:p.away;
    // score du jeu = fullTime − tirs au but (repli : regularTime + extraTime)
    if(penH!=null && h!=null) h -= penH;
    if(penA!=null && a!=null) a -= penA;
    if((h==null || a==null) && sc.regularTime){
      const rt = sc.regularTime, et = sc.extraTime || {home:0,away:0};
      h = (rt.home||0)+(et.home||0); a = (rt.away||0)+(et.away||0);
    }
    tag = "PEN";
  } else if(dur==="EXTRA_TIME"){
    tag = "AET"; // fullTime = score réel (prolongation incluse, pas de t.a.b.)
  }
  return { h:h, a:a, penH:penH, penA:penA, dur:tag };
}

function loadAppMatches(){
  var mt = readJson(path.join(DATA_DIR,"matches.json"), {data:[]});
  var arr = Array.isArray(mt.data)?mt.data:(Array.isArray(mt)?mt:[]);
  return arr.filter(m => m && m.id && m.t1 && m.t2 && m.t1!=="TBD" && m.t2!=="TBD")
            .map(m => ({ id:m.id, t1:m.t1, t2:m.t2, ko:new Date(m.utc||m.d).getTime() }));
}

async function main(){
  if(!KEY){ console.error("❌ FOOTBALLDATA_KEY manquante (secret)."); process.exit(1); }
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

  // ═══════════════════════════════════════════════════════════
  // Tableau KO (16e→finale) piloté par football-data — mappé par HEURE UTC.
  // Les équipes des KO sont "TBD" côté app : le rapprochement par nom est
  // impossible. On relie chaque match KO de l'app à sa fixture fd via l'heure
  // UTC (le créneau/stade est unique), puis on résout les vraies équipes
  // (1ers/2es ET 3es, déjà placés par la VRAIE table FIFA dans la source) en
  // s'appuyant sur les descripteurs t1from/t2from de matches.json pour
  // l'orientation t1/t2. Résultat → ko-bracket.json (lu par l'app) + injection
  // dans appMatches pour que scores/buteurs suivent via le pipeline existant.
  try {
    const CITY_OFFSET = { // heure d'été 2026 (US/CA en DST ; Mexique sans DST)
      "Los Angeles":-7,"Santa Clara":-7,"Seattle":-7,"Vancouver":-7,
      "Guadalajara":-6,"Mexico City":-6,"Monterrey":-6,
      "Arlington":-5,"Houston":-5,"Kansas City":-5,
      "Atlanta":-4,"Foxborough":-4,"East Rutherford":-4,"Philadelphia":-4,"Miami":-4,"Toronto":-4
    };
    const koUtc = (d, city) => {
      const off = CITY_OFFSET[city]; if(off==null || !d) return null;
      const iso = d + ":00" + (off<0?"-":"+") + String(Math.abs(off)).padStart(2,"0") + ":00";
      const t = new Date(iso).getTime(); return isNaN(t) ? null : t;
    };
    const mtRaw = readJson(path.join(DATA_DIR,"matches.json"), {data:[]});
    const allM = Array.isArray(mtRaw.data) ? mtRaw.data : [];
    // code app → groupe (depuis les matchs de poule, équipes connues)
    const grpOf = {};
    for(const m of allM){ const g=/^Groupe\s+([A-L])$/.exec(m.st||""); if(g){ grpOf[m.t1]=g[1]; grpOf[m.t2]=g[1]; } }
    // classement réel d'un groupe à partir des scores déjà publiés (out.data)
    const groupRank = g => {
      const ms = allM.filter(m => m.st==="Groupe "+g);
      const T = {}; ms.forEach(m => [m.t1,m.t2].forEach(t => { if(!T[t]) T[t]={id:t,pts:0,diff:0,gf:0}; }));
      let done = 0;
      for(const m of ms){ const e=out.data[String(m.id)]; if(!e||e.s1==null||e.s2==null) continue; done++;
        const a=m.t1,b=m.t2,x=e.s1,y=e.s2; T[a].gf+=x;T[b].gf+=y;T[a].diff+=x-y;T[b].diff+=y-x;
        if(x>y)T[a].pts+=3; else if(x<y)T[b].pts+=3; else {T[a].pts++;T[b].pts++;} }
      const order = Object.values(T).sort((p,q)=> q.pts-p.pts || q.diff-p.diff || q.gf-p.gf);
      return { complete: ms.length>0 && done===ms.length, W: order[0]&&order[0].id, R: order[1]&&order[1].id };
    };
    const GR = {}; "ABCDEFGHIJKL".split("").forEach(g => GR[g]=groupRank(g));
    const fdToCode = (name,tla) => { if(!name&&!tla) return null;
      for(const code of Object.keys(TEAM_ALIASES)) if(matchTeam(code,name,tla)) return code; return null; };
    const KO_ST = {LAST_32:1,LAST_16:1,QUARTER_FINALS:1,SEMI_FINALS:1,THIRD_PLACE:1,FINAL:1};
    const fdKO = fixtures.filter(fx => KO_ST[String(fx.stage||"").toUpperCase()]).map(fx => ({
      ko: new Date(fx.utcDate).getTime(),
      h: fdToCode(fx.homeTeam&&(fx.homeTeam.name||fx.homeTeam.shortName), fx.homeTeam&&fx.homeTeam.tla),
      a: fdToCode(fx.awayTeam&&(fx.awayTeam.name||fx.awayTeam.shortName), fx.awayTeam&&fx.awayTeam.tla)
    }));
    const appKO = allM.filter(m => m.id>=73 && m.t1from && m.t2from)
                      .map(m => ({ id:m.id, t1from:m.t1from, t2from:m.t2from, ko:koUtc(m.d, m.city) }))
                      .sort((p,q)=> p.id-q.id);
    const resolved = {}; // idApp -> {t1,t2}
    const winLose = (idApp, want) => { // 'W' | 'L' d'un match KO déjà résolu + scoré
      const r=resolved[idApp], e=out.data[String(idApp)];
      if(!r||!r.t1||!r.t2||!e||e.s1==null||e.s2==null) return null;
      let x=e.s1, y=e.s2;
      if(x===y){ // nul dans le jeu → départage aux tirs au but
        if(e.pen1!=null && e.pen2!=null && e.pen1!==e.pen2){ x=e.pen1; y=e.pen2; }
        else return null; // pas encore de séance connue
      }
      const w = x>y ? r.t1 : r.t2, l = x>y ? r.t2 : r.t1; return want==="W"?w:l;
    };
    const resolveTok = tok => {
      let m;
      if((m=/^(Winner|Runner-up)\s+([A-L])$/.exec(tok))){ const gr=GR[m[2]]; if(!gr||!gr.complete) return {grp:m[2]}; return {code: m[1]==="Winner"?gr.W:gr.R, grp:m[2]}; }
      if((m=/^Winner Match (\d+)$/.exec(tok))) return {code: winLose(+m[1],"W")};
      if((m=/^Loser Match (\d+)$/.exec(tok)))  return {code: winLose(+m[1],"L")};
      return {}; // "3rd ..." ou inconnu → côté à déduire par élimination
    };
    for(const k of appKO){
      if(k.ko==null) continue;
      const fx = fdKO.find(f => Math.abs(f.ko-k.ko) < 3*3600000);
      if(!fx) continue;
      const pair = [fx.h, fx.a].filter(Boolean);
      if(!pair.length) continue;
      const r1=resolveTok(k.t1from), r2=resolveTok(k.t2from);
      const pick = tok => {
        if(tok.code) return pair.indexOf(tok.code)>=0 ? tok.code : null;
        if(tok.grp){ for(const c of pair) if(grpOf[c]===tok.grp) return c; }
        return null;
      };
      let t1=pick(r1), t2=pick(r2);
      if(t1 && !t2) t2 = pair.find(c => c!==t1) || null;       // l'autre côté (souvent le 3e)
      else if(t2 && !t1) t1 = pair.find(c => c!==t2) || null;
      if(t1||t2) resolved[k.id] = { t1:t1||null, t2:t2||null };
    }
    // ko-bracket.json — FUSION : on ne perd jamais un appariement déjà résolu si
    // le flux renvoie temporairement des équipes vides (instabilité constatée de
    // football-data sur les tours KO). On n'ajoute/complète que des équipes connues.
    const KO_OUT = path.join(DATA_DIR, "ko-bracket.json");
    const prevKO = readJson(KO_OUT, null);
    const koData = Object.assign({}, (prevKO && prevKO.data) || {});
    for(const id of Object.keys(resolved)){ const r=resolved[id]; const cur=koData[id]||{};
      const t1=r.t1||cur.t1||null, t2=r.t2||cur.t2||null;
      if(t1||t2) koData[id]={t1:t1, t2:t2};
    }
    // Appariements KO CONFIRMÉS officiellement (sources + maths) mais que le flux
    // tarde parfois à (re)publier — bracket KO remis à zéro tant que les 12 groupes
    // ne sont pas finis. Inscrits ici en filet : ne régressent jamais. Le flux, dès
    // qu'il les fournit, donne le même résultat (priorité au flux s'il est présent).
    const KO_CONFIRMED = { "77": { t1:"FRA", t2:"SWE" } }; // France 1er I × Suède 3e F (30/06, MetLife)
    for(const id of Object.keys(KO_CONFIRMED)){ const c=KO_CONFIRMED[id], cur=koData[id]||{};
      koData[id] = { t1: cur.t1||c.t1||null, t2: cur.t2||c.t2||null };
    }
    if(JSON.stringify(prevKO && prevKO.data || null) !== JSON.stringify(koData)){
      fs.writeFileSync(KO_OUT, JSON.stringify({ source:"football-data.org (UTC-map)", lastUpdated:new Date().toISOString(), data:koData }, null, 1));
      console.log("🗺️ ko-bracket.json mis à jour ("+Object.keys(koData).length+" matchs KO).");
    }
    // injection des KO entièrement résolus → scores/buteurs via le pipeline existant
    for(const id of Object.keys(resolved)){ const r=resolved[id];
      if(r.t1 && r.t2 && !appMatches.find(m => m.id===+id)){
        const am = allM.find(m => m.id===+id);
        appMatches.push({ id:+id, t1:r.t1, t2:r.t2, ko: am ? koUtc(am.d, am.city) : null });
      }
    }
  } catch(e){ console.warn("ko-bracket:", e.message); }

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
    // Score du jeu (sans t.a.b.) + séance de t.a.b. + prolongation (cf. splitScore)
    const sp = splitScore(fx.score);
    const gh = sp.h, ga = sp.a;
    const s1 = t1IsHome ? gh : ga, s2 = t1IsHome ? ga : gh;
    const status = isFin ? "FINISHED" : (st==="PAUSED" ? "HT" : "IN_PLAY");
    const entry = { s1:s1, s2:s2, status:status, minute:(fx.minute!=null)?String(fx.minute):null };
    // Prolongation / tirs au but (matchs à élimination directe)
    if(sp.dur) entry.dur = sp.dur;
    if(sp.penH!=null && sp.penA!=null){
      entry.pen1 = t1IsHome ? sp.penH : sp.penA;
      entry.pen2 = t1IsHome ? sp.penA : sp.penH;
    }

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
    // Préserve les champs déjà connus quand la source ne les fournit pas :
    // enrichissements API-Football (goals/cards/minute…) ET score (football-data
    // renvoie parfois fullTime=null à l'instant de la bascule FINISHED — vu le
    // 11/06 sur MEX-RSA : le 2-0 avait été écrasé par null).
    for(const k of ["s1","s2","goals","cards","minute","ht","ref","dur","pen1","pen2"]){
      if(entry[k]==null && prev[k]!=null) entry[k] = prev[k];
    }
    if(JSON.stringify(prev) !== JSON.stringify(entry)){
      out.data[String(m.id)] = entry;
      changed = true;
      console.log((isFin?"🏁":"🔴")+" #"+m.id+" "+hN+" "+gh+"-"+ga+" "+aN+" ("+status+(entry.minute?" "+entry.minute+"'":"")+(entry.goals?" · "+entry.goals.length+" but(s)":"")+")");
    }
    if(isLive) live++; else fin++;
  }

  // ── TheSportsDB : complément RÉSULTATS (gratuit, clé publique "123") ──
  // Si un match est fini au chrono mais sans score publié (football-data en
  // retard — constaté la nuit du 11/06 —, openfootball pas encore à jour),
  // on tente eventsday : scores fiables au coup de sifflet final.
  try{
    const now = Date.now();
    const pendings = appMatches.filter(m => {
      const e = out.data[String(m.id)];
      return (!e || e.s1==null) && now > m.ko + 135*60000 && now < m.ko + 48*3600000;
    });
    const dates = new Set();
    pendings.forEach(m => {
      dates.add(new Date(m.ko).toISOString().slice(0,10));
      dates.add(new Date(m.ko - 12*3600000).toISOString().slice(0,10)); // TSDB date "locale"
    });
    for(const d of Array.from(dates).slice(0,4)){
      const r = await fetch("https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d="+d+"&s=Soccer");
      if(!r.ok) continue;
      const evs = ((await r.json())||{}).events || [];
      for(const ev of evs){
        if(!/world cup/i.test(ev.strLeague||"")) continue;
        const st = String(ev.strStatus||"").toUpperCase();
        if(!(st==="FT"||st==="AET"||st==="PEN"||st==="MATCH FINISHED"||st==="FINISHED")) continue;
        const hs = parseInt(ev.intHomeScore,10), as = parseInt(ev.intAwayScore,10);
        if(isNaN(hs)||isNaN(as)) continue;
        const m = pendings.find(m =>
          (matchTeam(m.t1, ev.strHomeTeam) && matchTeam(m.t2, ev.strAwayTeam)) ||
          (matchTeam(m.t1, ev.strAwayTeam) && matchTeam(m.t2, ev.strHomeTeam)));
        if(!m) continue;
        const t1Home = matchTeam(m.t1, ev.strHomeTeam);
        // Prolongation / t.a.b. d'après le statut TheSportsDB (séance non chiffrée ici)
        const durT = st==="PEN" ? "PEN" : st==="AET" ? "AET" : null;
        out.data[String(m.id)] = Object.assign({}, out.data[String(m.id)]||{}, Object.assign(
          { s1: t1Home?hs:as, s2: t1Home?as:hs, status:"FINISHED", src:"tsdb" },
          durT ? { dur:durT } : {} ));
        changed = true;
        console.log("🟣 TheSportsDB : résultat #"+m.id+" publié.");
      }
    }
  }catch(e){ console.warn("tsdb:", e.message); }

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
        // Faits de jeu openfootball : buteurs (goals1/goals2) + score mi-temps.
        // On enrichit l'entrée si elle n'a pas déjà ces infos (API-Football prioritaire).
        const e2 = out.data[String(m.id)];
        if(e2){
          const ofGoals = [];
          const pushG = (arr, side) => (arr||[]).forEach(g => ofGoals.push({
            m: g.minute||0, t: side, n: g.name||"?",
            type: g.penalty ? "P" : (g.owngoal ? "CSC" : null), a: null
          }));
          pushG(x.goals1, t1Home?1:2); pushG(x.goals2, t1Home?2:1);
          ofGoals.sort((u,v)=>u.m-v.m);
          if(ofGoals.length && (!e2.goals || e2.goals.length < ofGoals.length)){
            e2.goals = ofGoals; changed = true;
            console.log("⚽ openfootball : buteurs #"+m.id+" ("+ofGoals.length+").");
          }
          const ht = x.score && x.score.ht;
          if(!e2.ht && ht && ht[0]!=null){ e2.ht = t1Home ? [ht[0],ht[1]] : [ht[1],ht[0]]; changed = true; }
          // Prolongation / tirs au but (openfootball : ft=90', et=après prolong., p=séance).
          // openfootball n'additionne PAS les t.a.b. au score (contrairement à football-data).
          const sP = x.score || {}, etArr = sP.et, penArr = sP.p;
          if(Array.isArray(etArr) && etArr[0]!=null){ // score du jeu = fin de prolongation
            const es1 = t1Home?etArr[0]:etArr[1], es2 = t1Home?etArr[1]:etArr[0];
            if(e2.s1!==es1 || e2.s2!==es2){ e2.s1=es1; e2.s2=es2; changed = true; }
          }
          if(Array.isArray(penArr) && penArr[0]!=null){
            e2.pen1 = t1Home?penArr[0]:penArr[1]; e2.pen2 = t1Home?penArr[1]:penArr[0];
            if(e2.dur!=="PEN"){ e2.dur = "PEN"; changed = true; }
          } else if(Array.isArray(etArr) && etArr[0]!=null && !e2.dur){
            e2.dur = "AET"; changed = true;
          }
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
// Exécution directe uniquement (pas à l'import, ex. depuis le test unitaire).
import { fileURLToPath } from "node:url";
if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  main().catch(e => { console.error("❌", e); process.exit(1); });
}
