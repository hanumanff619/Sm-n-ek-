// Směnářek 1.5.4 – fixy + jmeniny + pozadí dle režimu
const HOLIDAYS = new Set(["01-01","05-01","05-08","07-05","07-06","09-28","10-28","11-17","12-24","12-25","12-26"]);
const MEAL_DEDUCT = 40, LUNCH_DEDUCT = 40, MEAL_INFO_VALUE = 110;

let state = JSON.parse(localStorage.getItem('smenarek_state_v154')||'{}');
if(!state.shifts) state.shifts={};
if(!state.rates) state.rates={};
if(!state.mode) state.mode='12';
if(state.bonus_pct==null) state.bonus_pct=10;
if(state.cafeteria==null) state.cafeteria=0;
if(state.annual_bonus==null) state.annual_bonus=0;
if(!state.avg) state.avg={net1:null,h1:null,net2:null,h2:null,net3:null,h3:null,avg_manual:null};
if(!state.namedays) state.namedays={};
if(state.bgEnabled==null) state.bgEnabled=true;

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

function save(){ localStorage.setItem('smenarek_state_v154', JSON.stringify(state)); }

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

  updateStats(); updateHeader(); bindInputs(); calcPay();
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

function updateHeader(){
  const today = new Date(), key = ymd(today);
  const t = state.shifts[key]||'—';
  const map8 = {R:'R 06:00–14:00', O:'O 14:00–22:00', N:'N 22:00–06:00', V:'Dovolená'};
  const map12= {D:'D 05:45–18:00', N:'N 17:45–06:00', V:'Dovolená'};
  $('todayShift').textContent = 'Dnes: ' + (t==='—'?'—': (state.mode==='8'?map8[t]:map12[t]));
  const name = state.namedays[md(today)];
  $('todayNameday').textContent = 'Svátek: ' + (name||'—');
}

function applyBackground(){
  const layer=$('bg-layer'); if(!layer) return;
  if(!$('bgEnabled').checked){ layer.style.backgroundImage='none'; state.bgEnabled=false; save(); return; }
  state.bgEnabled=true; save();
  const url = state.mode==='8' ? 'backgrounds/bg_8h.jpg' : 'backgrounds/bg_12h.jpg';
  layer.style.backgroundImage = `url("${url}")`;
}

$('prev').onclick=()=>{ current.setMonth(current.getMonth()-1); selectedDate=null; renderCalendar(); };
$('next').onclick=()=>{ current.setMonth(current.getMonth()+1); selectedDate=null; renderCalendar(); };
$('setToday').onclick=()=>{ const k=ymd(new Date()); const cur=state.shifts[k]||''; setShift(k,nextCode(cur)); };
$('clearDay').onclick=()=>{ if(!selectedDate) return alert('Klepni nejdřív na den.'); setShift(selectedDate,''); };
$('mode12').onclick=()=>{ state.mode='12'; save(); renderCalendar(); };
$('mode8').onclick =()=>{ state.mode='8';  save(); renderCalendar(); };
$('bgEnabled').onchange=applyBackground;

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
