// Směnářek 1.5.5 – průsvitný kalendář, CZ jmeniny (říjen+listopad), opravené výpočty, pozadí dle režimu
const HOLIDAYS = new Set(["01-01","05-01","05-08","07-05","07-06","09-28","10-28","11-17","12-24","12-25","12-26"]);
const MEAL_DEDUCT = 40, LUNCH_DEDUCT = 40, MEAL_INFO_VALUE = 110;

// 12h směny a 8h směny (pro popisy ve widgetu)
const MAP12 = {D:'D 05:45–18:00', N:'N 17:45–06:00', V:'Dovolená'};
const MAP8  = {R:'R 06:00–14:00', O:'O 14:00–22:00', N:'N 22:00–06:00', V:'Dovolená'};

// CZ jmeniny – vestavěný minimální balík (ŘÍJEN + LISTOPAD 2025).
// Pro plný rok lze nahrát soubor namedays_cz.json (viz loadNamedaysFromJson()).
const NAMEDAYS_EMBED = {
  "10": {
    "01":"Igor","02":"Olivie","03":"Bohumil","04":"František","05":"Eliška","06":"Hanuš","07":"Justýna",
    "08":"Věra","09":"Štefan","10":"Marina","11":"Andrej","12":"Marcel","13":"Renáta","14":"Agáta",
    "15":"Tereza","16":"Havel","17":"Hedvika","18":"Lukáš","19":"Michaela","20":"Vendelín",
    "21":"Brigita","22":"Sabina","23":"Teodor","24":"Nina","25":"Beáta","26":"Erik","27":"Šarlota",
    "28":"Státní svátek","29":"Silvie","30":"Tadeáš","31":"Štěpánka"
  },
  "11": {
    "01":"Felix","02":"Památka zesnulých","03":"Hubert","04":"Karel","05":"Miriam","06":"Liběna","07":"Saskie",
    "08":"Bohumír","09":"Bohdan","10":"Evžen","11":"Martin","12":"Benedikt","13":"Tibor","14":"Sáva",
    "15":"Leopold","16":"Otmar","17":"Mahulena","18":"Romana","19":"Alžběta","20":"Nikola",
    "21":"Albert","22":"Cecílie","23":"Klement","24":"Emílie","25":"Kateřina","26":"Artur","27":"Xenie",
    "28":"René","29":"Zina","30":"Ondřej"
  }
};

let state = JSON.parse(localStorage.getItem('smenarek_state_v155')||'{}');
if(!state.shifts) state.shifts={};
if(!state.rates) state.rates={};
if(!state.mode) state.mode='12';
if(state.bonus_pct==null) state.bonus_pct=10;
if(state.cafeteria==null) state.cafeteria=0;
if(state.annual_bonus==null) state.annual_bonus=0;
if(!state.avg) state.avg={net1:null,h1:null,net2:null,h2:null,net3:null,h3:null,avg_manual:null};
if(state.bgEnabled==null) state.bgEnabled=true;
if(!state.namedays) state.namedays={}; // sem se načte JSON, když existuje

let current=new Date(), selectedDate=null;

const $=id=>document.getElementById(id);
const pad=n=>n<10?'0'+n:n;
const ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const md=d=>pad(d.getMonth()+1)+'-'+pad(d.getDate());
const daysIn=(y,m)=>new Date(y,m+1,0).getDate();
const firstDay=(y,m)=>{let n=new Date(y,m,1).getDay();return n===0?7:n};
const isW=d=>[0,6].includes(d.getDay());
const isH=dt=>HOLIDAYS.has(md(dt));
const r2=x=>Math.round(x*100)/100;
const nval=v=>(+v)||0;
const money=x=>(Math.round((x||0)*100)/100).toLocaleString('cs-CZ',{minimumFractionDigits:2,maximumFractionDigits:2})+' Kč';

function save(){ localStorage.setItem('smenarek_state_v155', JSON.stringify(state)); }

function renderCalendar(){
  document.body.classList.toggle('mode8', state.mode==='8');
  applyBackground();

  const y=current.getFullYear(), m=current.getMonth();
  $('monthLabel').textContent=new Date(y,m).toLocaleString('cs-CZ',{month:'long',year:'numeric'});
  const total=daysIn(y,m), start=firstDay(y,m)-1;

  let html=`<thead><tr>${["Po","Út","St","Čt","Pá","So","Ne"].map(d=>`<th>${d}</th>`).join("")}</tr></thead><tbody>`;
  let day=1;
  for(let r=0;r<6;r++){
    html+="<tr>";
    for(let c=0;c<7;c++){
      if((r===0&&c<start) || day>total){ html+="<td></td>"; continue; }
      const dt=new Date(y,m,day), key=ymd(dt), t=state.shifts[key]||"";
      const classes=[t]; if(selectedDate===key) classes.push('selected');
      html+=`<td data-date="${key}" class="${classes.join(' ')}">
               <div class="daynum">${day}${isH(dt)?' 🎌':''}</div>
               ${t?`<span class="badge">${t}</span>`:''}
             </td>`;
      day++;
    }
    html+="</tr>";
  }
  html+="</tbody>";
  $('cal').innerHTML=html;

  $('cal').querySelectorAll('td[data-date]').forEach(td=>{
    td.onclick=()=>{
      const key=td.getAttribute('data-date'); selectedDate=key;
      const cur=state.shifts[key]||''; setShift(key,nextCode(cur),false); renderCalendar();
    };
  });

  updateStats(); bindInputsOnce(); updateHeader(); calcPay();
}

function nextCode(cur){
  return state.mode==='8'
    ? (cur===""?"R":cur==="R"?"O":cur==="O"?"N":cur==="N"?"V":"")
    : (cur===""?"D":cur==="D"?"N":cur==="N"?"V":"");
}

function setShift(dateStr,t,rerender=true){
  const valid = state.mode==='8' ? ['R','O','N','V',''] : ['D','N','V',''];
  if(!valid.includes(t)) return;
  if(t==='') delete state.shifts[dateStr]; else state.shifts[dateStr]=t;
  save(); if(rerender) renderCalendar();
}

/* ====== Jmeniny (CZ) ====== */
function localNameday(date){
  // 1) pokud je k dispozici externí JSON (state.namedays["MM-DD"]), použij ho
  const key = md(date);
  if(state.namedays && state.namedays[key]) return state.namedays[key];

  // 2) fallback: zabudované měsíce (říjen/listopad)
  const mm = pad(date.getMonth()+1), dd = pad(date.getDate());
  if(NAMEDAYS_EMBED[mm] && NAMEDAYS_EMBED[mm][dd]) return NAMEDAYS_EMBED[mm][dd];

  return null;
}

// volitelně: když existuje namedays_cz.json v kořeni, načteme ho (plný rok)
async function loadNamedaysFromJson(){
  try{
    const res = await fetch('namedays_cz.json', {cache:'no-store'});
    if(res.ok){
      const obj = await res.json();
      // očekáváme mapu {"MM-DD":"Jméno"}
      state.namedays = obj; save(); updateHeader();
    }
  }catch(_){}
}

function updateHeader(){
  const today = new Date();
  const t = state.shifts[ymd(today)]||'—';
  $('todayShift').textContent = 'Dnes: ' + (t==='—'?'—': (state.mode==='8'?MAP8[t]:MAP12[t]));
  const name = localNameday(today);
  $('todayNameday').textContent = 'Svátek: ' + (name || '—');
}

/* ====== Vstupy, pozadí, navigace ====== */
let inputsBound=false;
function bindInputsOnce(){
  if(inputsBound) return; inputsBound=true;
  ['rate_base','rate_odpo','rate_noc','rate_vikend','rate_svatek','rate_nepretrzity','vac_hours_day']
  .forEach(id=>{
    const el=$(id); el.value = state.rates[id] ?? '';
    el.oninput=()=>{ state.rates[id]=el.value===''?null:nval(el.value); save(); calcPay(); };
  });
  $('bonus_pct').value=state.bonus_pct;
  $('bonus_pct').oninput=()=>{ state.bonus_pct=nval($('bonus_pct').value); save(); calcPay(); };
  $('cafeteria').value=state.cafeteria; $('cafeteria').oninput=()=>{ state.cafeteria=nval($('cafeteria').value); save(); calcPay(); };
  $('annual_bonus').value=state.annual_bonus; $('annual_bonus').oninput=()=>{ state.annual_bonus=nval($('annual_bonus').value); save(); calcPay(); };

  $('prev').onclick=()=>{ current.setMonth(current.getMonth()-1); selectedDate=null; renderCalendar(); };
  $('next').onclick=()=>{ current.setMonth(current.getMonth()+1); selectedDate=null; renderCalendar(); };
  $('setToday').onclick=()=>{ const k=ymd(new Date()); const cur=state.shifts[k]||''; setShift(k,nextCode(cur)); };
  $('clearDay').onclick=()=>{ if(!selectedDate) return alert('Klepni nejdřív na den.'); setShift(selectedDate,''); };
  $('mode12').onclick=()=>{ state.mode='12'; save(); renderCalendar(); };
  $('mode8').onclick =()=>{ state.mode='8';  save(); renderCalendar(); };
  $('bgEnabled').onchange=applyBackground;

  // zkusit nahrát full JSON jmenin (pokud je v repu)
  loadNamedaysFromJson();
}

function applyBackground(){
  const layer=$('bg-layer'); if(!layer) return;
  if(!$('bgEnabled').checked){ layer.style.backgroundImage='none'; state.bgEnabled=false; save(); return; }
  state.bgEnabled=true; save();
  const url = state.mode==='8' ? 'backgrounds/bg_8h.jpg' : 'backgrounds/bg_12h.jpg';
  layer.style.backgroundImage = `url("${url}")`;
}

/* ====== Výpočty statistik a mzdy ====== */
function updateStats(){
  const y=current.getFullYear(), m=current.getMonth(), last=new Date(y,m+1,0);
  // Celkové hodiny na směnu: pauzu finančně řešíme přes obědy/stravenky, proto neodečítáme z času
  const DAILY=12.25;

  let dDay=0,nDay=0,vac=0,hours=0,nightH=0,afterH=0,weekendH=0,holWorkedH=0;

  for(let i=1;i<=last.getDate();i++){
    const dt=new Date(y,m,i), key=ymd(dt), t=state.shifts[key];
    if(!t) continue;
    if(t==='V'){ vac++; continue; }

    if(state.mode==='8'){
      const h=7.5;
      if(t==='R'){ hours+=h; afterH+=h; if(isW(dt)) weekendH+=h; }
      if(t==='O'){ hours+=h; afterH+=h; if(isW(dt)) weekendH+=h; }
      if(t==='N'){ hours+=h; nightH+=h; if(isW(dt)) weekendH+=h; }
      if(isH(dt)) holWorkedH+=h;
    } else {
      if(t==='D'){ dDay++; hours+=DAILY; afterH+=4.0; if(isW(dt)) weekendH+=DAILY; }
      if(t==='N'){
        nDay++; hours+=DAILY;
        afterH += 4.25; // 17:45–22:00
        nightH += 8.0;  // 22:00–06:00
        const wd=dt.getDay();
        if(wd===5) weekendH+=6;          // Pá noční -> 00–06 So
        else if(wd===6) weekendH+=DAILY; // So noční -> celý víkend
        else if(wd===0) weekendH+=6.25;  // Ne noční -> 17:45–24:00
      }
      if(isH(dt)) holWorkedH+=DAILY;
    }
  }

  const head = state.mode==='8'
    ? `Ranní+Odpolední: <b>${r2(afterH/7.5)}</b> • Noční: <b>${r2(nightH/7.5)}</b> • Dovolené: <b>${vac}</b>`
    : `Denní: <b>${dDay}</b> • Noční: <b>${nDay}</b> • Dovolené: <b>${vac}</b>`;
  $('stats').innerHTML = [head, `Hodiny: <b>${r2(hours)}</b>`, `Svátek odpracovaný: <b>${r2(holWorkedH)} h</b>`].join('<br>');

  if(state.mode==='12'){
    $('substats').style.display='block';
    $('substats').innerHTML = [
      `<div><span>Odpolední hodiny (D: 4.00, N: 4.25)</span><span><b>${r2(afterH)}</b> h</span></div>`,
      `<div><span>Noční hodiny (22–6)</span><span><b>${r2(nightH)}</b> h</span></div>`,
      `<div><span>Víkendové hodiny</span><span><b>${r2(weekendH)}</b> h</span></div>`
    ].join('');
  } else $('substats').style.display='none';

  state._calc={hours,afterH,nightH,weekendH,vac,holWorkedH}; save();
}

function avgRate(){
  const man = nval(state.avg.avg_manual??0);
  if(man>0) return man;
  const sNet=(state.avg.net1||0)+(state.avg.net2||0)+(state.avg.net3||0);
  const sH  =(state.avg.h1||0)+(state.avg.h2||0)+(state.avg.h3||0);
  return sH>0 ? sNet/sH : 0;
}

function calcPay(){
  const avg=avgRate();
  $('avg_info') && ($('avg_info').textContent='Průměrná náhrada: '+money(avg)+(nval(state.avg.avg_manual||0)>0?' (ručně)':''));

  const C=state._calc||{hours:0,afterH:0,nightH:0,weekendH:0,vac:0,holWorkedH:0};
  const r={
    base:nval(state.rates['rate_base']), odpo:nval(state.rates['rate_odpo']),
    noc:nval(state.rates['rate_noc']), vikend:nval(state.rates['rate_vikend']),
    svatek:nval(state.rates['rate_svatek']), nepretrzity:nval(state.rates['rate_nepretrzity'])
  };

  const basePay = r.base * C.hours;
  const odpoPay = r.odpo * C.afterH;
  const nightPay= r.noc  * C.nightH;
  const wkPay   = r.vikend * C.weekendH;
  const holPay  = avg * C.holWorkedH;     // svátek = průměr × hodiny
  const nepret  = r.nepretrzity * C.hours;
  const prime   = basePay * ((state.bonus_pct||0)/100);
  const vacHours = (state.rates['vac_hours_day']??8);
  const vacPay  = vacHours * avg * C.vac;

  // stravenky + obědy (souhrn) – 12h: N=2ks, víkendová D=2ks, všední D=1ks; 8h: N=2ks, víkendové směny=2ks, všední R/O=1ks
  function mealsCalc(){
    let y=current.getFullYear(), m=current.getMonth(), end=new Date(y,m+1,0), count=0, lunches=0;
    for(let i=1;i<=end.getDate();i++){
      const dt=new Date(y,m,i), key=ymd(dt), t=state.shifts[key];
      if(!t||t==='V') continue;
      if(state.mode==='12'){
        if(t==='N'){ count+=2; }
        if(t==='D'){ if(isW(dt)) count+=2; else { count+=1; lunches++; } }
      }else{
        if(t==='N'){ count+=2; }
        if(t==='R'||t==='O'){ if(isW(dt)) count+=2; else { count+=1; lunches++; } }
      }
    }
    return {count,lunches};
  }
  const mc=mealsCalc();
  const mealDeduct = mc.count*MEAL_DEDUCT, lunchDeduct=mc.lunches*LUNCH_DEDUCT, mealValue=mc.count*MEAL_INFO_VALUE;

  const gross = basePay+odpoPay+nightPay+wkPay+holPay+nepret+prime+vacPay + (state.cafeteria||0) + (state.annual_bonus||0);
  const social=gross*0.065, health=gross*0.045;
  const tax=Math.max(0,(gross-social-health)*0.15-2570);
  const netBeforeMeals=gross-social-health-tax;
  const net=netBeforeMeals - (mealDeduct + lunchDeduct);

  $('pay').innerHTML=[
    ['Základ',money(basePay)],['Odpolední',money(odpoPay)],['Noční',money(nightPay)],
    ['Víkend',money(wkPay)],['Svátek (průměr × hodiny)',money(holPay)],['Nepřetržitý provoz',money(nepret)],
    ['Přímé prémie ('+(state.bonus_pct||0)+'%)',money(prime)],['Náhrada za dovolenou',money(vacPay)],
    ['Cafeterie',money(state.cafeteria||0)],['Roční motivační',money(state.annual_bonus||0)],
    ['Srážka stravenky','− '+money(mealDeduct)],['Srážka obědy','− '+money(lunchDeduct)]
  ].map(([k,v])=>`<div class="substats"><div><span>${k}</span><span><b>${v}</b></span></div></div>`).join('');

  $('net').innerHTML = `<div class="result">💵 Čistá mzda (odhad): ${money(net)}</div>
                        <div class="result">🍽️ Stravenky: ${money(mealValue)}</div>`;
}

/* ====== Start ====== */
renderCalendar();$('bgEnabled').onchange=applyBackground;

function updateStats(){
  const y=current.getFullYear(), m=current.getMonth(), last=new Date(y,m+1,0);
  let dDay=0,nDay=0,vac=0,hours=0,nightH=0,afterH=0,weekendH=0,holWorkedH=0;
  const DAILY=11.25;
  for(let i=1;i<=last.getDate();i++){
    const dt=new Date(y,m,i), key=ymd(dt), t=state.shifts[key];
    if(!t) continue;
    if(t==='V'){ vac++; continue; }

    if(state.mode==='8'){
      const h=7.5;
      if(t==='R'){ hours+=h; afterH+=h; if(isW(dt)) weekendH+=h; }
      if(t==='O'){ hours+=h; afterH+=h; if(isW(dt)) weekendH+=h; }
      if(t==='N'){ hours+=h; nightH+=h; if(isW(dt)) weekendH+=h; }
      if(isH(dt)) holWorkedH+=h;
    } else {
      if(t==='D'){ dDay++; hours+=DAILY; afterH+=4; if(isW(dt)) weekendH+=DAILY; }
      if(t==='N'){
        nDay++; hours+=DAILY; nightH+=8;
        const wd=dt.getDay();
        if(wd===5) weekendH+=6;
        else if(wd===6) weekendH+=DAILY;
        else if(wd===0) weekendH+=6.25;
      }
      if(isH(dt)) holWorkedH+=DAILY;
    }
  }
  const head = state.mode==='8'
    ? `Ranní+Odpolední: <b>${r2(afterH/7.5)}</b> • Noční: <b>${r2(nightH/7.5)}</b> • Dovolené: <b>${vac}</b>`
    : `Denní: <b>${dDay}</b> • Noční: <b>${nDay}</b> • Dovolené: <b>${vac}</b>`;
  $('stats').innerHTML = [head, `Hodiny: <b>${r2(hours)}</b>`, `Svátek odpracovaný: <b>${r2(holWorkedH)} h</b>`].join('<br>');
  if(state.mode==='12'){
    $('substats').style.display='block';
    $('substats').innerHTML = [
      `<div><span>Odpolední hodiny (14–22)</span><span><b>${r2(afterH)}</b> h</span></div>`,
      `<div><span>Noční hodiny (22–6)</span><span><b>${r2(nightH)}</b> h</span></div>`,
      `<div><span>Víkendové hodiny</span><span><b>${r2(weekendH)}</b> h</span></div>`
    ].join('');
  } else $('substats').style.display='none';
  state._calc={hours,afterH,nightH,weekendH,vac,holWorkedH}; save();
}

function avgRate(){
  const man = nval($('avg_manual').value);
  if(man>0) return man;
  const sNet=nval($('avg_net1').value)+nval($('avg_net2').value)+nval($('avg_net3').value);
  const sH  =nval($('avg_h1').value)+nval($('avg_h2').value)+nval($('avg_h3').value);
  return sH>0 ? sNet/sH : 0;
}

function bindInputs(){
  ['rate_base','rate_odpo','rate_noc','rate_vikend','rate_svatek','rate_nepretrzity','vac_hours_day']
  .forEach(id=>{
    const el=$(id); el.value = state.rates[id] ?? '';
    el.oninput=()=>{ state.rates[id]=el.value===''?null:nval(el.value); save(); calcPay(); };
  });
  $('bonus_pct').value=state.bonus_pct;
  $('bonus_pct').oninput=()=>{ state.bonus_pct=nval($('bonus_pct').value); save(); calcPay(); };
  $('cafeteria').value=state.cafeteria; $('cafeteria').oninput=()=>{ state.cafeteria=nval($('cafeteria').value); save(); calcPay(); };
  $('annual_bonus').value=state.annual_bonus; $('annual_bonus').oninput=()=>{ state.annual_bonus=nval($('annual_bonus').value); save(); calcPay(); };
  ['avg_net1','avg_h1','avg_net2','avg_h2','avg_net3','avg_h3','avg_manual'].forEach(id=>{
    const el=$(id); el.value = state.avg[id] ?? '';
    el.oninput=()=>{ state.avg[id]=el.value===''?null:nval(el.value); save(); calcPay(); };
  });
  $('btnLoadNames').onclick=()=>{
    try{ state.namedays=JSON.parse(($('namedays_json').value||'{}').trim()); save(); updateHeader(); alert('Jmeniny nahrány.'); }
    catch(e){ alert('Neplatný JSON: '+e.message); }
  };
  $('btnClearNames').onclick=()=>{ state.namedays={}; save(); updateHeader(); };
}

function calcPay(){
  const avg=avgRate();
  $('avg_info').textContent='Průměrná náhrada: '+money(avg)+(nval($('avg_manual').value)>0?' (ručně)':'');

  const C=state._calc||{hours:0,afterH:0,nightH:0,weekendH:0,vac:0,holWorkedH:0};
  const r={
    base:nval($('rate_base').value), odpo:nval($('rate_odpo').value),
    noc:nval($('rate_noc').value), vikend:nval($('rate_vikend').value),
    svatek:nval($('rate_svatek').value), nepretrzity:nval($('rate_nepretrzity').value)
  };

  const basePay = r.base * C.hours;
  const odpoPay = r.odpo * C.afterH;
  const nightPay= r.noc  * C.nightH;
  const wkPay   = r.vikend * C.weekendH;
  const holPay  = avg * C.holWorkedH;
  const nepret  = r.nepretrzity * C.hours;
  const prime   = basePay * ((state.bonus_pct||0)/100);
  const vacHours = (state.rates['vac_hours_day']??8);
  const vacPay  = vacHours * avg * C.vac;

  // stravenky + obědy
  function mealsCalc(){
    let y=current.getFullYear(), m=current.getMonth(), end=new Date(y,m+1,0), count=0, lunches=0;
    for(let i=1;i<=end.getDate();i++){
      const dt=new Date(y,m,i), key=ymd(dt), t=state.shifts[key];
      if(!t||t==='V') continue;
      if(state.mode==='12'){
        if(t==='N'){ count+=2; }
        if(t==='D'){ if(isW(dt)) count+=2; else { count+=1; lunches++; } }
      }else{
        if(t==='N'){ count+=2; }
        if(t==='R'||t==='O'){ if(isW(dt)) count+=2; else { count+=1; lunches++; } }
      }
    }
    return {count,lunches};
  }
  const mc=mealsCalc();
  const mealDeduct = mc.count*40, lunchDeduct=mc.lunches*40, mealValue=mc.count*110;

  const gross = basePay+odpoPay+nightPay+wkPay+holPay+nepret+prime+vacPay + (state.cafeteria||0) + (state.annual_bonus||0);
  const social=gross*0.065, health=gross*0.045;
  const tax=Math.max(0,(gross-social-health)*0.15-2570);
  const netBeforeMeals=gross-social-health-tax;
  const net=netBeforeMeals - (mealDeduct + lunchDeduct);

  $('pay').innerHTML=[
    ['Základ',money(basePay)],['Odpolední',money(odpoPay)],['Noční',money(nightPay)],
    ['Víkend',money(wkPay)],['Svátek (průměr × hodiny)',money(holPay)],['Nepřetržitý provoz',money(nepret)],
    ['Přímé prémie ('+(state.bonus_pct||0)+'%)',money(prime)],['Náhrada za dovolenou',money(vacPay)],
    ['Cafeterie',money(state.cafeteria||0)],['Roční motivační',money(state.annual_bonus||0)],
    ['Srážka stravenky','− '+money(mealDeduct)],['Srážka obědy','− '+money(lunchDeduct)]
  ].map(([k,v])=>`<div class="substats"><div><span>${k}</span><span><b>${v}</b></span></div></div>`).join('');

  $('net').innerHTML = `<div class="result">💵 Čistá mzda (odhad): ${money(net)}</div>
                        <div class="result">🍽️ Stravenky: ${money(mealValue)}</div>`;
}

renderCalendar();
