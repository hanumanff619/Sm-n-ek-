
// ====== Utilities ======
const fmt = (v, ccy='CZK') => {
  const map = {CZK:'cs-CZ', EUR:'de-DE', USD:'en-US'};
  return new Intl.NumberFormat(map[ccy]||'cs-CZ',{style:'currency',currency:ccy}).format(v||0);
};
const $ = sel => document.querySelector(sel);

// ====== State (very light persistence) ======
const ST_KEY='smenarek_v2_settings';
const DEF = {
  mode:'12',
  ccy:'CZK', lang:'cs',
  base:185, direct:10,
  b_af:10, b_night:25, b_wk:35, b_cont:4,
  hol:259.09,
  yearBonus:1000,
  meal:40, voucher_emp:110, voucher_ded:40,
  v_day:1, v_night:2
};
let ST = {...DEF, ...(JSON.parse(localStorage.getItem(ST_KEY)||'{}'))};

// ====== Calendar model ======
let current = new Date();
current.setDate(1);

const weeks = ['Po','Út','St','Čt','Pá','So','Ne'];
const namedays = {}; // (optional) filled from namedays_cs.json if present

async function loadNameDays(){
  try{
    const r= await fetch('namedays_cs.json'); const j= await r.json();
    Object.assign(namedays, j||{});
  }catch(e){/* okay */}
}

// ====== Shift Engine from spec ======
const MIN = h => Math.round(h*60);
const HRS = m => m/60;
function overlapMin(s1,e1,s2,e2){ const s=Math.max(s1,s2),e=Math.min(e1,e2); return Math.max(0,e-s); }
function overlapSegment(startH,endH, segS,segE){
  const sM=MIN(startH), eM=MIN(endH);
  const a=MIN(segS), b=MIN(segE>=segS?segE:segE+24);
  if(eM<=MIN(24)) return overlapMin(sM,eM,a,b);
  return overlapMin(sM,MIN(24),a,b)+overlapMin(MIN(24),eM,a+MIN(24),b+MIN(24));
}
function weekendMinutes(startH,endH, weekday){
  const sM=MIN(startH), eM=MIN(endH);
  const parts=[];
  if(eM<=MIN(24)) parts.push({day:weekday,s:sM,e:eM});
  else {parts.push({day:weekday,s:sM,e:MIN(24)}); parts.push({day:(weekday+1)%7,s:0,e:eM-MIN(24)});}
  let total=0;
  for(const p of parts){ const wk=(p.day===5||p.day===6); if(wk) total+= (p.e-p.s); }
  return total;
}
function hoursForShift12(code, weekday){
  if(code==='V') return {total:11.25,af:0,ni:0,wk:0,vac:11.25,hol:0};
  let s=0,e=0;
  if(code==='D'){ s=5.75; e=18.00; }
  else if(code==='N'){ s=17.75; e=30.00; }
  else return {total:0,af:0,ni:0,wk:0,vac:0,hol:0};
  const af=HRS(overlapSegment(s,e,14,22));
  const ni=HRS(overlapSegment(s,e,22,30));
  const wk=HRS(weekendMinutes(s,e,weekday));
  const total=(code==='D')?11.25:12.25;
  return {total,af,ni,wk,vac:0,hol:0};
}
function holidayHours(code, weekday, isHoliday){
  if(!isHoliday) return 0;
  if(code==='D') return 11.25;
  if(code==='N') return 2; // 22-24
  if(code==='V') return 0;
  return 0;
}
function calcMonth(days, rates){
  let H={total:0,af:0,ni:0,wk:0,vac:0,hol:0};
  for(const d of days){
    const h=hoursForShift12(d.code,d.weekday);
    h.hol=holidayHours(d.code,d.weekday,d.isHoliday);
    H.total+=h.total; H.af+=h.af; H.ni+=h.ni; H.wk+=h.wk; H.vac+=h.vac; H.hol+=h.hol;
  }
  const payAf = H.af * (rates.b_af||0);
  const payNi = H.ni * (rates.b_night||0);
  const payWk = H.wk * (rates.b_wk||0);
  const payCont = H.total * (rates.b_cont||0);
  const basePay = H.total * (rates.base||0);
  const direct  = basePay * ((rates.direct||0)/100);
  const holiday = H.hol * (rates.hol||0);
  const gross = basePay + payAf + payNi + payWk + payCont + direct + holiday;
  return {hours:H, pay:{base:basePay,af:payAf,night:payNi,weekend:payWk,nonstop:payCont,direct,holiday,gross}};
}

// ====== UI: Calendar ======
const CAL = $('#calendar');
const layer = $('#bg-layer');

// Local per-month shifts map in memory (simple). key `YYYY-MM`
const SHIFTS = JSON.parse(localStorage.getItem('smenarek_v2_shifts')||'{}');

function keyFor(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
function getMonthModel(){
  const y=current.getFullYear(), m=current.getMonth();
  const first=new Date(y,m,1); const startIdx=(first.getDay()+6)%7; // Po=0
  const daysIn = new Date(y,m+1,0).getDate();
  const rows=[]; let row=[], i=0;
  // load existing
  const map=SHIFTS[keyFor(current)]||{};
  for(let blank=0; blank<startIdx; blank++){ row.push(null); i++; }
  for(let d=1; d<=daysIn; d++){
    const dt=new Date(y,m,d);
    const wd=(dt.getDay()+6)%7;
    const code=map[d]||'';
    const md = String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    const name = (namedays[md]||'');
    const isHol = isCzHoliday(y,m+1,d);
    row.push({d,wd,code,name,isHol});
    i++;
    if(i%7===0){ rows.push(row); row=[]; }
  }
  if(row.length){ while(row.length<7) row.push(null); rows.push(row); }
  return rows;
}

// CZ holidays (basic, 2025-safe; movable Easter Monday calculated)
function easterMonday(year){
  // Anonymous Gregorian Computus
  let a=year%19, b=Math.floor(year/100), c=year%100, d=Math.floor(b/4), e=b%4, f=Math.floor((b+8)/25)
  let g=Math.floor((b-f+1)/3), h=(19*a+b-d-g+15)%30, i=Math.floor(c/4), k=c%4
  let L=(32+2*e+2*i-h-k)%7, m=Math.floor((a+11*h+22*L)/451)
  let month=Math.floor((h+L-7*m+114)/31) // 3=March, 4=April
  let day=((h+L-7*m+114)%31)+1
  // Easter Sunday
  let dt=new Date(year, month-1, day);
  // Monday
  dt.setDate(dt.getDate()+1);
  return dt;
}
function isSameDate(y,m,d, dt){ return dt.getFullYear()===y && dt.getMonth()+1===m && dt.getDate()===d; }
function isCzHoliday(y,m,d){
  const fixed = ['01-01','05-01','05-08','07-05','07-06','09-28','10-28','11-17','12-24','12-25','12-26'];
  const s=String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
  if(fixed.includes(s)) return true;
  const em = easterMonday(y);
  return isSameDate(y,m,d,em); // Velikonoční pondělí
}

function renderCalendar(){
  layer.style.backgroundImage = "url('backgrounds/bg-12.jpg')";
  const rows=getMonthModel();
  const y=current.getFullYear(), mo=current.getMonth()+1;
  let html = '<thead><tr>'+weeks.map(w=>`<th>${w}</th>`).join('')+'</tr></thead><tbody>';
  const today=new Date(); const isCurMonth=(today.getFullYear()===y && today.getMonth()+1===mo);
  rows.forEach(r=>{
    html+='<tr>';
    r.forEach(cell=>{
      if(!cell){ html+='<td></td>'; return; }
      const isToday = isCurMonth && (cell.d===today.getDate());
      const cls = isToday?'today':'';
      const hol = cell.isHol? ' 🎌' : '';
      html+=`<td class="${cls}" data-d="${cell.d}">
        <div class="daynum">${cell.d}</div>
        <div class="cellcode">${cell.code||''}${hol}</div>
      </td>`;
    });
    html+='</tr>';
  });
  html+='</tbody>';
  CAL.innerHTML = html;

  // Interakce: klepnutí cykluje '', 'D','N','V'
  CAL.querySelectorAll('td[data-d]').forEach(td=>{
    td.addEventListener('click', ()=>{
      const d=+td.dataset.d;
      const map=SHIFTS[keyFor(current)] || {};
      const cur = map[d]||'';
      const nxt = (cur===''?'D': (cur==='D'?'N': (cur==='N'?'V':'')));
      map[d]=nxt; SHIFTS[keyFor(current)]=map;
      localStorage.setItem('smenarek_v2_shifts', JSON.stringify(SHIFTS));
      renderCalendar(); compute();
    });
  });

  // Today line
  const md=String(mo).padStart(2,'0')+'-'+String(isCurMonth?today.getDate():1).padStart(2,'0');
  const nm = namedays[md] || '—';
  $('#todayLine').innerHTML = `Dnes: ${isCurMonth? '—' : '—'}&nbsp;&nbsp; Svátek: ${nm}`;
}

function nav(dir){
  current.setMonth(current.getMonth()+dir);
  renderCalendar(); compute();
}

// ====== Settings Modal ======
function openSettings(){
  // fill
  $('#mode12').checked = ST.mode==='12';
  $('#mode8').checked = ST.mode==='8';
  $('#st_ccy').value = ST.ccy;
  $('#st_lang').value = ST.lang;
  $('#st_base').value = ST.base;
  $('#st_direct').value = ST.direct;
  $('#st_b_af').value = ST.b_af;
  $('#st_b_night').value = ST.b_night;
  $('#st_b_wk').value = ST.b_wk;
  $('#st_b_cont').value = ST.b_cont;
  $('#st_hol').value = ST.hol;
  $('#st_year').value = ST.yearBonus;
  $('#st_meal').value = ST.meal;
  $('#st_voucher_emp').value = ST.voucher_emp;
  $('#st_voucher_ded').value = ST.voucher_ded;
  $('#st_v_day').value = ST.v_day;
  $('#st_v_night').value = ST.v_night;
  $('#settingsModal').classList.add('show');
}
function saveSettings(){
  ST.mode = $('#mode8').checked ? '8' : '12';
  ST.ccy = $('#st_ccy').value;
  ST.lang = $('#st_lang').value;
  ST.base = +$('#st_base').value || 0;
  ST.direct = +$('#st_direct').value || 0;
  ST.b_af = +$('#st_b_af').value || 0;
  ST.b_night = +$('#st_b_night').value || 0;
  ST.b_wk = +$('#st_b_wk').value || 0;
  ST.b_cont = +$('#st_b_cont').value || 0;
  ST.hol = +$('#st_hol').value || 0;
  ST.yearBonus = +$('#st_year').value || 0;
  ST.meal = +$('#st_meal').value || 0;
  ST.voucher_emp = +$('#st_voucher_emp').value || 0;
  ST.voucher_ded = +$('#st_voucher_ded').value || 0;
  ST.v_day = +$('#st_v_day').value || 0;
  ST.v_night = +$('#st_v_night').value || 0;
  localStorage.setItem(ST_KEY, JSON.stringify(ST));
  $('#settingsModal').classList.remove('show');
  compute();
}

// ====== Compute ======
function compute(){
  const y=current.getFullYear(), mo=current.getMonth()+1;
  const daysIn = new Date(y,mo,0).getDate();
  const map=SHIFTS[keyFor(current)]||{};
  const days=[];
  for(let d=1; d<=daysIn; d++){
    const dt=new Date(y,mo-1,d);
    const wd=(dt.getDay()+6)%7;
    const code=map[d]||'';
    const hol=isCzHoliday(y,mo,d);
    if(code) days.push({code,weekday:wd,isHoliday:hol});
  }
  const res = calcMonth(days, {
    base:ST.base, b_af:ST.b_af, b_night:ST.b_night, b_wk:ST.b_wk, b_cont:ST.b_cont,
    hol:ST.hol, direct:ST.direct
  });

  // obědy & stravenky
  // obědy jen u denní, počítáme počet 'D' v mapu (pracovní dny, ale neřešíme svátky – jednoduché)
  let countD=0, countN=0;
  Object.keys(map).forEach(k=>{ if(map[k]==='D') countD++; if(map[k]==='N') countN++; });
  const mealsCost = countD * ST.meal;
  const vouchers = countD*ST.v_day + countN*ST.v_night;
  const vouchersAdd = vouchers * ST.voucher_emp;
  const vouchersDed = vouchers * ST.voucher_ded;

  const month = (current.getMonth()+1);
  const addYearly = (month===6 || month===11) ? ST.yearBonus : 0;

  const gross = res.pay.gross + addYearly;
  // velmi zhruba čistá: odečti obědy + srážku stravenky, přičti hodnotu zaměstnance
  const net = gross - mealsCost - vouchersDed;

  $('#outMeals').textContent = fmt(vouchersAdd, ST.ccy);
  $('#outCaf').textContent = fmt( (false?ST.yearBonus:1000), ST.ccy); // placeholder – mimo čistou
  $('#outNet').textContent = fmt(net, ST.ccy);

  // Today line svátek/jmeniny
  const t=new Date();
  const curMonth = (t.getFullYear()===y && t.getMonth()+1===mo);
  const md = String(mo).padStart(2,'0')+'-'+String(curMonth?t.getDate():1).padStart(2,'0');
  const nm = namedays[md] || '—';
  $('#todayLine').innerHTML = `Dnes: —&nbsp;&nbsp; Svátek: ${nm}`;
}

// ====== Wire ======
document.addEventListener('DOMContentLoaded', async ()=>{
  await loadNameDays();
  renderCalendar();
  compute();

  $('#prev').addEventListener('click', ()=>nav(-1));
  $('#next').addEventListener('click', ()=>nav(+1));
  $('#todayBtn').addEventListener('click', ()=>{ const n=new Date(); current=new Date(n.getFullYear(),n.getMonth(),1); renderCalendar(); compute(); });
  $('#btnSettings').addEventListener('click', openSettings);
  $('#btnCancel').addEventListener('click', ()=>$('#settingsModal').classList.remove('show'));
  $('#btnSave').addEventListener('click', saveSettings);
});
