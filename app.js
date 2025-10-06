// Směnářek 1.5 — 12h/8h režim, barva kalendáře, info modaly, prémie %, ruční průměr, svátek auto + průměr, fix lokálního dne
const HOLIDAYS = new Set(["01-01","05-01","05-08","07-05","07-06","09-28","10-28","11-17","12-24","12-25","12-26"]);
const MEAL_DEDUCT = 40, LUNCH_DEDUCT = 40, MEAL_INFO_VALUE = 110;

const TIMES12 = { D:{start:"05:45",end:"18:00",breakHours:1,lunch:true} , N:{start:"17:45",end:"06:00",breakHours:1,lunch:false} };
const TIMES8  = { R:{start:"06:00",end:"14:00",breakHours:0.5,lunch:true}, O:{start:"14:00",end:"22:00",breakHours:0.5,lunch:true}, N:{start:"22:00",end:"06:00",breakHours:0.5,lunch:false} };

let state = JSON.parse(localStorage.getItem('smenarek_state_v15')||'{}');
if(!state.shifts) state.shifts={};
if(!state.lockedMonths) state.lockedMonths={};
if(!state.rates) state.rates={};
if(state.bonus_pct==null) state.bonus_pct = 10;
if(!state.avg) state.avg={net1:null,h1:null,net2:null,h2:null,net3:null,h3:null, manual:null};
if(!state.mode) state.mode='12'; // '12' or '8'
let current = new Date(); let selectedDate=null; let deferredPrompt=null;

const $=id=>document.getElementById(id);

function pad(n){return n<10?'0'+n:n}
function ymdLocal(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
function ymLocal(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1); }
function daysInMonth(y,m){return new Date(y,m+1,0).getDate()}
function firstDay(y,m){let n=new Date(y,m,1).getDay(); return n===0?7:n}
function isWeekend(d){const k=d.getDay(); return k===0||k===6;}
function isHoliday(date){ const md=pad(date.getMonth()+1)+'-'+pad(date.getDate()); return HOLIDAYS.has(md); }
function round2(x){return Math.round(x*100)/100}
function parseNum(v){const n=parseFloat(v); return isNaN(n)?0:n;}
function money(x){ return (Math.round((x||0)*100)/100).toLocaleString('cs-CZ',{minimumFractionDigits:2, maximumFractionDigits:2}) + ' Kč'; }

function hoursFor(code){
  if(!code || code==='V') return {total:0,night:0,afternoon:0};
  const times = state.mode==='8'?TIMES8:TIMES12;
  const c=times[code];
  if(!c) return {total:0,night:0,afternoon:0};
  const [sh,sm]=c.start.split(':').map(Number), [eh,em]=c.end.split(':').map(Number);
  const cross = (eh<sh)||(eh===sh&&em<sm);
  const s=new Date(2000,0,1,sh,sm), e=new Date(2000,0,cross?2:1,eh,em);
  const total=((e-s)-c.breakHours*3600000)/3600000;
  const ov=(h1,m1,h2,m2)=>{const a1=new Date(2000,0,1,h1,m1), a2=new Date(2000,0,(h2<h1||(h2===h1&&m2<m1))?2:1,h2,m2); const st=Math.max(s,a1), en=Math.min(e,a2); return Math.max(0,(en-st)/3600000)};
  const night=ov(22,0,24,0)+ov(0,0,6,0);
  const afternoon=ov(14,0,22,0);
  return { total:round2(total), night:round2(night), afternoon:round2(afternoon) };
}

function renderCalendar(){
  document.body.classList.toggle('mode8', state.mode==='8');
  const y=current.getFullYear(), m=current.getMonth();
  $('monthLabel').textContent=new Date(y,m).toLocaleString('cs-CZ',{month:'long',year:'numeric'});
  const total=daysInMonth(y,m), start=firstDay(y,m)-1;
  let html=`<thead><tr>${["Po","Út","St","Čt","Pá","So","Ne"].map(d=>`<th>${d}</th>`).join("")}</tr></thead><tbody>`;
  let day=1;
  for(let r=0;r<6;r++){
    html+="<tr>";
    for(let c=0;c<7;c++){
      if(r===0&&c<start || day>total){ html+=`<td></td>`; }
      else {
        const d=new Date(y,m,day), key=ymdLocal(d), type=state.shifts[key]||"";
        const classes=[type];
        if(selectedDate===key) classes.push('selected');
        html+=`<td data-date="${key}" class="${classes.join(' ')}"><div class="daynum">${day}${isHoliday(d)?' 🎌':''}</div>${type?`<span class="badge">${type}</span>`:''}</td>`;
        day++;
      }
    }
    html+="</tr>";
  }
  html+="</tbody>";
  $('cal').innerHTML=html;

  $('cal').querySelectorAll('td[data-date]').forEach(cell=>{
    cell.addEventListener('click', ()=>{
      const key = cell.getAttribute('data-date');
      selectedDate = key;
      const lm = ymLocal(new Date(selectedDate));
      if(state.lockedMonths[lm]) return alert('Tento měsíc je zamčený.');
      const cur = state.shifts[key]||"";
      const next = nextCode(cur);
      setShift(key, next, false);
      renderCalendar();
    });
  });

  updateStats();
  updateWidget();
  calcPay();
}

function nextCode(cur){
  if(state.mode==='8'){
    return cur==="" ? "R" : cur==="R" ? "O" : cur==="O" ? "N" : cur==="N" ? "V" : "";
  } else {
    return cur==="" ? "D" : cur==="D" ? "N" : cur==="N" ? "V" : "";
  }
}

function setShift(dateStr, t, rerender=true){
  const valid = state.mode==='8' ? ['R','O','N','V',''] : ['D','N','V',''];
  if(!valid.includes(t)) return;
  if(t==='') delete state.shifts[dateStr];
  else state.shifts[dateStr]=t;
  save();
  if(rerender) renderCalendar();
}

function save(){ localStorage.setItem('smenarek_state_v15', JSON.stringify(state)); }

function updateStats(){
  const y=current.getFullYear(), m=current.getMonth(), end=new Date(y,m+1,0);
  let dDay=0, nDay=0, vac=0, hours=0, nightH=0, holWorkedH=0;
  let rDays=0, oDays=0, n8Days=0;
  for(let i=1;i<=end.getDate();i++){
    const date=new Date(y,m,i), key=ymdLocal(date), t=state.shifts[key];
    if(!t) continue;
    if(t==='V'){ vac++; continue; }
    const w=hoursFor(t); hours+=w.total; nightH+=w.night;
    if(state.mode==='8'){
      if(t==='R') rDays++;
      if(t==='O') oDays++;
      if(t==='N') n8Days++;
    } else {
      if(t==='D') dDay++;
      if(t==='N') nDay++;
    }
    if(isHoliday(date)) holWorkedH+=w.total;
  }
  const parts = state.mode==='8'
    ? [`Ranní: <b>${rDays}</b> • Odpolední: <b>${oDays}</b> • Noční: <b>${n8Days}</b> • Dovolené: <b>${vac}</b>`]
    : [`Denní: <b>${dDay}</b> • Noční: <b>${nDay}</b> • Dovolené: <b>${vac}</b>`];
  parts.push(`Hodiny: <b>${round2(hours)}</b> • Noční: <b>${round2(nightH)}</b>`);
  parts.push(`Svátek odpracovaný: <b>${round2(holWorkedH)} h</b>`);
  $('stats').innerHTML = parts.join('<br>');
}

function todayKey(){ return ymdLocal(new Date()); }
function updateWidget(){
  const t=state.shifts[todayKey()]||'—';
  const map = state.mode==='8'
    ? {R:'R 06:00–14:00', O:'O 14:00–22:00', N:'N 22:00–06:00', V:'Dovolená'}
    : {D:'D 05:45–18:00', N:'N 17:45–06:00', V:'Dovolená'};
  $('widget').textContent = t==='—' ? 'Dnes: —' : 'Dnes: ' + map[t];
}

// Controls
$('prev').onclick=()=>{ current.setMonth(current.getMonth()-1); selectedDate=null; renderCalendar(); };
$('next').onclick=()=>{ current.setMonth(current.getMonth()+1); selectedDate=null; renderCalendar(); };
$('setToday').onclick=()=>{
  const k=todayKey();
  const cur=state.shifts[k]||'';
  setShift(k, nextCode(cur));
};
$('clearDay').onclick=()=>{ if(!selectedDate) return alert('Klepni nejdřív na den.'); setShift(selectedDate,''); };

// Mode switches
$('mode12').onclick=()=>{ state.mode='12'; save(); renderCalendar(); };
$('mode8').onclick=()=>{ state.mode='8'; save(); renderCalendar(); };

// Inputs bind
['rate_base','rate_odpo','rate_noc','rate_vikend','rate_svatek','rate_nepretrzity','vac_hours_day'].forEach(id=>{
  const el=$(id); el.value = (state.rates[id]!==undefined && state.rates[id]!==null) ? state.rates[id] : '';
  el.addEventListener('input', ()=>{ state.rates[id]=el.value===''?null:parseNum(el.value); save(); calcPay(); });
});
$('bonus_pct').value = state.bonus_pct if state.bonus_pct is not None else 10;
$('bonus_pct').addEventListener('input', ()=>{ state.bonus_pct = parseNum($('bonus_pct').value||'0'); save(); calcPay(); });

['avg_net1','avg_h1','avg_net2','avg_h2','avg_net3','avg_h3','avg_manual'].forEach(id=>{
  const el=$(id); el.value = (state.avg[id]!==undefined && state.avg[id]!==null) ? state.avg[id] : '';
  el.addEventListener('input', ()=>{ state.avg[id]=el.value===''?null:parseNum(el.value); save(); calcPay(); });
});

function avgRate(){
  const man = state.avg.avg_manual||0;
  if(man>0) return man;
  const sNet = (state.avg.avg_net1||0)+(state.avg.avg_net2||0)+(state.avg.avg_net3||0);
  const sH   = (state.avg.avg_h1||0)+(state.avg.avg_h2||0)+(state.avg.avg_h3||0);
  return sH>0 ? sNet/sH : 0;
}

function calcPay(){
  const avg = avgRate();
  $('avg_info').textContent = 'Průměrná náhrada: ' + money(avg) + (state.avg.avg_manual? ' (ručně)' : '');

  const y=current.getFullYear(), m=current.getMonth(), end=new Date(y,m+1,0);
  let totalH=0, nightH=0, afterH=0, weekendH=0, dDays=0, nDays=0, vDays=0, dayWeekendDays=0, lunches=0, holWorkedH=0;
  let rWeekday=0, rWeekend=0, oWeekday=0, oWeekend=0, nCount=0;

  const vacPerDay = state.rates.vac_hours_day?parseNum(state.rates.vac_hours_day):8;

  for(let i=1;i<=end.getDate();i++){
    const date=new Date(y,m,i), key=ymdLocal(date), t=state.shifts[key]; if(!t) continue;
    if(t==='V'){ vDays++; totalH += vacPerDay; continue; }
    const w=hoursFor(t);
    totalH+=w.total; nightH+=w.night; afterH+=w.afternoon;

    const wk=isWeekend(date);
    if(wk) weekendH+=w.total;
    if(isHoliday(date)) holWorkedH+=w.total;

    if(state.mode==='12'){
      if(t==='D'){ dDays++; if(!wk) lunches++; if(wk) dayWeekendDays++; }
      if(t==='N'){ nDays++; nCount++; }
    } else {
      if(t==='R'){ if(!wk){ rWeekday++; lunches++; } else { rWeekend++; } }
      if(t==='O'){ if(!wk){ oWeekday++; lunches++; } else { oWeekend++; } }
      if(t==='N'){ nCount++; }
    }
  }

  let mealCount=0;
  if(state.mode==='12'){
    const weekdayDay = dDays - dayWeekendDays;
    mealCount = nDays*2 + dayWeekendDays*2 + Math.max(0,weekdayDay)*1;
  } else {
    const weekdayDay = rWeekday + oWeekday;
    const weekendDay = rWeekend + oWeekend;
    mealCount = nCount*2 + weekendDay*2 + Math.max(0,weekdayDay)*1;
  }
  const mealDeductTotal = mealCount * MEAL_DEDUCT;
  const lunchDeductTotal = lunches * LUNCH_DEDUCT;
  const mealInfoValueTotal = mealCount * MEAL_INFO_VALUE;

  const r = {
    base: parseNum(($('rate_base').value)),
    odpo: parseNum(($('rate_odpo').value)),
    noc: parseNum(($('rate_noc').value)),
    vikend: parseNum(($('rate_vikend').value)),
    svatek: parseNum(($('rate_svatek').value)),
    nepretrzity: parseNum(($('rate_nepretrzity').value)),
  };

  const basePay = r.base * totalH;
  const odpoPay = r.odpo * afterH;
  const nightPay = r.noc * nightH;
  const weekendPay = r.vikend * weekendH;
  const holWorkedPay = avg * holWorkedH; // svátek = příplatek navíc z průměru
  const nepretPay = r.nepretrzity * totalH;
  const prime = basePay * (parseNum(state.bonus_pct||10)/100);
  const vacAllowance = vDays * vacPerDay * avg;

  const gross = basePay + odpoPay + nightPay + weekendPay + holWorkedPay + nepretPay + prime + vacAllowance;

  const social = gross * 0.065;
  const health = gross * 0.045;
  let taxBase = gross - social - health;
  let tax = Math.max(0, taxBase * 0.15 - 2570);
  const netBeforeMeals = gross - social - health - tax;
  const net = netBeforeMeals - mealDeductTotal - lunchDeductTotal;

  const rows = [
    ['Základ (vč. dovolené v hodinách)', money(basePay)],
    ['Odpolední', money(odpoPay)],
    ['Noční', money(nightPay)],
    ['Víkend', money(weekendPay)],
    ['Svátek (průměr × sváteční hodiny)', money(holWorkedPay)],
    ['Nepřetržitý provoz', money(nepretPay)],
    ['Přímé prémie ('+(state.bonus_pct||10)+'%)', money(prime)],
    ['Náhrada za dovolenou (průměr)', money(vacAllowance)],
    ['Srážka stravenky', '− ' + money(mealDeductTotal)],
    ['Srážka obědy', '− ' + money(lunchDeductTotal)],
  ];
  $('pay').innerHTML = rows.map(([k,v])=>`<div class="tot"><span>${k}</span><span>${v}</span></div>`).join('');

  $('net').innerHTML = `
    <div class="bigline hruba"><span>💰 Hrubá mzda</span><span>${money(gross)}</span></div>
    <div class="result">💵 Čistá mzda (odhad): ${money(net)}</div>
    <div class="result">🍽️ Stravenky: ${money(mealInfoValueTotal)}</div>
  `;
}

// Help modals
const HELP = {
  cal: `<p><b>Kalendář</b></p>
        <p>Klepnutím na den střídáš typ směny. Aktuální den je zvýrazněný. Svátky (🎌) se poznají automaticky — když je označíš jako směnu, započítá se příplatek z průměru.</p>
        <p>Přepínačem dole zvol <b>12 h (D/N/V)</b> nebo <b>8 h (R/O/N/V)</b>. V 8h režimu se kalendář zbarví do fialova.</p>`,
  stats: `<p><b>Statistiky měsíce</b></p>
          <p>Součet směn, dovolených, hodin a svátků podle označení v kalendáři a zvoleného režimu (12h/8h).</p>`,
  pay: `<p><b>Mzda (vstupy)</b></p>
        <p>Zadej hodinovku a příplatky v Kč/h. <b>Přímé prémie</b> nastav v procentech (výchozí 10%). Svátek se počítá <b>navíc</b> jako průměrná náhrada × odpracované sváteční hodiny.</p>`,
  avg: `<p><b>Průměrná náhrada</b></p>
        <p>Vyplň čisté mzdy a hodiny za poslední 3 měsíce — vypočte se průměr (čistá/hod). Nebo zadej hodnotu ručně do pole <b>Ručně zadaná průměrná náhrada</b>, ta má přednost.</p>`
};
document.addEventListener('DOMContentLoaded', ()=>{
  document.querySelectorAll('.helptag').forEach(el=>{
    el.addEventListener('click', ()=>{
      const k = el.getAttribute('data-help');
      document.getElementById('modalTitle').textContent = 'Nápověda';
      document.getElementById('modalBody').innerHTML = HELP[k] || '';
      document.getElementById('modalBg').style.display='flex';
    });
  });
  document.getElementById('modalClose').onclick=()=>document.getElementById('modalBg').style.display='none';
  document.getElementById('modalBg').addEventListener('click', (e)=>{ if(e.target.id==='modalBg') document.getElementById('modalBg').style.display='none'; });
});

// PWA install & SW
let deferredPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault(); deferredPrompt=e;});
document.getElementById('install').onclick=async()=>{ if(deferredPrompt){ deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; } else alert('V menu prohlížeče zvol "Přidat na plochu".'); };
if('serviceWorker' in navigator){ window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js')); }

renderCalendar();
calcPay();
