// Směnářek 1.0 — CZ PWA s výpočtem hrubé/čisté mzdy
const TIMES = { D:{start:"05:45",end:"18:00",breakHours:1,lunch:true}, N:{start:"17:45",end:"06:00",breakHours:1,lunch:false} };
let state = JSON.parse(localStorage.getItem('smenarek_state')||'{}');
if(!state.shifts) state.shifts={};
if(!state.lockedMonths) state.lockedMonths={};
if(!state.rates) state.rates={};
let current = new Date(); let selectedDate=null; let deferredPrompt=null;
const $=id=>document.getElementById(id);

function ymd(d){return d.toISOString().slice(0,10)} function ym(d){return d.toISOString().slice(0,7)}
function daysInMonth(y,m){return new Date(y,m+1,0).getDate()} function firstDay(y,m){return new Date(y,m,1).getDay()||7}
function isWeekend(d){const k=d.getDay(); return k===0||k===6;}
function isHoliday(d){ return ["01-01","05-01","05-08","07-05","07-06","09-28","10-28","11-17","12-24","12-25","12-26"].includes(d.toISOString().slice(5,10)); }

function round2(x){return Math.round(x*100)/100}
function parseNum(v){const n=parseFloat(v); return isNaN(n)?0:n;}

function hoursFor(t){
  if(!t) return {total:0,night:0,afternoon:0};
  const c=TIMES[t];
  const [sh,sm]=c.start.split(':').map(Number), [eh,em]=c.end.split(':').map(Number);
  const s=new Date(2000,0,1,sh,sm), e=new Date(2000,0,(eh<sh||(eh===sh&&em<sm))?2:1,eh,em);
  const total=((e-s)-c.breakHours*3600000)/3600000;
  const ov=(h1,m1,h2,m2)=>{const a1=new Date(2000,0,1,h1,m1), a2=new Date(2000,0,(h2<h1||(h2===h1&&m2<m1))?2:1,h2,m2); const st=Math.max(s,a1), en=Math.min(e,a2); return Math.max(0,(en-st)/3600000)};
  const night=ov(22,0,24,0)+ov(0,0,6,0);
  const afternoon=ov(14,0,22,0);
  return { total:round2(total), night:round2(night), afternoon:round2(afternoon) };
}

function renderCalendar(){
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
        const d=new Date(y,m,day), key=ymd(d), type=state.shifts[key]||"";
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
      const lm = ym(new Date(selectedDate));
      if(state.lockedMonths[lm]) return alert('Tento měsíc je zamčený.');
      const cur = state.shifts[key]||"";
      const next = cur==="" ? "D" : cur==="D" ? "N" : "";
      setShift(key, next, false);
      renderCalendar();
    });
  });

  updateStats();
  updateWidget();
  calcPay();
}

function setShift(dateStr, t, rerender=true){
  if(t==='D'||t==='N'||t===''){
    if(t==='') delete state.shifts[dateStr];
    else state.shifts[dateStr]=t;
    save();
    if(rerender) renderCalendar();
  }
}

function save(){ localStorage.setItem('smenarek_state', JSON.stringify(state)); }

function updateStats(){
  const y=current.getFullYear(), m=current.getMonth(), end=new Date(y,m+1,0);
  let dCnt=0,nCnt=0,h=0,nh=0,lunches=0;
  for(let i=1;i<=end.getDate();i++){
    const key=ymd(new Date(y,m,i)), t=state.shifts[key];
    if(!t) continue;
    const w=hoursFor(t);
    h+=w.total; nh+=w.night;
    if(t==='D'){ dCnt++; lunches++; } else nCnt++;
  }
  $('stats').innerHTML=`Dny: <b>${dCnt}</b> • Noci: <b>${nCnt}</b><br>Hodiny: <b>${round2(h)}</b> • Noční: <b>${round2(nh)}</b><br>Obědy (jen D): <b>${lunches}</b>`;
}

function updateWidget(){
  const t=state.shifts[ymd(new Date())]||'—';
  $('widget').textContent=(t==='D'?'Dnes: D 05:45–18:00':t==='N'?'Dnes: N 17:45–06:00':'Dnes: —');
}

// Controls
$('prev').onclick=()=>{ current.setMonth(current.getMonth()-1); selectedDate=null; renderCalendar(); };
$('next').onclick=()=>{ current.setMonth(current.getMonth()+1); selectedDate=null; renderCalendar(); };
$('setToday').onclick=()=>{
  const k=ymd(new Date());
  const cur=state.shifts[k]||'';
  const next = cur==="" ? "D" : cur==="D" ? "N" : "";
  setShift(k,next);
};
$('clearDay').onclick=()=>{
  if(!selectedDate) return alert('Klepni nejdřív na den.');
  setShift(selectedDate,'');
};

// Batch
$('applyBatch').onclick=()=>{
  const t = $('batchType').value, a=$('batchFrom').value, b=$('batchTo').value;
  if(!a||!b) return alert('Vyplň od-do.');
  for(let d=new Date(a); d<=new Date(b); d.setDate(d.getDate()+1)){
    const k=ymd(d);
    if(state.lockedMonths[ym(d)]) continue;
    setShift(k,t,false);
  }
  save(); renderCalendar();
};

// Pattern
$('applyPattern').onclick=()=>{
  const s=$('pattern').value.trim().toUpperCase().replace(/[^DNO]/g,''), start=$('patternStart').value;
  if(!s||!start) return alert('Vyplň vzor a datum.');
  let d=new Date(start);
  for(const ch of s){
    const k=ymd(d);
    setShift(k, (ch==='D'||ch==='N')?ch:'', false);
    d.setDate(d.getDate()+1);
  }
  save(); renderCalendar();
};

// Import text
$('applyImport').onclick=()=>{
  const raw=$('raw').value.trim(); if(!raw) return;
  for(const line of raw.split(/\r?\n/)){
    const [date, code] = line.trim().split(/\s+/);
    if(!date||!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const c=(code||'').toUpperCase();
    setShift(date,(c==='D'||c==='N')?c:'', false);
  }
  save(); renderCalendar();
};

// Lock month
$('lockMonth').onclick=()=>{
  const k=ym(current);
  state.lockedMonths[k] = !state.lockedMonths[k];
  save();
  alert((state.lockedMonths[k]?'Zamčeno: ':'Odemčeno: ')+k);
  renderCalendar();
};

// Export/Import
$('export').onclick=()=>{
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download='smenarek-export.json'; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$('import').onchange=async e=>{
  const f=e.target.files[0]; if(!f) return;
  const text=await f.text();
  try{ const obj=JSON.parse(text); if(obj&&obj.shifts){ state=obj; save(); renderCalendar(); } }
  catch{ alert('Neplatný JSON'); }
};

// Wage inputs bind
['rate_base','rate_odpo','rate_noc','rate_vikend','rate_svatek','rate_nepretrzity','vac_hours','bonus_prime','meal_value'].forEach(id=>{
  const el=$(id); el.value = (state.rates[id]!==undefined && state.rates[id]!==null) ? state.rates[id] : '';
  el.addEventListener('input', ()=>{ state.rates[id]=el.value===''?null:parseFloat(el.value); save(); calcPay(); });
});

function money(x){ return (Math.round((x||0)*100)/100).toLocaleString('cs-CZ',{minimumFractionDigits:2, maximumFractionDigits:2}) + ' Kč'; }

function calcPay(){
  const y=current.getFullYear(), m=current.getMonth(), end=new Date(y,m+1,0);
  let totalH=0, nightH=0, afterH=0, weekendH=0, holidayH=0, dDays=0, nDays=0, dayWeekendDays=0;
  for(let i=1;i<=end.getDate();i++){
    const date=new Date(y,m,i), key=ymd(date), t=state.shifts[key]; if(!t) continue;
    const w=hoursFor(t);
    totalH+=w.total; nightH+=w.night; afterH+=w.afternoon;
    if(isWeekend(date)) weekendH+=w.total;
    if(isHoliday(date)) holidayH+=w.total;
    if(t==='D'){ dDays++; if(isWeekend(date)) dayWeekendDays++; }
    if(t==='N'){ nDays++; }
  }
  const r = {
    base: parseFloat(($('rate_base').value)||0),
    odpo: parseFloat(($('rate_odpo').value)||0),
    noc: parseFloat(($('rate_noc').value)||0),
    vikend: parseFloat(($('rate_vikend').value)||0),
    svatek: parseFloat(($('rate_svatek').value)||0),
    nepretrzity: parseFloat(($('rate_nepretrzity').value)||0),
    vac_hours: parseFloat(($('vac_hours').value)||0),
    bonus: parseFloat(($('bonus_prime').value)||0),
    meal_value: parseFloat(($('meal_value').value)||0),
  };
  const weekdayDay = dDays - dayWeekendDays;
  const mealCount = nDays*2 + dayWeekendDays*2 + weekdayDay*1;
  const mealTotal = mealCount * r.meal_value;

  const basePay = r.base * (totalH + r.vac_hours);
  const odpoPay = r.odpo * afterH;
  const nightPay = r.noc * nightH;
  const weekendPay = r.vikend * weekendH;
  const holidayPay = r.svatek * holidayH;
  const nepretPay = r.nepretrzity * totalH;
  const gross = basePay + odpoPay + nightPay + weekendPay + holidayPay + nepretPay + r.bonus + mealTotal;

  const social = gross * 0.065;
  const health = gross * 0.045;
  let taxBase = gross - social - health;
  let tax = taxBase * 0.15;
  tax = max0(tax - 2570); // sleva poplatníka
  const net = gross - social - health - tax;

  const rows = [
  ['Základ', money(basePay)],
  ['Odpolední', money(odpoPay)],
  ['Noční', money(nightPay)],
  ['Víkend', money(weekendPay)],
  ['Svátek', money(holidayPay)],
  ['Nepřetržitý provoz', money(nepretPay)],
  ['Prémie (přímé)', money(r.bonus)],
  ['Stravenky', `${money(mealTotal)}  (${mealCount} ks)`],
];
  $('pay').innerHTML = rows.map(([k,v])=>`<div class="tot"><span>${k}</span><span>${v}</span></div>`).join('');
  $('net').innerHTML = `<div class="bigline hruba"><span>💰 Hrubá mzda</span><span>${money(gross)}</span></div>
  <div class="bigline cista"><span>💵 Čistá mzda (odhad)</span><span>${money(net)}</span></div>`;
}
function max0(x){ return x<0?0:x; }

// PWA install & SW
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault(); deferredPrompt=e;});
$('install').onclick=async()=>{ if(deferredPrompt){ deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; } else alert('V menu prohlížeče zvol "Přidat na plochu".'); };
if('serviceWorker' in navigator){ window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js')); }

renderCalendar();
calcPay();
