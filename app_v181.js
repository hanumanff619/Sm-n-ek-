// Směnářek 1.8.1 – help icon right, single holiday mark, namedays online
const MEAL_DEDUCT = 40, LUNCH_DEDUCT = 40, MEAL_INFO_VALUE = 110;
const MAP12 = {D:'D 05:45–18:00', N:'N 17:45–06:00', V:'Dovolená'};
const MAP8  = {R:'R 06:00–14:00', O:'O 14:00–22:00', N:'N 22:00–06:00', V:'Dovolená'};

let state = JSON.parse(localStorage.getItem('smenarek_state_v181')||'{}');
if(!state.shifts) state.shifts={};
if(!state.rates) state.rates={};
if(!state.mode) state.mode='12';
if(state.bonus_pct==null) state.bonus_pct=10;
if(state.annual_bonus==null) state.annual_bonus=0;
if(state.cafeteria_ok==null) state.cafeteria_ok=false;
if(!state.avg) state.avg={net1:null,h1:null,net2:null,h2:null,net3:null,h3:null,avg_manual:null};

let current=new Date(), selectedDate=null;

const $=id=>document.getElementById(id);
const pad=n=>n<10?'0'+n:n;
const ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const md=d=>pad(d.getMonth()+1)+'-'+pad(d.getDate());
const daysIn=(y,m)=>new Date(y,m+1,0).getDate();
const firstDay=(y,m)=>{let n=new Date(y,m,1).getDay();return n===0?7:n};
const isW=d=>[0,6].includes(d.getDay());
const r2=x=>Math.round(x*100)/100;
const nval=v=>(+v)||0;
const money=x=>(Math.round((x||0)*100)/100).toLocaleString('cs-CZ',{minimumFractionDigits:2,maximumFractionDigits:2})+' Kč';

function save(){ localStorage.setItem('smenarek_state_v181', JSON.stringify(state)); }

// online nameday
async function setTodayNameday(){
  try{
    const d=new Date();
    const y=d.getFullYear(), m=('0'+(d.getMonth()+1)).slice(-2), dd=('0'+d.getDate()).slice(-2);
    const res = await fetch(`https://svatkyapi.cz/api/day?date=${y}-${m}-${dd}`);
    const data = await res.json();
    $('todayNameday').textContent = 'Svátek: ' + (data.name || '—');
  }catch(e){
    $('todayNameday').textContent = 'Svátek: —';
  }
}

// holidays
const HOLI_CACHE = {};
function easterSunday(year) {
  const a=year%19, b=Math.floor(year/100), c=year%100, d=Math.floor(b/4), e=b%4, f=Math.floor((b+8)/25),
        g=Math.floor((b-f+1)/3), h=(19*a+b-d-g+15)%30, i=Math.floor(c/4), k=c%4,
        l=(32+2*e+2*i-h-k)%7, m=Math.floor((a+11*h+22*l)/451),
        month=Math.floor((h+l-7*m+114)/31), day=1+((h+l-7*m+114)%31);
  return new Date(year, month-1, day);
}
function czechHolidays(year){
  if(HOLI_CACHE[year]) return HOLI_CACHE[year];
  const fixed=['01-01','05-01','05-08','07-05','07-06','09-28','10-28','11-17','12-24','12-25','12-26'];
  const set=new Set(fixed);
  const easter=easterSunday(year);
  const goodFriday=new Date(easter); goodFriday.setDate(easter.getDate()-2);
  const easterMonday=new Date(easter); easterMonday.setDate(easter.getDate()+1);
  const gf=pad(goodFriday.getMonth()+1)+'-'+pad(goodFriday.getDate());
  const em=pad(easterMonday.getMonth()+1)+'-'+pad(easterMonday.getDate());
  set.add(gf); set.add(em);
  HOLI_CACHE[year]=set; return set;
}
function isHoliday(dt){ return czechHolidays(dt.getFullYear()).has(md(dt)); }

function applyBackground(){
  const layer=$('bg-layer'); if(!layer) return;
  const url = state.mode==='8' ? 'backgrounds/bg_8h.jpg' : 'backgrounds/bg_12h.jpg';
  layer.style.backgroundImage = `url("${url}")`;
}

function updateHeader(){
  const today = new Date();
  const t = state.shifts[ymd(today)]||'—';
  $('todayShift').textContent = 'Dnes: ' + (t==='—'?'—': (state.mode==='8'?MAP8[t]:MAP12[t]));
  setTodayNameday();
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

function bindInputsOnce(){
  if(window._inputsBound) return; window._inputsBound=true;

  ['rate_base','rate_odpo','rate_noc','rate_vikend','rate_nepretrzity']
  .forEach(id=>{
    const el=$(id); el.value = state.rates[id] ?? '';
    el.oninput=()=>{ state.rates[id]=el.value===''?null:nval(el.value); save(); calcPay(); };
  });

  $('bonus_pct').value=state.bonus_pct;
  $('bonus_pct').oninput=()=>{ state.bonus_pct=nval($('bonus_pct').value); save(); calcPay(); };
  $('annual_bonus').value=state.annual_bonus; $('annual_bonus').oninput=()=>{ state.annual_bonus=nval($('annual_bonus').value); save(); calcPay(); };

  const caf=$('caf_check'); caf.checked = !!state.cafeteria_ok;
  caf.onchange=()=>{ state.cafeteria_ok = caf.checked; save(); calcPay(); };

  const fields = [
    ['avg_net1','net1'],['avg_net2','net2'],['avg_net3','net3'],
    ['avg_h1','h1'],['avg_h2','h2'],['avg_h3','h3'],['avg_manual','avg_manual']
  ];
  fields.forEach(([id,key])=>{
    const el=$(id); el.value = state.avg[key] ?? '';
    el.oninput=()=>{ state.avg[key] = el.value===''?null:nval(el.value); save(); calcPay(); };
  });

  $('prev').onclick=()=>{ current.setMonth(current.getMonth()-1); selectedDate=null; renderCalendar(); };
  $('next').onclick=()=>{ current.setMonth(current.getMonth()+1); selectedDate=null; renderCalendar(); };
  $('setToday').onclick=()=>{ const k=ymd(new Date()); const cur=state.shifts[k]||''; setShift(k,nextCode(cur)); };
  $('clearDay').onclick=()=>{ if(!selectedDate) return alert('Klepni nejdřív na den.'); setShift(selectedDate,''); };
  $('mode12').onclick=()=>{ state.mode='12'; save(); renderCalendar(); };
  $('mode8').onclick =()=>{ state.mode='8';  save(); renderCalendar(); };
}

function updateStats(){
  const y=current.getFullYear(), m=current.getMonth(), last=new Date(y,m+1,0);
  const DAILY_WORKED = 11.25
  const VAC12 = 11.25;
  const H8 = 8.0;

  let dDay=0,nDay=0,vac=0,hours=0,nightH=0,afterH=0,weekendH=0,holWorkedH=0;

  for(let i=1;i<=last.getDate();i++){
    const dt=new Date(y,m,i), key=ymd(dt), t=state.shifts[key];
    if(!t) continue;

    if(t==='V'){ vac++; continue; }

    if(state.mode==='8'){
      const h=H8;
      if(t==='R'){ hours+=h; afterH+=h; if(isW(dt)) weekendH+=h; }
      if(t==='O'){ hours+=h; afterH+=h; if(isW(dt)) weekendH+=h; }
      if(t==='N'){ hours+=h; nightH+=h; if(isW(dt)) weekendH+=h; }
      if(isHoliday(dt)) holWorkedH+=8;
      const next=new Date(y,m,i+1);
      if(t==='N' && isHoliday(next)) holWorkedH+=6;
    } else {
      if(t==='D'){ 
        dDay++; hours+=DAILY_WORKED; 
        afterH+=4.0; if(isW(dt)) weekendH+=DAILY_WORKED; 
        if(isHoliday(dt)) holWorkedH+=VAC12; 
      }
      if(t==='N'){
        nDay++; hours+=DAILY_WORKED;
        afterH += 4.25;
        nightH += 8.0;
        const wd=dt.getDay();
        if(wd===5) weekendH+=6;
        else if(wd===6) weekendH+=DAILY_WORKED;
        else if(wd===0) weekendH+=6.25;
        if(isHoliday(dt)) holWorkedH+=VAC12;
        const next=new Date(y,m,i+1);
        if(isHoliday(next)) holWorkedH+=6;
      }
    }
  }

  const head = state.mode==='8'
    ? `Ranní+Odpolední: <b>${r2(afterH/8)}</b> • Noční: <b>${r2(nightH/8)}</b> • Dovolené: <b>${vac}</b>`
    : `Denní: <b>${dDay}</b> • Noční: <b>${nDay}</b> • Dovolené: <b>${vac}</b>`;
  $('stats').innerHTML = [head, `Hodiny: <b>${r2(hours)}</b>`, `Svátek odpracovaný: <b>${r2(holWorkedH)} h</b>`].join('<br>');

  if(state.mode==='12'){
    $('substats').style.display='block';
    $('substats').innerHTML = [
      `<div class="payline"><span>Odpolední hodiny (D: 4.00, N: 4.25)</span><span><b>${r2(afterH)}</b> h</span></div>`,
      `<div class="payline"><span>Noční hodiny (22–6)</span><span><b>${r2(nightH)}</b> h</span></div>`,
      `<div class="payline"><span>Víkendové hodiny</span><span><b>${r2(weekendH)}</b> h</span></div>`
    ].join('');
  } else $('substats').style.display='none';

  state._calc={hours,afterH,nightH,weekendH,vac,holWorkedH,DAILY_WORKED,H8,VAC12,VAC8:8.0}; 
  save();
}

function avgRate(){
  const man = nval(state.avg.avg_manual||0);
  if(man>0) return man;
  const sNet=(state.avg.net1||0)+(state.avg.net2||0)+(state.avg.net3||0);
  const sH  =(state.avg.h1||0)+(state.avg.h2||0)+(state.avg.h3||0);
  return sH>0 ? sNet/sH : 0;
}
function updateAvgInfo(){
  const v = avgRate();
  $('avg_info').textContent = 'Průměrná náhrada: ' + money(v);
}

function calcPay(){
  const avg=avgRate(); updateAvgInfo();
  const C=state._calc||{hours:0,afterH:0,nightH:0,weekendH:0,vac:0,holWorkedH:0,DAILY_WORKED:12.25,H8:8.0,VAC12:11.25,VAC8:8.0};
  const r={
    base:nval(state.rates['rate_base']), odpo:nval(state.rates['rate_odpo']),
    noc:nval(state.rates['rate_noc']), vikend:nval(state.rates['rate_vikend']),
    nepretrzity:nval(state.rates['rate_nepretrzity'])
  };

  const basePay = r.base * C.hours;
  const odpoPay = r.odpo * C.afterH;
  const nightPay= r.noc  * C.nightH;
  const wkPay   = r.vikend * C.weekendH;
  const holPay  = avg * C.holWorkedH;
  const nepret  = r.nepretrzity * C.hours;
  const prime   = basePay * ((state.bonus_pct||0)/100);
  const vacHours = (state.mode==='8' ? C.VAC8 : C.VAC12);
  const vacPay  = vacHours * avg * C.vac;

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

  const gross = basePay+odpoPay+nightPay+wkPay+holPay+nepret+prime+vacPay + (state.annual_bonus||0);
  const social=gross*0.065, health=gross*0.045;
  const tax=Math.max(0,(gross-social-health)*0.15-2570);
  const netBeforeMeals=gross-social-health-tax;
  const net=netBeforeMeals - (mealDeduct + lunchDeduct);

  const caf = state.cafeteria_ok ? 1000 : 0;

  $('pay').innerHTML = [
    ['Základ',money(basePay)],['Odpolední',money(odpoPay)],['Noční',money(nightPay)],
    ['Víkend',money(wkPay)],['Svátek (průměr × hodiny)',money(holPay)],['Nepřetržitý provoz',money(nepret)],
    ['Přímé prémie ('+(state.bonus_pct||0)+'%)',money(prime)],['Náhrada za dovolenou',money(vacPay)],
    ['Roční motivační',money(state.annual_bonus||0)],
    ['Srážka stravenky','− '+money(mealDeduct)],['Srážka obědy','− '+money(lunchDeduct)]
  ].map(([k,v])=>`<div class="payline"><span>${k}</span><span><b>${v}</b></span></div>`).join('');

  $('gross').textContent = '💼 Hrubá mzda: ' + money(gross);
  $('net').textContent   = '💵 Čistá mzda (odhad): ' + money(net);
  $('meal').textContent  = '🍽️ Stravenky: ' + money(mealValue);
  $('cafInfo').textContent = '🎁 Cafeterie (mimo čistou): ' + money(caf);
}

function renderCalendar(){
  document.body.classList.toggle('mode8', state.mode==='8');
  applyBackground();

  const y=current.getFullYear(), m=current.getMonth();
  $('monthLabel').textContent=new Date(y,m).toLocaleString('cs-CZ',{month:'long',year:'numeric'});
  const total=daysIn(y,m), start=firstDay(y,m)-1;

  const todayKey = ymd(new Date());
  let html=`<thead><tr>${["Po","Út","St","Čt","Pá","So","Ne"].map(d=>`<th>${d}</th>`).join("")}</tr></thead><tbody>`;
  let day=1;
  for(let r=0;r<6;r++){
    html+="<tr>";
    for(let c=0;c<7;c++){
      if((r===0&&c<start) || day>total){ html+="<td></td>"; continue; }
      const dt=new Date(y,m,day), key=ymd(dt), t=state.shifts[key]||"";
      const classes=[t]; 
      if(selectedDate===key) classes.push('selected');
      if(key===todayKey) classes.push('today');
      html+=`<td data-date="${key}" class="${classes.join(' ')}">
               <div class="daynum">${day}${isHoliday(dt)?' 🎌':''}</div>
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

  updateStats(); updateHeader(); bindInputsOnce(); calcPay();
}

renderCalendar();
// === ⚙️ Panel Nastavení ===
const settingsButton = document.getElementById('settingsButton');
const settingsPanel = document.getElementById('settingsPanel');
const saveSettingsBtn = document.getElementById('saveSettings');
const closeSettingsBtn = document.getElementById('closeSettings');

settingsButton.addEventListener('click', () => {
  settingsPanel.style.display = 'block';
});
closeSettingsBtn.addEventListener('click', () => {
  settingsPanel.style.display = 'none';
});

// Uložení do localStorage
saveSettingsBtn.addEventListener('click', () => {
  const settings = {
    language: document.getElementById('language').value,
    currency: document.getElementById('currency').value,
    taxLocale: document.getElementById('taxLocale').value,
    shiftLength: parseFloat(document.getElementById('shiftLength').value),
    mealTicketsPerShift: parseInt(document.getElementById('mealTicketsPerShift').value),
    ticketValue: parseFloat(document.getElementById('ticketValue').value),
    mealsTaken: parseInt(document.getElementById('mealsTaken').value),
    mealsNotTaken: parseInt(document.getElementById('mealsNotTaken').value),
    managerBonus: parseFloat(document.getElementById('managerBonus').value),
    annualBonus: parseFloat(document.getElementById('annualBonus').value)
  };
  localStorage.setItem('smenarekSettings', JSON.stringify(settings));
  applySettings(settings);
  settingsPanel.style.display = 'none';
  alert('✅ Nastavení uloženo');
});

// Načtení při startu
window.addEventListener('load', () => {
  const saved = JSON.parse(localStorage.getItem('smenarekSettings'));
  if (saved) applySettings(saved);
});

function applySettings(s) {
  if (!s) return;
  // Daňové výpočty
  const taxes = {
    cz: { soc: 6.5, zdr: 4.5, tax: 15, mult: 1.34 },
    de: { soc: 9.3, zdr: 7.3, tax: 18, mult: 1.0 },
    uk: { soc: 8, zdr: 0, tax: 20, mult: 1.0 }
  };
  const t = taxes[s.taxLocale];
  window.activeTaxes = t;

  // Měna
  window.activeCurrency = s.currency;
  window.shiftLength = s.shiftLength;
  window.ticketValue = s.ticketValue;
  window.mealTicketsPerShift = s.mealTicketsPerShift;
  window.managerBonus = s.managerBonus;
  window.annualBonus = s.annualBonus;

  // Přepočet čisté mzdy (zjednodušený)
  if (typeof recalculateWage === 'function') recalculateWage();
}

// Příklad – můžeš upravit podle své kalkulace
function recalculateWage() {
  const base = window.baseWage || 0;
  const t = window.activeTaxes || { soc:6.5,zdr:4.5,tax:15,mult:1.34 };
  const superGross = base * t.mult;
  const deductions = (superGross * (t.tax/100)) + (base*(t.soc/100)) + (base*(t.zdr/100));
  const net = base - deductions;
  console.log("Čistá mzda:", net.toFixed(2), window.activeCurrency || "Kč");
}
/* ======= Směnářek 1.9.3 – i18n + měna + (volitelně) daňová lokalita ======= */
(function initI18N() {
  // 1) Slovník klíčů (odpovídají data-i18n v index.html)
  const I18N = {
    cs: {
      title:"Směnářek",
      today:"Dnes:",
      nameday:"Svátek:",
      btnToday:"Dnes",
      btnClear:"Vymazat den",
      calendar:"Kalendář",
      calHelpTitle:"Jak používat kalendář",
      calHelpBody:"Klepni na den pro přepnutí směny (D/N/V/R). Dlouhý stisk = smazat. Šipkami měníš měsíc, „Dnes“ skočí na aktuální datum.",
      settings:"Nastavení",
      settingsHelpTitle:"Nastavení aplikace",
      settingsHelpBody:"Zvol režim směn (12h nebo 8h), jazyk a měnu. Změny se uloží do zařízení.",
      shiftMode:"Režim směn:",
      mode12:"12 h (D/N/V)",
      mode8:"8 h (R/O/N/V)",
      language:"Jazyk:",
      currency:"Měna:",
      monthStats:"Statistiky měsíce",
      rules:"Obědy jen všední den při denní (12h: D; 8h: R). Dovolená = nastavené hodiny/den. Svátek: směna + průměr.",
      wageInputs:"Mzda (vstupy)",
      baseRate:"Základní hodinovka",
      aftBonus:"Odpolední příplatek",
      nightBonus:"Noční příplatek",
      weekendBonus:"Víkendový příplatek",
      holidayWorked:"Svátek (Kč/h) – odpracovaný",
      continuousBonus:"Nepřetržitý provoz",
      directBonus:"Přímé prémie (%)",
      cafeteriaBonus:"Docházkový bonus (Cafeterie 1000 Kč – mimo čistou)",
      annualMotiv:"Roční motivační (Kč)",
      vacPerDay:"Dovolená (hod/den)",
      avgHeader:"Průměrná náhrada (poslední 3 měsíce)",
      avgHelpTitle:"Jak počítáme průměr",
      avgHelpBody:"Zadej čisté mzdy a odpracované hodiny za poslední 3 měsíce nebo ručně vyplň průměr (Kč/h). Výsledek se použije pro svátky a dovolenou.",
      netM1:"Čistá mzda M-1", netM2:"Čistá mzda M-2", netM3:"Čistá mzda M-3",
      hoursM1:"Hodiny M-1", hoursM2:"Hodiny M-2", hoursM3:"Hodiny M-3",
      manualAvg:"Ručně zadaná průměrná náhrada (Kč/h)",
      avgResult:"Průměrná náhrada:",
      gross:"Hrubá mzda:",
      netEst:"Čistá mzda (odhad):",
      vouchers:"Stravenky:",
      cafeteriaOut:"Cafeterie (mimo čistou):"
    },
    en: {
      title:"Shifty",
      today:"Today:",
      nameday:"Name day:",
      btnToday:"Today",
      btnClear:"Clear day",
      calendar:"Calendar",
      calHelpTitle:"How to use the calendar",
      calHelpBody:"Tap a day to toggle shift (D/N/V/R). Long-press = clear. Arrows change month, “Today” jumps to current date.",
      settings:"Settings",
      settingsHelpTitle:"App settings",
      settingsHelpBody:"Choose shift mode (12h or 8h), language and currency. Changes are saved to your device.",
      shiftMode:"Shift mode:",
      mode12:"12 h (D/N/V)",
      mode8:"8 h (R/O/N/V)",
      language:"Language:",
      currency:"Currency:",
      monthStats:"Month statistics",
      rules:"Meals only on weekdays for day shift (12h: D; 8h: R). Vacation = configured hours/day. Holiday: shift + average.",
      wageInputs:"Wage (inputs)",
      baseRate:"Base hourly rate",
      aftBonus:"Afternoon bonus",
      nightBonus:"Night bonus",
      weekendBonus:"Weekend bonus",
      holidayWorked:"Holiday (per hour) – worked",
      continuousBonus:"Continuous operation",
      directBonus:"Direct bonus (%)",
      cafeteriaBonus:"Attendance bonus (Cafeteria 1000 – outside net)",
      annualMotiv:"Annual motivational (amount)",
      vacPerDay:"Vacation (hours/day)",
      avgHeader:"Average compensation (last 3 months)",
      avgHelpTitle:"How the average is calculated",
      avgHelpBody:"Enter net wages and hours for last 3 months or fill manual average (per hour). Used for holidays and vacation.",
      netM1:"Net M-1", netM2:"Net M-2", netM3:"Net M-3",
      hoursM1:"Hours M-1", hoursM2:"Hours M-2", hoursM3:"Hours M-3",
      manualAvg:"Manual average compensation (per hour)",
      avgResult:"Average compensation:",
      gross:"Gross wage:",
      netEst:"Net wage (estimate):",
      vouchers:"Meal vouchers:",
      cafeteriaOut:"Cafeteria (outside net):"
    },
    de: {
      title:"Schichtler",
      today:"Heute:",
      nameday:"Namenstag:",
      btnToday:"Heute",
      btnClear:"Tag löschen",
      calendar:"Kalender",
      calHelpTitle:"Kalender benutzen",
      calHelpBody:"Tippe auf einen Tag zum Wechseln (D/N/V/R). Langdruck = löschen. Pfeile wechseln den Monat, „Heute“ springt zum aktuellen Datum.",
      settings:"Einstellungen",
      settingsHelpTitle:"App-Einstellungen",
      settingsHelpBody:"Wähle Schichtmodus (12h oder 8h), Sprache und Währung. Änderungen werden lokal gespeichert.",
      shiftMode:"Schichtmodus:",
      mode12:"12 h (D/N/V)",
      mode8:"8 h (R/O/N/V)",
      language:"Sprache:",
      currency:"Währung:",
      monthStats:"Monatsstatistik",
      rules:"Essen nur werktags bei Tagschicht (12h: D; 8h: R). Urlaub = konfigurierte Stunden/Tag. Feiertag: Schicht + Durchschnitt.",
      wageInputs:"Lohn (Eingaben)",
      baseRate:"Grundstundensatz",
      aftBonus:"Spätschicht-Zuschlag",
      nightBonus:"Nachtschicht-Zuschlag",
      weekendBonus:"Wochenend-Zuschlag",
      holidayWorked:"Feiertag (pro Std) – gearbeitet",
      continuousBonus:"Kontinuierlicher Betrieb",
      directBonus:"Direktprämie (%)",
      cafeteriaBonus:"Anwesenheitsbonus (Cafeteria 1000 – außerhalb netto)",
      annualMotiv:"Jährlicher Bonus (Betrag)",
      vacPerDay:"Urlaub (Std/Tag)",
      avgHeader:"Durchschnittsausgleich (letzte 3 Monate)",
      avgHelpTitle:"So berechnen wir den Durchschnitt",
      avgHelpBody:"Gib Nettolöhne und Stunden der letzten 3 Monate ein oder den manuellen Durchschnitt (pro Std). Für Feiertage/Urlaub verwendet.",
      netM1:"Netto M-1", netM2:"Netto M-2", netM3:"Netto M-3",
      hoursM1:"Stunden M-1", hoursM2:"Stunden M-2", hoursM3:"Stunden M-3",
      manualAvg:"Manueller Durchschnitt (pro Std)",
      avgResult:"Durchschnitt:",
      gross:"Bruttolohn:",
      netEst:"Nettolohn (Schätzung):",
      vouchers:"Essensmarken:",
      cafeteriaOut:"Cafeteria (außerhalb netto):"
    }
  };

  // 2) Měny
  const CURRENCY_FMT = {
    CZK: { locale: 'cs-CZ', code: 'CZK' },
    EUR: { locale: 'de-DE', code: 'EUR' },
    USD: { locale: 'en-US', code: 'USD' }
  };
  window.fmtCurrency = function(amount, code) {
    const c = code || (window.activeCurrency || 'CZK');
    const cfg = CURRENCY_FMT[c] || CURRENCY_FMT.CZK;
    try { return new Intl.NumberFormat(cfg.locale, { style:'currency', currency: cfg.code }).format(+amount||0); }
    catch { return ((+amount||0).toFixed(2) + ' ' + (cfg.code)); }
  };

  // 3) Aplikace překladu
  function applyLanguage(lang) {
    const dict = I18N[lang] || I18N.cs;
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const k = el.getAttribute('data-i18n');
      if (dict[k] != null) el.textContent = dict[k];
    });
    document.title = dict.title || 'Směnářek';
  }

  // 4) Načtení/uložení nastavení (jazyk, měna, (volitelně) daňová lokalita)
  function readSettings() {
    try { return JSON.parse(localStorage.getItem('smenarekSettings') || '{}'); }
    catch { return {}; }
  }
  function writeSettings(s) {
    localStorage.setItem('smenarekSettings', JSON.stringify(s||{}));
  }

  function applySettingsToUI(s) {
    // Jazyk + měna
    const lang = s.language || 'cs';
    const cur  = s.currency || (lang==='de' ? 'EUR' : 'CZK');
    window.activeCurrency = cur;
    applyLanguage(lang);

    // Volitelně daňová lokalita (když máš <select id="taxLocale">)
    if (s.taxLocale) window.taxLocale = s.taxLocale;

    // Po přepnutí přepočítej výstupy, pokud máš funkce:
    if (typeof window.renderResults === 'function') window.renderResults();
    else if (typeof window.recalculateWage === 'function') window.recalculateWage();
  }

  // 5) Injektuj listenery na selecty (pokud existují)
  function bindControls() {
    const langSel = document.getElementById('langSelect');
    const curSel  = document.getElementById('currencySelect');
    const taxSel  = document.getElementById('taxLocale'); // může i nebýt

    if (langSel) langSel.addEventListener('change', e => {
      const s = readSettings(); s.language = e.target.value; writeSettings(s); applySettingsToUI(s);
    });
    if (curSel) curSel.addEventListener('change', e => {
      const s = readSettings(); s.currency = e.target.value; writeSettings(s); applySettingsToUI(s);
    });
    if (taxSel) taxSel.addEventListener('change', e => {
      const s = readSettings(); s.taxLocale = e.target.value; writeSettings(s); applySettingsToUI(s);
    });
  }

  // 6) Start
  window.addEventListener('DOMContentLoaded', () => {
    bindControls();
    const saved = readSettings();

    // Výchozí měna podle jazyka (DE → EUR, jinak CZK), pokud není uloženo
    if (!saved.language) saved.language = 'cs';
    if (!saved.currency) saved.currency = (saved.language==='de') ? 'EUR' : 'CZK';

    writeSettings(saved);
    applySettingsToUI(saved);
  });
})();
