import { useState, useEffect } from 'react';
import { useLessonGenStore } from '../../store/lessonGenStore';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

const SUBJECTS  = ['Science','Mathematics','English','Filipino','Araling Panlipunan','MAPEH','GMRC','Makabansa','Reading & Literacy','Language','TLE'];
const GRADES    = ['Kindergarten','Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Grade 7','Grade 8','Grade 9','Grade 10'];
const TERMS     = ['Term 1','Term 2','Term 3'];
const WEEKS     = Array.from({length:10},(_,i)=>`Week ${i+1}`);
const DAY_NAMES = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function isoStr(y, m, d) { return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
function parseIso(s) { const [y,mo,d]=s.split('-'); return new Date(+y,+mo-1,+d); }
function formatChip(iso) {
  const d = parseIso(iso);
  return d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
}

function buildCells(year, month) {
  const first = new Date(year, month, 1);
  const startPad = (first.getDay() + 6) % 7;
  const lastDay  = new Date(year, month+1, 0).getDate();
  const cells = Array(startPad).fill(null);
  for (let d=1; d<=lastDay; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function Calendar({ selectedDays, onChange }) {
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  function prevMonth() {
    if (month === 0) { setYear(y=>y-1); setMonth(11); } else setMonth(m=>m-1);
  }
  function nextMonth() {
    if (month === 11) { setYear(y=>y+1); setMonth(0); } else setMonth(m=>m+1);
  }

  function isSelected(d) { return selectedDays.includes(isoStr(year,month,d)); }
  function isPast(d)      { const dt=new Date(year,month,d); dt.setHours(0,0,0,0); const t=new Date(); t.setHours(0,0,0,0); return dt<t; }
  function isToday(d)     { const dt=new Date(year,month,d); const t=new Date(); return dt.toDateString()===t.toDateString(); }
  function isWeekend(col) { return col===5||col===6; }

  function handleDay(d, col) {
    if (!d || isWeekend(col) || isPast(d)) return;
    const iso = isoStr(year, month, d);
    if (selectedDays.includes(iso)) onChange(selectedDays.filter(s=>s!==iso));
    else if (selectedDays.length < 5) onChange([...selectedDays, iso].sort());
  }

  const cells = buildCells(year, month);

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
        <button onClick={prevMonth} style={{background:'none',border:'none',cursor:'pointer',padding:4,color:'#4a6357',display:'flex'}}>
          <ChevronLeft size={18}/>
        </button>
        <span style={{fontSize:14,fontWeight:600,color:'var(--kt-text-primary)'}}>
          {MONTH_NAMES[month]} {year}
        </span>
        <button onClick={nextMonth} style={{background:'none',border:'none',cursor:'pointer',padding:4,color:'#4a6357',display:'flex'}}>
          <ChevronRight size={18}/>
        </button>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',marginBottom:4}}>
        {DAY_NAMES.map(n=>(
          <div key={n} style={{textAlign:'center',fontSize:11,fontWeight:700,color: n==='Sat'||n==='Sun' ? 'rgba(45,106,79,0.3)':'#4a6357',padding:'4px 0',textTransform:'uppercase',letterSpacing:'0.5px'}}>
            {n}
          </div>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2}}>
        {cells.map((d, i) => {
          const col      = i % 7;
          const weekend  = isWeekend(col);
          const past     = d ? isPast(d) : false;
          const today_   = d ? isToday(d) : false;
          const selected = d ? isSelected(d) : false;
          const maxReached = selectedDays.length >= 5;
          const disabled = !d || weekend || past || (maxReached && !selected);

          return (
            <div
              key={i}
              onClick={() => handleDay(d, col)}
              style={{
                height:34, display:'grid', placeItems:'center',
                borderRadius:8, cursor: disabled ? 'default' : 'pointer',
                fontSize:13, fontWeight: selected ? 700 : 400,
                background: selected ? '#1a3d2b' : weekend ? 'var(--kt-surface)' : 'transparent',
                color: selected ? '#fff' : past ? 'rgba(45,106,79,0.2)' : weekend ? 'rgba(45,106,79,0.3)' : 'var(--kt-text-primary)',
                transition:'all 0.1s',
                position:'relative',
                transform: selected ? 'scale(1.05)' : 'none',
              }}
              onMouseEnter={e=>{ if(!disabled && !selected) e.currentTarget.style.background='#d8f3dc'; }}
              onMouseLeave={e=>{ if(!disabled && !selected) e.currentTarget.style.background='transparent'; }}
            >
              {d}
              {today_ && (
                <span style={{
                  position:'absolute',bottom:2,left:'50%',transform:'translateX(-50%)',
                  width:4,height:4,borderRadius:'50%',
                  background: selected ? 'rgba(255,255,255,0.7)' : '#2d6a4f',
                }}/>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Step1() {
  const store = useLessonGenStore();

  const [subject,   setSubject]  = useState(store.subject      || '');
  const [grade,     setGrade]    = useState(store.gradeLevel   || '');
  const [term,      setTerm]     = useState(store.term         || '');
  const [week,      setWeek]     = useState(store.weekNumber   || '');
  const [days,      setDays]     = useState(store.selectedDays || []);
  const [showLabel, setShowLabel]= useState(!!(store.subject && store.gradeLevel && store.term && store.weekNumber));

  useEffect(()=>{ setShowLabel(!!(subject && grade && term && week)); },[subject,grade,term,week]);

  useEffect(()=>{
    store.setStep1({ subject, gradeLevel: grade, term, weekNumber: week, selectedDays: days });
  },[subject,grade,term,week,days]);

  function removeDay(iso) { setDays(prev=>prev.filter(d=>d!==iso)); }

  const S = (label,opts) => (
    <select className="select" value={opts.val} onChange={e=>opts.set(e.target.value)}>
      <option value="">Select {label}...</option>
      {opts.list.map(o=><option key={o} value={o}>{o}</option>)}
    </select>
  );

  return (
    <div style={{maxWidth:900,margin:'0 auto'}}>
      {/* Phase badge + heading */}
      <div style={{marginBottom:28}}>
        <span style={{background:'#ccfbf1',color:'#0d9488',borderRadius:20,padding:'4px 12px',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'1px'}}>
          Setup
        </span>
        <h2 style={{margin:'10px 0 6px',fontSize:22,fontWeight:600,color:'var(--kt-text-primary)'}}>Set up your teaching session</h2>
        <p style={{margin:0,fontSize:15,color:'#4a6357',lineHeight:1.65,maxWidth:520}}>
          Select your subject, grade, term, and week. Then choose which days you will teach — each day you pick becomes one session in your ILAW lesson plan.
        </p>
      </div>

      {/* Two-column layout */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,alignItems:'start'}}>

        {/* LEFT: Form */}
        <div style={{background:'var(--kt-card)',border:'1px solid var(--kt-border)',borderRadius:14,padding:24,display:'flex',flexDirection:'column',gap:20}}>

          <div>
            <label style={{display:'block',marginBottom:6,fontSize:11,fontWeight:700,color:'#4a6357',textTransform:'uppercase',letterSpacing:'1.2px'}}>
              Subject area <span style={{color:'#e05c5c'}}>*</span>
            </label>
            {S('subject',{val:subject,set:setSubject,list:SUBJECTS})}
          </div>

          <div>
            <label style={{display:'block',marginBottom:6,fontSize:11,fontWeight:700,color:'#4a6357',textTransform:'uppercase',letterSpacing:'1.2px'}}>
              Grade level <span style={{color:'#e05c5c'}}>*</span>
            </label>
            {S('grade level',{val:grade,set:setGrade,list:GRADES})}
          </div>

          <div>
            <label style={{display:'block',marginBottom:8,fontSize:11,fontWeight:700,color:'#4a6357',textTransform:'uppercase',letterSpacing:'1.2px'}}>
              Term <span style={{color:'#e05c5c'}}>*</span>
            </label>
            <div style={{display:'flex',gap:8}}>
              {TERMS.map(t=>(
                <button key={t} onClick={()=>setTerm(t)} style={{
                  flex:1,padding:'9px 4px',borderRadius:10,border:'1.5px solid',
                  borderColor: term===t ? '#1a3d2b' : 'rgba(45,106,79,0.2)',
                  background:  term===t ? '#1a3d2b' : 'var(--kt-card)',
                  color:       term===t ? '#fff' : '#4a6357',
                  fontSize:13, fontWeight: term===t ? 600 : 400, cursor:'pointer', transition:'all 0.12s',
                }}>
                  {t}
                </button>
              ))}
            </div>
            <p style={{margin:'6px 0 0',fontSize:11,color:'#4a6357',fontStyle:'italic'}}>MATATAG follows a 3-term school calendar</p>
          </div>

          <div>
            <label style={{display:'block',marginBottom:6,fontSize:11,fontWeight:700,color:'#4a6357',textTransform:'uppercase',letterSpacing:'1.2px'}}>
              Week <span style={{color:'#e05c5c'}}>*</span>
            </label>
            {S('week',{val:week,set:setWeek,list:WEEKS})}
            <p style={{margin:'5px 0 0',fontSize:11,color:'#4a6357'}}>Week number within the term</p>
          </div>

          {/* Lesson label */}
          {showLabel && (
            <div style={{
              background:'#d8f3dc',border:'1px solid rgba(45,106,79,0.2)',borderRadius:12,padding:'14px 16px',
              animation:'fadeUp 0.25s ease',
            }}>
              <p style={{margin:'0 0 4px',fontSize:11,fontWeight:700,color:'#4a6357',textTransform:'uppercase',letterSpacing:'1.2px'}}>YOUR LESSON</p>
              <p style={{margin:0,fontSize:15,fontWeight:600,color:'var(--kt-text-primary)'}}>
                {subject} {grade} · {term} · {week}
              </p>
              <p style={{margin:'4px 0 0',fontSize:13,color:'#4a6357'}}>
                {days.length > 0
                  ? `${days.map(d=>formatChip(d)).join(' · ')} · ${days.length} session${days.length!==1?'s':''}`
                  : '← Select teaching days on the calendar'
                }
              </p>
            </div>
          )}
        </div>

        {/* RIGHT: Calendar */}
        <div style={{background:'var(--kt-card)',border:'1px solid var(--kt-border)',borderRadius:14,padding:24}}>
          <div style={{marginBottom:14}}>
            <p style={{margin:0,fontSize:13,fontWeight:600,color:'var(--kt-text-primary)'}}>
              Teaching days <span style={{color:'#e05c5c'}}>*</span>
            </p>
            <p style={{margin:'4px 0 0',fontSize:13,color:'#4a6357',lineHeight:1.65}}>
              Select each day you will teach this lesson. Each day you tick = one session in your ILAW plan.
            </p>
          </div>

          <Calendar selectedDays={days} onChange={setDays} />

          <div style={{borderTop:'1px solid rgba(45,106,79,0.08)',marginTop:16,paddingTop:14}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
              <span style={{fontSize:12,fontWeight:600,color:'#4a6357'}}>Selected days:</span>
              <span style={{
                background: days.length >= 5 ? 'rgba(232,163,32,0.12)' : days.length ? '#d8f3dc' : '#f5faf7',
                color:      days.length >= 5 ? '#b47a10' : days.length ? '#1a3d2b' : '#4a6357',
                borderRadius:20,padding:'2px 10px',fontSize:11,fontWeight:700,
              }}>
                {days.length}/5{days.length >= 5 ? ' max' : ` session${days.length!==1?'s':''}`}
              </span>
            </div>

            {days.length > 0 ? (
              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                {days.map(iso=>(
                  <span key={iso} style={{
                    display:'flex',alignItems:'center',gap:5,
                    background:'var(--kt-card)',border:'1px solid rgba(45,106,79,0.2)',
                    borderRadius:20,padding:'4px 10px',fontSize:12,fontWeight:600,color:'#1a3d2b',
                  }}>
                    {formatChip(iso)}
                    <button onClick={()=>removeDay(iso)} style={{background:'none',border:'none',cursor:'pointer',padding:0,display:'flex',color:'#4a6357'}}>
                      <X size={11}/>
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p style={{margin:0,fontSize:13,fontStyle:'italic',color:'#4a6357',opacity:0.7}}>
                No days selected yet — tap days on the calendar above
              </p>
            )}

            {days.length > 0 && (
              <div style={{
                background:'var(--kt-surface)',border:'1px solid var(--kt-border)',
                borderRadius:10,padding:'10px 14px',marginTop:12,
              }}>
                <p style={{margin:'0 0 6px',fontSize:11,color:'#4a6357',fontWeight:600}}>
                  Your ILAW plan will have <strong>{days.length}</strong> session column{days.length!==1?'s':''}:
                </p>
                <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                  {days.map((_,i)=>(
                    <span key={i} style={{
                      background:'#d8f3dc',borderRadius:6,padding:'3px 8px',
                      fontSize:10,fontWeight:700,color:'#1a3d2b',
                    }}>
                      Session {i+1}
                    </span>
                  ))}
                </div>
                <p style={{margin:'8px 0 0',fontSize:11,color:'#4a6357',fontStyle:'italic'}}>
                  One Cognitive + Affective + Psychomotor objective per session = <strong style={{fontFamily:'"DM Mono", monospace'}}>{days.length * 3}</strong> total learning objectives
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{height:24}}/>
    </div>
  );
}
