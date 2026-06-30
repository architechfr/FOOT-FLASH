#!/usr/bin/env node
// Test unitaire de splitScore (séparation score du jeu / prolongation / tirs au but).
// Lancer : node scripts/test-scores.mjs
import { splitScore } from "./fetch-livescores.mjs";

let ok = 0, ko = 0;
function eq(name, got, exp){
  const g = JSON.stringify(got), e = JSON.stringify(exp);
  if(g===e){ ok++; console.log("✅ "+name); }
  else { ko++; console.log("❌ "+name+"\n   attendu "+e+"\n   obtenu "+g); }
}

// 1) Tirs au but (exemple doc football-data : Allemagne 7-6 = 1-1 a.p. + t.a.b. 6-5)
eq("PEN EC96 7-6 → jeu 1-1, t.a.b. 6-5", splitScore({
  duration:"PENALTY_SHOOTOUT",
  fullTime:{home:7,away:6}, halfTime:{home:1,away:1},
  regularTime:{home:1,away:1}, extraTime:{home:0,away:0}, penalties:{home:6,away:5}
}), { h:1, a:1, penH:6, penA:5, dur:"PEN" });

// 2) Cas du bug signalé : Allemagne 5-6 Paraguay (jeu 1-1, t.a.b. 4-5)
eq("PEN 5-6 → jeu 1-1, t.a.b. 4-5", splitScore({
  duration:"PENALTY_SHOOTOUT",
  fullTime:{home:5,away:6}, penalties:{home:4,away:5}
}), { h:1, a:1, penH:4, penA:5, dur:"PEN" });

// 3) Repli sans node penalties : reconstruit via regularTime + extraTime
eq("PEN sans penalties → repli regularTime/extraTime", splitScore({
  duration:"PENALTY_SHOOTOUT",
  fullTime:{home:null,away:null},
  regularTime:{home:2,away:2}, extraTime:{home:1,away:0}
}), { h:3, a:2, penH:null, penA:null, dur:"PEN" });

// 4) Prolongation sans t.a.b. (fullTime = score réel)
eq("AET 2-1 → jeu 2-1, pas de t.a.b.", splitScore({
  duration:"EXTRA_TIME", fullTime:{home:2,away:1}
}), { h:2, a:1, penH:null, penA:null, dur:"AET" });

// 5) Temps réglementaire normal
eq("REGULAR 3-0 → inchangé, dur null", splitScore({
  duration:"REGULAR", fullTime:{home:3,away:0}
}), { h:3, a:0, penH:null, penA:null, dur:null });

// 6) Match en cours / pas de score
eq("score vide → null partout", splitScore({
  duration:"REGULAR", fullTime:{home:null,away:null}
}), { h:null, a:null, penH:null, penA:null, dur:null });

// 7) score absent
eq("score absent → tolérant", splitScore(null),
  { h:null, a:null, penH:null, penA:null, dur:null });

console.log("\n"+ok+" OK · "+ko+" KO");
process.exit(ko?1:0);
