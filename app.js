// Směnářek 1.4 — zjednodušený panel, obědy jen ve všední D, u čisté jen "Stravenky = částka"
const TIMES = { D:{start:"05:45",end:"18:00",breakHours:1,lunch:true}, N:{start:"17:45",end:"06:00",breakHours:1,lunch:false} };
const HOLIDAYS = new Set(["01-01","05-01","05-08","07-05","07-06","09-28","10-28","11-17","12-24","12-25","12-26"]);
const MEAL_DEDUCT = 40, LUNCH_DEDUCT = 40, MEAL_INFO_VALUE = 110;

let state = JSON.parse(localStorage.getItem('smenarek_state_v14')||'{}');
if(!state.shifts) state.shifts={};
if(!state.lockedMonths) state.lockedMonths={};
if(!state.rates) state.rates={};
if(!state.avg) state.avg={net1:null,h1:null,net2:null,h2:null,net3:null,h3:null};

let current = new Date(); let selectedDate=null; let deferredPrompt=null;
const $=id=>document.getElementById(id);

function ymd(d){return d.toISOString().slice(0,10)} function ym(d){return d.toISOString().slice(0,7)}
function daysInMonth(y,m){return new Date(y,m+1,0).getDate()} function firstDay(y,m){return new Date(y,m,1).getDay()||7}
function isWeekend(d){const k=d.getDay(); return k===0||k===6;}
function isHoliday(date){ const m=date.getMonth()+1, d=date.getDate(); const md=(m<10?"0":"")+m+"-"+(d<10?"0":"")+d; return HOLIDAYS.has(md); }
function round2(x){return Math.round(x*100)/100}
function parseNum(v){const n=parseFloat(v); return isNaN(n)?0:n;}
function money(x){ return (Math.round((x||0)*100)/100).toLocaleString('cs-CZ',{minimumFractionDigits:2, maximumFractionDigits:2}) + ' Kč'; }

function hoursFor(t){
  if(!t || t==='V') return {total:0,night:0,afternoon:0};
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
      const next = cur==="" ? "D" : cur==="D" ? "N" : cur==="N" ? "V" : "";
      setShift(key, next, false);
      renderCalendar();
    });
  });

  updateStats();
  updateWidget();
  calcPay();
}

function setShift(dateStr, t, rerender=true){
  if(t==='D'||t==='N'||t==='V'||t===''){
    if(t==='') delete state.shifts[dateStr];
    else state.shifts[dateStr]=t;
    save();
    if(rerender) renderCalendar();
  }
}

function save(){ localStorage.setItem('smenarek_state_v14', JSON.stringify(state)); }

function updateStats(){
  const y=current.getFullYear(), m=current.getMonth(), end=new Date(y,m+1,0);
  let dCnt=0,nCnt=0,vCnt=0,h=0,nh=0,lunches=0, holWorkedH=0, holIdleDays=0, dayWeekendDays=0;
  for(let i=1;i<=end.getDate();i++){
    const date=new Date(y,m,i), key=ymd(date), t=state.shifts[key];
    if(!t){ if(isHoliday(date)) holIdleDays++; continue; }
    if(t==='V'){ vCnt++; continue; }
    const w=hoursFor(t);
    h+=w.total; nh+=w.night;
    if(t==='D'){ dCnt++; if(notWeekend(date)) { lunches++; } if(isWeekend(date)) dayWeekendDays++; }
    if(t==='N'){ nCnt++; }
    if(isHoliday(date)){ holWorkedH+=w.total; }
  }
  const weekdayDay = dCnt - dayWeekendDays;
  const mealCount = nCnt*2 + dayWeekendDays*2 + max0(weekdayDay)*1;
  $('stats').innerHTML=`Dny: <b>${dCnt}</b> • Noci: <b>${nCnt}</b> • Dovolené: <b>${vCnt}</b><br>Hodiny: <b>${round2(h)}</b> • Noční: <b>${round2(nh)}</b><br>Svátek odpracovaný: <b>${round2(holWorkedH)} h</b> • Svátků neodprac.: <b>${holIdleDays}</b> dnů`;
}
function notWeekend(d){ const k=d.getDay(); return !(k===0||k===6); }
function max0(x){ return x<0?0:x; }

function updateWidget(){
  const t=state.shifts[ymd(new Date())]||'—';
  $('widget').textContent=(t==='D'?'Dnes: D 05:45–18:00':t==='N'?'Dnes: N 17:45–06:00':t==='V'?'Dnes: Dovolená':'Dnes: —');
}

// Inputs
['rate_base','rate_odpo','rate_noc','rate_vikend','rate_svatek','rate_nepretrzity','vac_hours_day'].forEach(id=>{
  const el=$(id); el.value = (state.rates[id]!==undefined && state.rates[id]!==null) ? state.rates[id] : '';
  el.addEventListener('input', ()=>{ state.rates[id]=el.value===''?null:parseNum(el.value); save(); calcPay(); });
});
['avg_net1','avg_h1','avg_net2','avg_h2','avg_net3','avg_h3'].forEach(id=>{
  const el=$(id); el.value = (state.avg[id]!==undefined && state.avg[id]!==null) ? state.avg[id] : '';
  el.addEventListener('input', ()=>{ state.avg[id]=el.value===''?null:parseNum(el.value); save(); calcPay(); });
});

function calcPay(){
  // Average allowance
  const n1=state.avg.avg_net1||0, n2=state.avg.avg_net2||0, n3=state.avg.avg_net3||0;
  const h1=state.avg.avg_h1||0,  h2=state.avg.avg_h2||0,  h3=state.avg.avg_h3||0;
  const sNet=n1+n2+n3, sH=h1+h2+h3;
  const avg = sH>0 ? sNet/sH : 0;
  $('avg_info').textContent='Průměrná náhrada: '+money(avg);

  const y=current.getFullYear(), m=current.getMonth(), end=new Date(y,m+1,0);
  let totalH=0, nightH=0, afterH=0, weekendH=0, dDays=0, nDays=0, vDays=0, dayWeekendDays=0, lunches=0, holWorkedH=0, holIdleDays=0;
  const vacPerDay = state.rates.vac_hours_day?parseNum(state.rates.vac_hours_day):8;

  for(let i=1;i<=end.getDate();i++){
    const date=new Date(y,m,i), key=ymd(date), t=state.shifts[key];
    if(!t){ if(isHoliday(date)) holIdleDays++; continue; }
    if(t==='V'){ vDays++; totalH += vacPerDay; continue; }
    const w=hoursFor(t);
    totalH+=w.total; nightH+=w.night; afterH+=w.afternoon;
    const wk=isWeekend(date);
    if(wk) weekendH+=w.total;
    if(isHoliday(date)) holWorkedH+=w.total;
    if(t==='D'){ dDays++; if(!wk) lunches++; if(wk) dayWeekendDays++; }
    if(t==='N'){ nDays++; }
  }

  // Vouchers and lunches
  const weekdayDay = dDays - dayWeekendDays;
  const mealCount = nDays*2 + dayWeekendDays*2 + max0(weekdayDay)*1;
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

  const basePay = r.base * totalH; // včetně dovolené
  const odpoPay = r.odpo * afterH;
  const nightPay = r.noc * nightH;
  const weekendPay = r.vikend * weekendH;
  const holWorkedPay = r.svatek * holWorkedH;
  const nepretPay = r.nepretrzity * totalH;
  const prime = basePay * 0.10;

  const vacAllowance = vDays * vacPerDay * avg;
  const holIdleAllowance = holIdleDays * vacPerDay * avg;

  const gross = basePay + odpoPay + nightPay + weekendPay + holWorkedPay + nepretPay + prime + vacAllowance + holIdleAllowance;

  const social = gross * 0.065;
  const health = gross * 0.045;
  let taxBase = gross - social - health;
  let tax = max0(taxBase * 0.15 - 2570);
  const netBeforeMeals = gross - social - health - tax;
  const net = netBeforeMeals - mealDeductTotal - lunchDeductTotal;

  const rows = [
    ['Základ (vč. dovolené v hodinách)', money(basePay)],
    ['Odpolední', money(odpoPay)],
    ['Noční', money(nightPay)],
    ['Víkend', money(weekendPay)],
    ['Svátek odpracovaný (příplatek)', money(holWorkedPay)],
    ['Nepřetržitý provoz', money(nepretPay)],
    ['Prémie 10% (z hodinovky)', money(prime)],
    ['Náhrada za dovolenou (průměr)', money(vacAllowance)],
    ['Náhrada za svátek neodpracovaný (průměr)', money(holIdleAllowance)],
    ['Srážka stravenky', '− ' + money(mealDeductTotal)],
    ['Srážka obědy', '− ' + money(lunchDeductTotal)],
  ];
  $('pay').innerHTML = rows.map(([k,v])=>`<div class="tot"><span>${k}</span><span>${v}</span></div>`).join('');

  $('net').innerHTML = `
    <div class="bigline hruba"><span>💰 Hrubá mzda</span><span>${money(gross)}</span></div>
    <div class="bigline cista">
      <span>💵 Čistá mzda (odhad)</span>
      <span>${money(net)} <span class="inline-bonus">+ Stravenky = ${money(mealInfoValueTotal)}</span></span>
    </div>
  `;
}

// PWA install & SW
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault(); deferredPrompt=e;});
$('install').onclick=async()=>{ if(deferredPrompt){ deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; } else alert('V menu prohlížeče zvol "Přidat na plochu".'); };
if('serviceWorker' in navigator){ window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js')); }

renderCalendar();
calcPay();
