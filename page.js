'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import './style.css';

const LEVELS = ['مبتدئ', 'متوسط', 'متقدم'];
const PALETTE = ['#dcefe4','#f8dfd8','#f8edc9','#dfe8fa','#eee1f7','#d8eff0'];
const safeJSON = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };
const studentName = s => typeof s === 'string' ? s : (s?.name || '');
const normalizeStudents = list => (Array.isArray(list) ? list : []).map(s => ({ name: String(studentName(s)).trim(), level: Math.min(3, Math.max(1, Number(s?.level) || 2)) })).filter(s => s.name && s.name.length < 90);
const normalizeQuestions = list => (Array.isArray(list) ? list : []).map((q,i) => ({ id: `${Date.now()}-${i}`, question: String(q?.question || q?.text || '').trim(), answer: String(q?.answer || q?.correctAnswer || '').trim(), hint: String(q?.hint || '').trim(), level: Number(q?.level) || (q?.difficulty === 'مبتدئ' ? 1 : q?.difficulty === 'متقدم' ? 3 : 2), options: Array.isArray(q?.options) ? q.options : [] })).filter(q => q.question);
const levelText = n => LEVELS[Math.max(0,Math.min(2,Number(n)-1))];

export default function Home() {
  const [tab,setTab] = useState('prepare');
  const [title,setTitle] = useState('');
  const [grade,setGrade] = useState('3');
  const [subject,setSubject] = useState('الهوية والمواطنة');
  const [lessonText,setLessonText] = useState('');
  const [students,setStudents] = useState([]);
  const [draft,setDraft] = useState([]);
  const [questions,setQuestions] = useState([]);
  const [picked,setPicked] = useState(null);
  const [activeQuestion,setActiveQuestion] = useState(null);
  const [usedQuestions,setUsedQuestions] = useState([]);
  const [usedStudents,setUsedStudents] = useState([]);
  const [history,setHistory] = useState([]);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [spin,setSpin] = useState(0);
  const [spinning,setSpinning] = useState(false);
  const [duration,setDuration] = useState(420);
  const [seconds,setSeconds] = useState(420);
  const [running,setRunning] = useState(false);
  const [showAnswer,setShowAnswer] = useState(false);
  const [showHint,setShowHint] = useState(false);
  const fileRef = useRef(null);
  const spinRef = useRef(null);
  const spinValue = useRef(0);
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const data = safeJSON(localStorage.getItem('hisati-v3'), {});
      setTitle(data.title || ''); setGrade(data.grade || '3'); setSubject(data.subject || 'الهوية والمواطنة');
      setStudents(normalizeStudents(data.students)); setQuestions(normalizeQuestions(data.questions));
      setHistory(Array.isArray(data.history) ? data.history : []);
    } catch {}
    loaded.current = true;
    return () => clearTimeout(spinRef.current);
  },[]);
  useEffect(() => { if(loaded.current) localStorage.setItem('hisati-v3',JSON.stringify({title,grade,subject,students,questions,history})); },[title,grade,subject,students,questions,history]);
  useEffect(() => { if(!running) return; const timer=setInterval(()=>setSeconds(s=>Math.max(0,s-1)),1000); return ()=>clearInterval(timer); },[running]);
  useEffect(() => { if(seconds===0) setRunning(false); },[seconds]);

  const wheel = useMemo(() => students.length ? `conic-gradient(${students.map((_,i)=>`${PALETTE[i%PALETTE.length]} ${i*100/students.length}% ${(i+1)*100/students.length}%`).join(',')})` : '#e7eee9',[students]);
  const minute = String(Math.floor(seconds/60)).padStart(2,'0');
  const second = String(seconds%60).padStart(2,'0');
  const correctCount = history.filter(h=>h.correct).length;
  const uniqueCount = new Set(history.map(h=>h.student)).size;

  function pickQuestion(level, old = usedQuestions) {
    const relevant = questions.filter(q=>Number(q.level)===Number(level) && !old.includes(q.id));
    const fallback = questions.filter(q=>!old.includes(q.id));
    const pool = relevant.length ? relevant : fallback;
    if(!pool.length){ setActiveQuestion(null); setMessage('انتهت الأسئلة المتاحة. يمكنك إضافة أسئلة جديدة.'); return; }
    const q=pool[Math.floor(Math.random()*pool.length)]; setActiveQuestion(q);setUsedQuestions(v=>[...v,q.id]);setShowAnswer(false);setShowHint(false);setMessage('');
  }
  function chooseStudent() {
    if(spinning || !students.length) { if(!students.length)setTab('students');return; }
    let available=students.map((s,i)=>({...s,index:i})).filter(s=>!usedStudents.includes(s.index));
    if(!available.length){ setUsedStudents([]); available=students.map((s,i)=>({...s,index:i})); }
    const s=available[Math.floor(Math.random()*available.length)];
    const count=students.length;
    const segment=360/count;
    const target=((360-(s.index+.5)*segment)%360+360)%360;
    const current=((spinValue.current%360)+360)%360;
    const extra=(target-current+360)%360;
    spinValue.current+=1800+extra;
    setSpin(spinValue.current);setSpinning(true);setMessage('العجلة تدور...');
    clearTimeout(spinRef.current);
    spinRef.current=setTimeout(()=>{setSpinning(false);setPicked(s);setUsedStudents(v=>[...v,s.index]);pickQuestion(s.level);setMessage(`اختير الطالب: ${s.name}`);},4300);
  }
  function record(correct) {
    if(!picked || !activeQuestion)return;
    setHistory(h=>[...h,{student:picked.name,level:picked.level,question:activeQuestion.question,correct,time:new Date().toLocaleString('ar-OM')}]);
    setMessage(correct?'أحسنت! تم تسجيل الإجابة الصحيحة ⭐':'تم تسجيل المحاولة، ويمكن تجربة سؤال آخر.');
    setActiveQuestion(null);setPicked(null);setShowAnswer(false);setShowHint(false);
  }
  async function parseResponse(response){const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{throw Error(response.status===413?'الصورة كبيرة جدًا. صغّري حجمها وحاولي مجددًا.':`الخادم أعاد استجابة غير متوقعة (${response.status}).`);}if(!response.ok)throw Error(data.error||data.message||`تعذر إكمال الطلب (${response.status}).`);return data;}
  async function compressImage(file){if(!file.type.startsWith('image/'))return file;return new Promise((resolve,reject)=>{const img=new Image();const url=URL.createObjectURL(file);img.onload=()=>{const max=1400;const ratio=Math.min(1,max/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*ratio));canvas.height=Math.max(1,Math.round(img.height*ratio));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);canvas.toBlob(blob=>{URL.revokeObjectURL(url);blob?resolve(new File([blob],'image.jpg',{type:'image/jpeg'})):reject(Error('تعذر تجهيز الصورة.'));},'image/jpeg',.75);};img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('تعذر قراءة الصورة.'));};img.src=url;});}
  async function extractStudents(e){e.preventDefault();const file=fileRef.current?.files?.[0];if(!file)return setMessage('اختاري صورة كشف الأسماء أولًا.');setBusy(true);setMessage('جاري قراءة الأسماء...');try{const form=new FormData();form.append('image',await compressImage(file));const data=await parseResponse(await fetch('/api/extract-students',{method:'POST',body:form}));const names=normalizeStudents(data.students||data.names);if(!names.length)throw Error('لم يتم العثور على أسماء واضحة. جرّبي صورة أوضح.');setDraft(names);setMessage(`تم استخراج ${names.length} اسمًا. راجعي الأسماء ثم اعتمديها.`);}catch(err){setMessage(err.message);}finally{setBusy(false);}}
  async function generate(e){e.preventDefault();if(!title.trim()&&!lessonText.trim())return setMessage('أدخلي عنوان الدرس أو نصه.');setBusy(true);setMessage('جاري تجهيز الأسئلة...');try{const form=new FormData(e.currentTarget);form.set('title',title);form.set('grade',grade);form.set('subject',subject);form.set('text',lessonText);const files=Array.from(form.getAll('images')).filter(x=>x instanceof File&&x.size);form.delete('images');for(const f of files)form.append('images',await compressImage(f));const data=await parseResponse(await fetch('/api/generate-questions',{method:'POST',body:form}));const qs=normalizeQuestions(data.questions||data.items);if(!qs.length)throw Error('لم تُرجع الخدمة أسئلة صالحة.');setQuestions(qs);setUsedQuestions([]);setMessage(`تم تجهيز ${qs.length} سؤالًا. راجعيها قبل بدء الحصة.`);setTab('questions');}catch(err){setMessage(err.message);}finally{setBusy(false);}}
  function resetLesson(){if(!window.confirm('هل تريدين بدء حصة جديدة ومسح نتائج الحصة الحالية؟'))return;clearTimeout(spinRef.current);setSpinning(false);setPicked(null);setActiveQuestion(null);setUsedStudents([]);setUsedQuestions([]);setHistory([]);setSeconds(duration);setRunning(false);setMessage('تم بدء حصة جديدة.');setTab('prepare');}
  function printReport(){window.print();}
  return <main className="app" dir="rtl">
    <header className="top"><div className="brand"><span className="flag">🇴🇲</span><div><h1>حصتي الذكية</h1><p>حصة منظمة، مشاركة ممتعة، وتعلم يناسب الجميع</p></div></div><button className="subtle" onClick={resetLesson}>✨ حصة جديدة</button></header>
    <nav className="tabs">{[['prepare','📚 تجهيز الدرس'],['students','👥 الطلبة'],['wheel','🎡 العجلة'],['questions','✨ الأسئلة'],['report','📊 التقرير']].map(([id,label])=><button key={id} className={tab===id?'selected':''} onClick={()=>setTab(id)}>{label}</button>)}</nav>
    {message&&<div className="notice" role="status">{message}<button onClick={()=>setMessage('')} aria-label="إغلاق">×</button></div>}
    {tab==='prepare'&&<section className="panel"><div className="sectionHead"><div><span className="eyebrow">خطوتك الأولى</span><h2>جهّزي درسًا مميزًا</h2><p>اكتبي عنوان الدرس أو أرفقي صور صفحاته، ثم راجعي الأسئلة الناتجة.</p></div><span className="illustration">📖</span></div><form onSubmit={generate} className="form"><label>عنوان الدرس<input required={!lessonText.trim()} value={title} onChange={e=>setTitle(e.target.value)} placeholder="مثل: أحمي ذاتي"/></label><div className="two"><label>الصف<select value={grade} onChange={e=>setGrade(e.target.value)}>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>الصف {i+1}</option>)}</select></label><label>المادة<input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="اسم المادة"/></label></div><label>نص الدرس (اختياري)<textarea rows="3" value={lessonText} onChange={e=>setLessonText(e.target.value)} placeholder="يمكنك لصق محتوى الدرس هنا"/></label><label>صور الدرس (اختياري)<input type="file" name="images" accept="image/*" multiple/></label><button className="primary" disabled={busy}>{busy?'جاري التجهيز...':'✨ توليد الأسئلة بالذكاء الاصطناعي'}</button></form></section>}
    {tab==='students'&&<div className="twoPanels"><section className="panel"><h2>📷 استيراد أسماء الطلبة</h2><p>صوّري كشف الأسماء، وراجعي النتيجة قبل اعتمادها.</p><form onSubmit={extractStudents} className="form"><input ref={fileRef} type="file" accept="image/*" required/><button className="primary" disabled={busy}>{busy?'جاري القراءة...':'استخراج الأسماء من الصورة'}</button></form><div className="separator">أو أضيفي اسمًا يدويًا</div><form onSubmit={e=>{e.preventDefault();const name=e.currentTarget.elements.student.value.trim();if(name)setStudents(v=>[...v,{name,level:2}]);e.currentTarget.reset();}} className="inlineForm"><input name="student" placeholder="اسم الطالب أو الطالبة" required/><button className="secondary">إضافة +</button></form></section><section className="panel"><h2>👥 قائمة الطلبة ({students.length})</h2>{draft.length>0&&<div className="review"><h3>🔎 مراجعة الأسماء المستخرجة ({draft.length})</h3>{draft.map((s,i)=><div className="studentRow" key={i}><input value={s.name} onChange={e=>setDraft(v=>v.map((x,j)=>i===j?{...x,name:e.target.value}:x))}/><button className="iconButton" onClick={()=>setDraft(v=>v.filter((_,j)=>j!==i))}>×</button></div>)}<button className="primary" onClick={()=>{setStudents(v=>[...v,...draft.filter(s=>s.name.trim())]);setDraft([]);setMessage('تم اعتماد الأسماء وإضافتها إلى العجلة.');}}>اعتماد الأسماء</button><button className="subtle" onClick={()=>setDraft([])}>إلغاء</button></div>}{students.length===0?<p className="empty">لم تُضف أسماء بعد.</p>:<div className="studentList">{students.map((s,i)=><div className="studentRow" key={i}><input aria-label="اسم الطالب" value={s.name} onChange={e=>setStudents(v=>v.map((x,j)=>i===j?{...x,name:e.target.value}:x))}/><select aria-label="مستوى الطالب" value={s.level} onChange={e=>setStudents(v=>v.map((x,j)=>i===j?{...x,level:Number(e.target.value)}:x))}>{LEVELS.map((l,j)=><option key={l} value={j+1}>{l}</option>)}</select><button className="iconButton" title="حذف" onClick={()=>setStudents(v=>v.filter((_,j)=>j!==i))}>×</button></div>)}</div>}</section></div>}
    {tab==='wheel'&&<div className="twoPanels wheelLayout"><section className="panel wheelPanel"><h2>🎡 عجلة الاختيار</h2><p>اختيار عشوائي للطلبة، مع سؤال يناسب مستوى كل طالب.</p><div className="wheelStage"><div className="pointer">▼</div><div className="wheel" style={{background:wheel,transform:`rotate(${spin}deg)`}}>{students.length>0&&students.map((s,i)=>{const a=((i+.5)*360/students.length-90)*Math.PI/180;return <span key={i} className="wheelName" style={{left:`${50+32*Math.cos(a)}%`,top:`${50+32*Math.sin(a)}%`}}>{s.name.split(' ').slice(0,2).join(' ')}</span>})}<div className="hub">🇴🇲</div></div></div><button className="primary" disabled={spinning||!students.length} onClick={chooseStudent}>{spinning?'العجلة تدور...':'🎡 دوّري العجلة'}</button></section><section className="panel"><h2>🎯 مشاركة الطالب</h2>{picked?<><div className="chosen"><strong>{picked.name}</strong><span>المستوى: {levelText(picked.level)}</span></div>{activeQuestion?<div className="questionCard"><span className="level">{levelText(activeQuestion.level)}</span><h3>{activeQuestion.question}</h3>{activeQuestion.options.length>0&&<div className="options">{activeQuestion.options.map((o,i)=><div key={i}>{o}</div>)}</div>}{showHint&&<p className="answer">💡 {activeQuestion.hint||'لا يوجد تلميح لهذا السؤال.'}</p>}{showAnswer&&<p className="answer">✅ {activeQuestion.answer||'لم تُحدَّد إجابة نموذجية.'}</p>}<div className="actions"><button className="secondary" onClick={()=>setShowHint(v=>!v)}>💡 تلميح</button><button className="secondary" onClick={()=>setShowAnswer(v=>!v)}>👁️ الإجابة</button><button className="secondary" onClick={()=>pickQuestion(picked.level)}>🔄 سؤال آخر</button></div><div className="actions"><button className="primary" onClick={()=>record(true)}>⭐ أجاب بشكل صحيح</button><button className="subtle" onClick={()=>record(false)}>يحتاج دعمًا</button></div></div>:<p className="empty">لا يوجد سؤال متاح. جهّزي الأسئلة من تبويب «الأسئلة».</p>}</>:<p className="empty">دوّري العجلة لاختيار طالب وبدء التحدي.</p>}<div className="timer"><h3>⏱️ مؤقت النشاط</h3><div className={`clock ${seconds<=60?'urgent':''}`}>{minute}:{second}</div><div className="actions">{[300,420,600].map(s=><button key={s} className={duration===s?'secondary active':'subtle'} onClick={()=>{setDuration(s);setSeconds(s);setRunning(false);}}>{s/60} دقائق</button>)}</div><div className="actions"><button className="secondary" onClick={()=>setRunning(v=>!v)} disabled={seconds===0}>{running?'إيقاف مؤقت':'بدء'}</button><button className="subtle" onClick={()=>{setSeconds(duration);setRunning(false);}}>إعادة ضبط</button></div></div></section></div>}
    {tab==='questions'&&<section className="panel"><div className="sectionHead"><div><h2>✨ بنك الأسئلة ({questions.length})</h2><p>راجعي الأسئلة وعدّليها قبل الحصة. كل سؤال مرتبط بمستوى.</p></div><button className="secondary" onClick={()=>setQuestions(v=>[...v,{id:`manual-${Date.now()}`,question:'',answer:'',hint:'',level:2,options:[]}])}>+ سؤال جديد</button></div>{questions.length===0?<p className="empty">لم تُجهّز الأسئلة بعد. ابدئي من «تجهيز الدرس».</p>:<div className="questionList">{questions.map((q,i)=><div className="questionEditor" key={q.id}><div className="questionTop"><b>السؤال {i+1}</b><select value={q.level} onChange={e=>setQuestions(v=>v.map(x=>x.id===q.id?{...x,level:Number(e.target.value)}:x))}>{LEVELS.map((l,j)=><option key={l} value={j+1}>{l}</option>)}</select><button className="iconButton" onClick={()=>setQuestions(v=>v.filter(x=>x.id!==q.id))}>حذف</button></div>{[['question','السؤال'],['answer','الإجابة'],['hint','التلميح']].map(([field,label])=><label key={field}>{label}<textarea rows={field==='question'?2:1} value={q[field]} onChange={e=>setQuestions(v=>v.map(x=>x.id===q.id?{...x,[field]:e.target.value}:x))}/></label>)}{q.options.length>0&&<p className="optionsNote">الاختيارات: {q.options.join(' • ')}</p>}</div>)}</div>}<button className="primary" onClick={()=>setTab('wheel')}>🎡 الانتقال إلى عجلة الطلبة</button></section>}
    {tab==='report'&&<section className="panel"><div className="sectionHead"><div><h2>📊 تقرير الحصة</h2><p>{title||'حصة تعليمية'} — الصف {grade} — {subject}</p></div><button className="secondary noPrint" onClick={printReport}>🖨️ طباعة / حفظ PDF</button></div><div className="stats"><div><b>{history.length}</b><span>المشاركات</span></div><div><b>{uniqueCount}</b><span>طلبة مشاركون</span></div><div><b>{correctCount}</b><span>إجابات صحيحة</span></div><div><b>{history.length?Math.round(correctCount/history.length*100):0}%</b><span>نسبة الإجابات الصحيحة</span></div></div>{history.length===0?<p className="empty">ستظهر النتائج هنا بعد مشاركة الطلبة في العجلة.</p>:<div className="tableWrap"><table><thead><tr><th>الطالب</th><th>المستوى</th><th>السؤال</th><th>النتيجة</th></tr></thead><tbody>{history.map((h,i)=><tr key={i}><td>{h.student}</td><td>{levelText(h.level)}</td><td>{h.question}</td><td>{h.correct?'صحيحة ⭐':'يحتاج دعمًا'}</td></tr>)}</tbody></table></div>}</section>}
    <footer>إعداد وتصميم: أ. ثريا المعمري <span>🇴🇲</span></footer>
  </main>;
}
