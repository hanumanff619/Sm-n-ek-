// Směnářek 2.1 – app.js
const S = {
  lang: localStorage.getItem('lang') || 'cs',
  ccy: localStorage.getItem('ccy') || 'CZK',
  mode: localStorage.getItem('mode') || '12',
  base: +(localStorage.getItem('base')||0),
  avg:  +(localStorage.getItem('avg')||0),
  vac_hpd: +(localStorage.getItem('vac_hpd')||11.25),
  meal_price: +(localStorage.getItem('meal_price')||40),
  v_cost: +(localStorage.getItem('v_cost')||40),
  v_val:  +(localStorage.getItem('v_val')||110),
  v_d: +(localStorage.getItem('v_d')||1),
  v_n: +(localStorage.getItem('v_n')||2),
  b_aft: +(localStorage.getItem('b_aft')||0),
  b_night: +(localStorage.getItem('b_night')||0),
  b_wend: +(localStorage.getItem('b_wend')||0),
  b_hol: +(localStorage.getItem('b_hol')||0),
  b_cont: +(localStorage.getItem('b_cont')||0),
  bonus_mgr: +(localStorage.getItem('bonus_mgr')||0),
  bonus_year: +(localStorage.getItem('bonus_year')||0),
  bonus_pct: +(localStorage.getItem('bonus_pct')||10),
  caf: localStorage.getItem('caf')==='1',
  m1_net:+(localStorage.getItem('m1_net')||0),
  m1_hrs:+(localStorage.getItem('m1_hrs')||0),
  m2_net:+(localStorage.getItem('m2_net')||0),
  m2_hrs:+(localStorage.getItem('m2_hrs')||0),
  m3_net:+(localStorage.getItem('m3_net')||0),
  m3_hrs:+(localStorage.getItem('m3_hrs')||0),
  days: JSON.parse(localStorage.getItem('days')||'{}')
};
const fmt = (v)=> new Intl.NumberFormat(S.lang, {style:'currency',currency:S.ccy,maximumFractionDigits:2}).format(+v||0);
function pad2(n){ return String(n).padStart(2,'0'); }
function ymd(d){ return d.toISOString().slice(0,10); }
function firstOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
function lastOfMonth(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0); }
function todayLocal(){ const d=new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function ymKey(d){ return d.getFullYear()+'-'+pad2(d.getMonth()+1); }

const monthLabel = document.getElementById('monthLabel');
const cal = document.getElementById('calendar');
const todayShiftEl = document.getElementById('todayShift');
const todayNameEl  = document.getElementById('todayName');

let YM = todayLocal();

// holidays
const HOL_FIXED = new Set(['01-01','05-01','05-08','07-05','07-06','09-28','10-28','11-17','12-24','12-25','12-26']);
function easterMonday(year){
  const a=year%19, b=Math.floor(year/100), c=year%100, d=Math.floor(b/4), e=b%4, f=Math.floor((b+8)/25),
        g=Math.floor((b-f+1)/3), h=(19*a + b - d - g + 15)%30, i=Math.floor(c/4), k=c%4,
        l=(32 + 2*e + 2*i - h - k)%7, m=Math.floor((a + 11*h + 22*l)/451),
        month=Math.floor((h + l - 7*m + 114)/31), day=((h + l - 7*m + 114)%31)+1;
  const easterSunday = new Date(year, month-1, day);
  const em = new Date(easterSunday); em.setDate(em.getDate()+1);
  const gf = new Date(easterSunday); gf.setDate(gf.getDate()-2);
  return {em, gf};
}

let NAMEDAYS = {};
fetch('namedays_cs.json?v=2.1',{cache:'no-store'}).then(r=>r.json()).then(j=>{ NAMEDAYS=j; updateToday(); }).catch(_=>{});

function setBg(){
  const url = (localStorage.getItem('mode')||'12')==='8' ? 'backgrounds/bg8.jpg' : 'backgrounds/bg12.jpg';
  const bust = '?v=2.1';
  const el = document.getElementById('bg-layer');
  if (el) {
    el.style.backgroundImage = `url(${url}${bust})`;
  }
}

function renderMonth(){
  setBg();
  const d0 = firstOfMonth(YM), d1 = lastOfMonth(YM);
  monthLabel.textContent = d0.toLocaleDateString(S.lang, {month:'long', year:'numeric'});
  const y = YM.getFullYear();
  const {em,gf} = easterMonday(y);
  const H = new Set([...HOL_FIXED, (pad2(gf.getMonth()+1)+'-'+pad2(gf.getDate())), (pad2(em.getMonth()+1)+'-'+pad2(em.getDate()))]);

  let html = '<thead><tr>';
  const wd = [...Array(7)].map((_,i)=> new Date(2025,6,i+7).toLocaleDateString(S.lang,{weekday:'short'}));
  wd.forEach(w=> html += `<th>${w}</th>`);
  html += '</tr></thead><tbody>';

  const start = new Date(d0); start.setDate(1 - ((d0.getDay()+6)%7));
  let cur = start;
  const todayKey = ymd(todayLocal());

  while (cur <= d1 || (cur.getDay()+6)%7 !== 0){
    html += '<tr>';
    for(let i=0;i<7;i++){
      const key = ymd(cur);
      const thisMonth = cur.getMonth()===YM.getMonth();
      const isToday = key===todayKey;
      const shift = S.days[key]||'';
      const mmdd = pad2(cur.getMonth()+1)+'-'+pad2(cur.getDate());
      const isHol = H.has(mmdd);

      const cls = [
        thisMonth?'':'subtle',
        isToday?'today':'',
        shift? 'selected' : '',
        isHol?'holiday':''
      ].filter(Boolean).join(' ');

      const badge = shift ? `<div class="badge">${shift}</div>` : '';
      const flag = isHol ? `<div class="badge" title="Státní svátek">🎌</div>` : '';

      html += `<td data-date="${key}" class="${cls}">
        <div class="daynum">${cur.getDate()}</div>
        ${badge}${flag}
      </td>`;
      cur.setDate(cur.getDate()+1);
    }
    html += '</tr>';
  }
  html += '</tbody>';
  cal.innerHTML = html;
}

function save(){ localStorage.setItem('days', JSON.stringify(S.days)); }

cal.addEventListener('click', e=>{
  const td = e.target.closest('td[data-date]'); if(!td) return;
  const key = td.dataset.date;
  const seq = S.mode==='12' ? ['','D','N','V'] : ['','R','O','N','V'];
  const cur = S.days[key]||'';
  const nx = seq[(seq.indexOf(cur)+1) % seq.length];
  if(nx) S.days[key]=nx; else delete S.days[key];
  save(); renderMonth(); updateToday(); recompute();
});

cal.addEventListener('contextmenu', e=>{
  const td = e.target.closest('td[data-date]'); if(!td) return;
  e.preventDefault();
  const key = td.dataset.date;
  delete S.days[key]; save(); renderMonth(); updateToday(); recompute();
});

document.getElementById('prevMonth').onclick = ()=>{ YM.setMonth(YM.getMonth()-1); renderMonth(); };
document.getElementById('nextMonth').onclick = ()=>{ YM.setMonth(YM.getMonth()+1); renderMonth(); };

function updateToday(){
  const k = ymd(todayLocal());
  todayShiftEl.textContent = S.days[k] || '—';
  const mmdd = k.slice(5);
  const name = NAMEDAYS[mmdd] || '—';
  todayNameEl.textContent = name || '—';
}

function hoursFor(shift){
  if(S.mode==='12'){
    if(shift==='D' || shift==='N') return 11.25;
    if(shift==='V') return +(S.vac_hpd||11.25);
  } else {
    if(shift==='R') return 8;
    if(shift==='O') return 4;
    if(shift==='N') return 8;
    if(shift==='V') return +(S.vac_hpd||8);
  }
  return 0;
}

function monthCounts(){
  const ym = ymKey(YM);
  let c = {D:0,N:0,V:0,R:0,O:0};
  Object.entries(S.days).forEach(([k,v])=>{ if(k.startsWith(ym) && c[v]!==undefined) c[v]++; });
  return c;
}

function autoAverage(){
  if(S.avg && S.avg>0) return S.avg;
  const sumNet = (S.m1_net||0)+(S.m2_net||0)+(S.m3_net||0);
  const sumHrs = (S.m1_hrs||0)+(S.m2_hrs||0)+(S.m3_hrs||0);
  if(sumNet>0 && sumHrs>0) return sumNet/sumHrs;
  return 0;
}

function recompute(){
  const overview = document.getElementById('overview');
  overview.style.display = 'block';

  const c = monthCounts();
  let hours = 0;
  Object.keys(c).forEach(k=> hours += c[k]*hoursFor(k));

  const basePay = hours * (S.base||0);
  const directPrem = (S.bonus_pct/100) * basePay;

  const aftHours = (S.mode==='12') ? (c.D*4) : (c.O*4);
  const nightHours = (S.mode==='12') ? (c.N*4.25) : (c.N*8);
  const wendHours = 0;
  const holHours = 0;
  const contHours = hours;

  const payAft = aftHours * (S.b_aft||0);
  const payNight = nightHours * (S.b_night||0);
  const payWend = wendHours * (S.b_wend||0);
  const payHol  = holHours * (S.b_hol||0);
  const payCont = contHours * (S.b_cont||0);

  const mgr = +(S.bonus_mgr||0);
  const yearBonus = ( [6,11].includes(YM.getMonth()+1) ? +(S.bonus_year||0) : 0 );

  let mealsCount = 0, vouchCount = 0;
  const weekdays = (key)=>{ const d=new Date(key); const wd=d.getDay(); return wd>=1 && wd<=5; };
  Object.keys(S.days).forEach(k=>{
    if(!k.startsWith(ymKey(YM))) return;
    const sh = S.days[k];
    if(S.mode==='12'){
      if(sh==='D' && weekdays(k)) mealsCount += 1;
      if(sh==='D') vouchCount += S.v_d;
      if(sh==='N') vouchCount += S.v_n;
    }else{
      if(sh==='R' && weekdays(k)) mealsCount += 1;
      if(sh==='R') vouchCount += S.v_d;
      if(sh==='N') vouchCount += S.v_n;
    }
  });
  const mealDeduct = mealsCount * (S.meal_price||0);
  const vouchDeduct= vouchCount * (S.v_cost||0);
  const vouchGain  = vouchCount * (S.v_val||0);

  const cafVal = S.caf ? 1000 : 0;

  const gross = basePay + directPrem + payAft + payNight + payWend + payHol + payCont + mgr + yearBonus;
  const tax = gross*0.15; const social=gross*0.065; const health=gross*0.045;
  let net = gross - tax - social - health - mealDeduct - vouchDeduct;

  overview.innerHTML = `
    <div><b>Přehled:</b></div>
    <div>Směny – ${S.mode==='12' ? `D:${c.D} N:${c.N} V:${c.V}` : `R:${c.R} O:${c.O} N:${c.N} V:${c.V}`}</div>
    <div>Hodiny celkem: ${hours.toFixed(2)}</div>
    <div>Přímé prémie (%. z hodinovky): ${fmt(directPrem)}</div>
    <div>Příplatky – Odpo: ${fmt(payAft)}, Noc: ${fmt(payNight)}, Vík: ${fmt(payWend)}, Svát: ${fmt(payHol)}, Nepřetrž: ${fmt(payCont)}</div>
    <div>Prémie – Měs.: ${fmt(mgr)}, Roční: ${fmt(yearBonus)}</div>
    <div>Obědy: ${mealsCount} ks (−${fmt(mealDeduct)}), Stravenky: ${vouchCount} ks (−${fmt(vouchDeduct)} | +${fmt(vouchGain)})</div>
    <div>Hrubá mzda: ${fmt(gross)}</div>
  `;

  document.getElementById('resNet').textContent   = fmt(net);
  document.getElementById('resVouch').textContent = fmt(vouchGain);
  document.getElementById('resCaf').textContent   = fmt(cafVal);

  const ymk = ymKey(YM);
  const yearSums = JSON.parse(localStorage.getItem('yearSums')||'{}');
  yearSums[ymk] = net;
  localStorage.setItem('yearSums', JSON.stringify(yearSums));
  const year = YM.getFullYear();
  const sum = Object.entries(yearSums).filter(([k])=>k.startsWith(String(year))).reduce((a, [,v])=>a+v,0);
  document.getElementById('yearSum').textContent = `Součet za rok: ${fmt(sum)}`;
}

const modal = document.getElementById('modalSettings');
document.getElementById('btnSettings').onclick = ()=>{
  const g = (id)=> document.getElementById(id);
  g('st_base').value = S.base||'';
  g('st_avg').value = S.avg||'';
  g('st_vac_hpd').value = S.vac_hpd||'';
  g('st_mode').value = S.mode;
  g('st_lang').value = S.lang;
  g('st_ccy').value = S.ccy;
  g('st_meal_price').value = S.meal_price;
  g('st_vouch_cost').value = S.v_cost;
  g('st_vouch_val').value = S.v_val;
  g('st_v_d').value = S.v_d;
  g('st_v_n').value = S.v_n;
  g('st_b_aft').value = S.b_aft;
  g('st_b_night').value = S.b_night;
  g('st_b_wend').value = S.b_wend;
  g('st_b_hol').value = S.b_hol;
  g('st_b_cont').value = S.b_cont;
  g('st_bonus_mgr').value = S.bonus_mgr;
  g('st_bonus_year').value = S.bonus_year;
  g('st_bonus_pct').value = S.bonus_pct;
  g('st_caf').checked = !!S.caf;
  g('m1_net').value = S.m1_net||'';
  g('m1_hrs').value = S.m1_hrs||'';
  g('m2_net').value = S.m2_net||'';
  g('m2_hrs').value = S.m2_hrs||'';
  g('m3_net').value = S.m3_net||'';
  g('m3_hrs').value = S.m3_hrs||'';
  modal.style.display = 'flex';
};
document.getElementById('btnClose').onclick = ()=> modal.style.display='none';
document.getElementById('btnCancel').onclick = ()=> modal.style.display='none';
document.getElementById('btnSave').onclick = ()=>{
  const g = (id)=> document.getElementById(id);
  S.base = +g('st_base').value||0;            localStorage.setItem('base', S.base);
  S.avg  = +g('st_avg').value||0;             localStorage.setItem('avg', S.avg);
  S.vac_hpd= +g('st_vac_hpd').value||11.25;   localStorage.setItem('vac_hpd', S.vac_hpd);
  S.mode = g('st_mode').value;                localStorage.setItem('mode', S.mode);
  S.lang = g('st_lang').value;                localStorage.setItem('lang', S.lang);
  S.ccy  = g('st_ccy').value;                 localStorage.setItem('ccy', S.ccy);
  S.meal_price = +g('st_meal_price').value;   localStorage.setItem('meal_price', S.meal_price);
  S.v_cost = +g('st_vouch_cost').value;       localStorage.setItem('v_cost', S.v_cost);
  S.v_val  = +g('st_vouch_val').value;        localStorage.setItem('v_val', S.v_val);
  S.v_d    = +g('st_v_d').value;              localStorage.setItem('v_d', S.v_d);
  S.v_n    = +g('st_v_n').value;              localStorage.setItem('v_n', S.v_n);
  S.b_aft  = +g('st_b_aft').value;            localStorage.setItem('b_aft', S.b_aft);
  S.b_night= +g('st_b_night').value;          localStorage.setItem('b_night', S.b_night);
  S.b_wend = +g('st_b_wend').value;           localStorage.setItem('b_wend', S.b_wend);
  S.b_hol  = +g('st_b_hol').value;            localStorage.setItem('b_hol', S.b_hol);
  S.b_cont = +g('st_b_cont').value;           localStorage.setItem('b_cont', S.b_cont);
  S.bonus_mgr = +g('st_bonus_mgr').value;     localStorage.setItem('bonus_mgr', S.bonus_mgr);
  S.bonus_year= +g('st_bonus_year').value;    localStorage.setItem('bonus_year', S.bonus_year);
  S.bonus_pct = +g('st_bonus_pct').value;     localStorage.setItem('bonus_pct', S.bonus_pct);
  S.caf = g('st_caf').checked;                localStorage.setItem('caf', S.caf?'1':'0');
  S.m1_net= +g('m1_net').value||0;            localStorage.setItem('m1_net', S.m1_net);
  S.m1_hrs= +g('m1_hrs').value||0;            localStorage.setItem('m1_hrs', S.m1_hrs);
  S.m2_net= +g('m2_net').value||0;            localStorage.setItem('m2_net', S.m2_net);
  S.m2_hrs= +g('m2_hrs').value||0;            localStorage.setItem('m2_hrs', S.m2_hrs);
  S.m3_net= +g('m3_net').value||0;            localStorage.setItem('m3_net', S.m3_net);
  S.m3_hrs= +g('m3_hrs').value||0;            localStorage.setItem('m3_hrs', S.m3_hrs);

  // auto avg when not set manually
  const sumNet = (S.m1_net||0)+(S.m2_net||0)+(S.m3_net||0);
  const sumHrs = (S.m1_hrs||0)+(S.m2_hrs||0)+(S.m3_hrs||0);
  if(!S.avg && sumNet>0 && sumHrs>0){ S.avg = sumNet/sumHrs; }

  modal.style.display='none';
  renderMonth(); updateToday(); recompute();
};

renderMonth();
updateToday();
recompute();
