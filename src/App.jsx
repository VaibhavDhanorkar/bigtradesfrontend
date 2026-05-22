import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ─── API CONFIG ──────────────────────────────────────────────────────────────
const API_BASE = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL)
  ? import.meta.env.VITE_API_URL
  : "https://api.bigtrades.veloxtrader.com";
const WS_BASE = API_BASE.replace("https://","wss://").replace("http://","ws://");

// ─── IVORY + LIGHT ORANGE THEME ───────────────────────────────────────────────
const T = {
  // Backgrounds
  bg:        "#FAF8F5",        // warm ivory
  bgCard:    "#FFFFFF",        // pure white cards
  bgEl:      "#F5F2EE",        // slightly warm elevated
  bgIn:      "#EDE9E3",        // input background
  bgDark:    "#2C2418",        // dark text / headers

  // Brand colours
  acc:       "#E8640A",        // light orange (primary)
  accLight:  "#FFF0E6",        // orange tint background
  accMid:    "#F5924A",        // medium orange
  grn:       "#1A8C4E",        // forest green (bullish)
  grnLight:  "#E8F5EE",        // green tint
  red:       "#C0392B",        // deep red (bearish)
  redLight:  "#FDECEE",        // red tint
  amb:       "#D97706",        // amber (watch)
  ambLight:  "#FEF3C7",        // amber tint
  pur:       "#6D28D9",        // purple (congress)
  purLight:  "#F5F3FF",        // purple tint

  // Text
  txt:       "#1C1917",        // near-black
  txtMed:    "#44403C",        // medium
  mut:       "#78716C",        // muted stone
  dim:       "#A8A29E",        // dimmed

  // Borders
  bdr:       "rgba(0,0,0,0.08)",
  bdrH:      "rgba(232,100,10,0.4)",
  bdrCard:   "rgba(0,0,0,0.06)",

  // Gradients
  gradA:     "linear-gradient(135deg,#E8640A,#F5924A)",
  gradG:     "linear-gradient(135deg,#1A8C4E,#22C55E)",
  gradR:     "linear-gradient(135deg,#C0392B,#E74C3C)",

  // Shadow
  shadow:    "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
  shadowMd:  "0 4px 12px rgba(0,0,0,0.1)",
};

// ─── SAFE FORMATTERS ──────────────────────────────────────────────────────────
const fmt = (val, dp=2, pre="$") => {
  if (val===undefined||val===null||val===""||isNaN(Number(val))) return "—";
  return `${pre}${Number(val).toFixed(dp)}`;
};
const fmtPct = (val) => {
  if (val===undefined||val===null||val===""||isNaN(Number(val))) return "—";
  const n=Number(val); return `${n>=0?"+":""}${n.toFixed(1)}%`;
};
const fmtRR = (val) => {
  if (!val||isNaN(Number(val))) return "—";
  return `${Number(val).toFixed(1)}:1`;
};

// ─── API CLIENT ──────────────────────────────────────────────────────────────
const api = {
  async get(path) {
    try { const r=await fetch(`${API_BASE}${path}`); if(!r.ok) throw new Error(`${r.status}`); return r.json(); }
    catch(e){ console.warn(`GET ${path}:`,e.message); return null; }
  },
  async post(path,body) {
    try { const r=await fetch(`${API_BASE}${path}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}); if(!r.ok) throw new Error(`${r.status}`); return r.json(); }
    catch(e){ console.warn(`POST ${path}:`,e.message); return null; }
  },
};

// ─── WEBSOCKET ────────────────────────────────────────────────────────────────
function useWS(onMsg) {
  const ws=useRef(null), timer=useRef(null);
  const [connected,setConnected]=useState(false);
  const connect=useCallback(()=>{
    try {
      ws.current=new WebSocket(`${WS_BASE}/ws`);
      ws.current.onopen=()=>{ setConnected(true); const p=setInterval(()=>ws.current?.readyState===1&&ws.current.send("ping"),25000); ws.current._p=p; };
      ws.current.onmessage=e=>{ try{onMsg(JSON.parse(e.data));}catch{} };
      ws.current.onclose=()=>{ setConnected(false); clearInterval(ws.current?._p); timer.current=setTimeout(connect,3000); };
      ws.current.onerror=()=>ws.current?.close();
    } catch { timer.current=setTimeout(connect,5000); }
  },[onMsg]);
  useEffect(()=>{ connect(); return()=>{ clearTimeout(timer.current); ws.current?.close(); }; },[connect]);
  return connected;
}

// ─── SIGNAL MODES (replaces HORIZONS) ──────────────────────────────────────────
// Each mode = distinct signal type, scoring weight, hold strategy, paper trade rules
const SIGNAL_MODES = [
  { id:"SURGE",    label:"Surge",    icon:"⚡",
    color:"#C0392B", bg:"#FDECEE",
    desc:"Volume explosion + catalyst. QUICKY-type. Any tier. Tight stop, fast TP.",
    holdDesc:"1–5 days",  riskLevel:"Extreme", examples:"QUICY, penny defense plays, FDA catalysts" },
  { id:"SWING",    label:"Swing",    icon:"🌊",
    color:"#E8640A", bg:"#FFF0E6",
    desc:"3–10 day catalyst momentum. Clear entry/TP/stop. Most common mode.",
    holdDesc:"3–10 days", riskLevel:"High",    examples:"PLTR on contract, RKLB on NASA deal" },
  { id:"POSITION", label:"Position", icon:"🧗",
    color:"#1A8C4E", bg:"#E8F5EE",
    desc:"Fundamental 1–6 month thesis. Wide targets. SNDK-type.",
    holdDesc:"1–6 months",riskLevel:"Medium",  examples:"SNDK AI memory cycle, NVDA AI capex" },
  { id:"HOLD",     label:"Hold",     icon:"📌",
    color:"#6D28D9", bg:"#F5F3FF",
    desc:"Don't-sell conviction check. Is the thesis still intact?",
    holdDesc:"Ongoing",    riskLevel:"Low",      examples:"SNDK holders on dip, PLTR long-term" },
  { id:"RADAR",    label:"Radar",    icon:"📡",
    color:"#D97706", bg:"#FEF3C7",
    desc:"Pre-surge watch. Volume creeping. No position yet – conditions building.",
    holdDesc:"Watch only",riskLevel:"Watch",    examples:"QUICY day before drone deal announcement" },
];

// ─── SCORE UTILS ──────────────────────────────────────────────────────────────
const scoreColor = s => s>=80?T.grn:s>=65?T.acc:s>=50?T.amb:T.red;
const scoreBg    = s => s>=80?T.grnLight:s>=65?T.accLight:s>=50?T.ambLight:T.redLight;
const levelBadge = l => ({
  CONVICTION:{bg:T.grnLight,text:T.grn,border:"#1A8C4E30"},
  "STRONG BUY":{bg:T.accLight,text:T.acc,border:"#E8640A30"},
  BUY:       {bg:T.purLight,text:T.pur,border:"#6D28D930"},
  WATCH:     {bg:T.ambLight,text:T.amb,border:"#D9770630"},
  DEVELOPING:{bg:"#F5F5F4",text:T.mut,border:"rgba(0,0,0,0.1)"},
  PASS:      {bg:T.redLight,text:T.red,border:"#C0392B30"},
}[l]||{bg:T.ambLight,text:T.amb,border:"#D9770630"});
const tierColor  = t => ({NANO:T.red,SMALL:T.amb,MID:T.acc,LARGE:T.grn,ETF:T.pur}[t]||T.mut);
const tierBg     = t => ({NANO:T.redLight,SMALL:T.ambLight,MID:T.accLight,LARGE:T.grnLight,ETF:T.purLight}[t]||T.bgEl);

// ─── PRIMITIVES ───────────────────────────────────────────────────────────────
const Sparkline = ({data=[],color,h=36,w=80})=>{
  if(!data?.length) return null;
  const mn=Math.min(...data), mx=Math.max(...data),rng=mx-mn||1;
  const pts=data.map((v,i)=>`${(i/(data.length-1))*w},${h-((v-mn)/rng)*(h-6)-3}`).join(" ");
  const id=`sp${color.replace(/[^a-z0-9]/gi,"")}`;
  return (<svg width={w} height={h} style={{overflow:"visible"}}>
    <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity="0.2"/>
      <stop offset="100%" stopColor={color} stopOpacity="0"/>
    </linearGradient></defs>
    <polygon points={`${pts} ${w},${h} 0,${h}`} fill={`url(#${id})`}/>
    <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>);
};

const ScoreRing = ({score=0,size=52})=>{
  const r=(size-6)/2,circ=2*Math.PI*r,dash=(score/100)*circ,color=scoreColor(score),bg=scoreBg(score);
  return (<svg width={size} height={size} style={{transform:"rotate(-90deg)",flexShrink:0}}>
    <circle cx={size/2} cy={size/2} r={r} fill={bg} stroke="rgba(0,0,0,0.06)" strokeWidth="3"/>
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="3"
      strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"/>
    <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
      style={{fill:color,fontSize:size>48?13:10,fontWeight:800,transform:`rotate(90deg)`,
      transformOrigin:`${size/2}px ${size/2}px`,fontFamily:"system-ui"}}>{score}</text>
  </svg>);
};

const Tag = ({text,color,bg})=>(
  <span style={{fontSize:10,padding:"3px 8px",borderRadius:20,background:bg||`${color}18`,
    color,border:`1px solid ${color}30`,fontWeight:700,whiteSpace:"nowrap",display:"inline-block"}}>{text}</span>
);

const Chip = ({label,active,onClick,color})=>(
  <button onClick={onClick} style={{background:active?(color||T.acc):T.bgEl,
    border:`1.5px solid ${active?(color||T.acc):T.bdr}`,
    color:active?T.bgCard:T.mut,borderRadius:20,padding:"7px 16px",fontSize:12,fontWeight:600,
    cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,transition:"all 0.15s",
    boxShadow:active?`0 2px 8px ${color||T.acc}30`:"none"}}>{label}</button>
);

const Divider = ()=><div style={{height:1,background:T.bdr,margin:"12px 0"}}/>;

const LoadingPulse = ({lines=3})=>(
  <div style={{padding:"0 0 16px"}}>
    {Array.from({length:lines}).map((_,i)=>(
      <div key={i} style={{height:14,background:T.bgEl,borderRadius:7,marginBottom:10,
      width:`${65+i*10}%`,animation:"pulse 1.5s ease infinite"}}/>
    ))}
  </div>
);

const StatusDot = ({connected})=>(
  <div style={{display:"flex",alignItems:"center",gap:5}}>
    <div style={{width:7,height:7,borderRadius:"50%",background:connected?T.grn:T.amb,
      boxShadow:`0 0 6px ${connected?T.grn:T.amb}80`}}/>
    <span style={{fontSize:11,color:T.mut,fontWeight:500}}>{connected?"Live":"Offline"}</span>
  </div>
);

const EmptyState = ({icon,title,subtitle})=>(
  <div style={{textAlign:"center",padding:"48px 20px",color:T.dim}}>
    <div style={{fontSize:40,marginBottom:12}}>{icon}</div>
    <div style={{fontSize:15,fontWeight:600,color:T.txtMed,marginBottom:6}}>{title}</div>
    {subtitle && <div style={{fontSize:13,color:T.mut}}>{subtitle}</div>}
  </div>
);

const ScoreBar = ({label,score,max,color})=>(
  <div style={{marginBottom:12}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
      <span style={{fontSize:13,fontWeight:600,color:T.txt}}>{label}</span>
      <span style={{fontSize:13,fontWeight:700,color}}>{score}/{max}</span>
    </div>
    <div style={{height:8,background:T.bgEl,borderRadius:4,overflow:"hidden"}}>
      <div style={{height:"100%",width:`${(score/max)*100}%`,background:color,transition:"width 0.3s"}}/>
    </div>
  </div>
);

const TargetRow = ({label,price,pct,color})=>(
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${T.bdr}`}}>
    <span style={{fontSize:13,color:T.txt,fontWeight:500}}>{label}</span>
    <div style={{textAlign:"right"}}>
      <div style={{fontSize:14,fontWeight:700,color:T.txt}}>{fmt(price)}</div>
      <div style={{fontSize:12,color,fontWeight:600}}>{fmtPct(pct)}</div>
    </div>
  </div>
);

// ─── AI CHAT ───────────────────────────────────────────────────────────────────
const AIChatPanel = ({context,onClose})=>{
  const [msgs,setMsgs]=useState([]), [inp,setInp]=useState(""), [loading,setLoading]=useState(false);
  const send=async()=>{
    if(!inp.trim()) return;
    const userMsg={role:"user",content:inp};
    setMsgs(m=>[...m,userMsg]);
    setInp("");
    setLoading(true);
    const res=await api.post("/api/chat",{messages:[...msgs,userMsg],context});
    setLoading(false);
    if(res?.message) setMsgs(m=>[...m,{role:"assistant",content:res.message}]);
  };
  return (<div style={{position:"fixed",bottom:0,left:0,right:0,top:0,background:"rgba(0,0,0,0.6)",zIndex:1000,display:"flex",flexDirection:"column"}}>
    <div style={{flex:1,overflowY:"auto",padding:"20px",display:"flex",flexDirection:"column",gap:10}}>
      {msgs.map((m,i)=>(
        <div key={i} style={{alignSelf:m.role==="user"?"flex-end":"flex-start",maxWidth:"80%",
          background:m.role==="user"?T.acc:T.bgCard,color:m.role==="user"?T.bgCard:T.txt,
          padding:"10px 14px",borderRadius:12,fontSize:13,wordBreak:"break-word"}}>{m.content}</div>
      ))}
      {loading && <LoadingPulse lines={1}/>}
    </div>
    <div style={{padding:"12px 16px",borderTop:`1px solid ${T.bdr}`,display:"flex",gap:8,background:T.bgCard}}>
      <input type="text" value={inp} onChange={e=>setInp(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} 
        placeholder="Ask about signal..." style={{flex:1,padding:"8px 12px",border:`1px solid ${T.bdr}`,borderRadius:6,fontSize:13,fontFamily:"system-ui"}}/>
      <button onClick={send} style={{padding:"8px 16px",background:T.acc,color:T.bgCard,border:"none",borderRadius:6,fontWeight:600,cursor:"pointer"}}>Send</button>
      <button onClick={onClose} style={{padding:"8px 12px",background:T.bgEl,color:T.txt,border:"none",borderRadius:6,cursor:"pointer"}}>✕</button>
    </div>
  </div>);
};

// ─── SIGNAL DETAIL ─────────────────────────────────────────────────────────────
const SignalDetail = ({signal,onClose})=>{
  const [detail,setDetail]=useState(null), [loading,setLoading]=useState(true), [showChat,setShowChat]=useState(false);
  
  const refresh=async()=>{
    setLoading(true);
    const d=await api.get(`/api/signal/${signal.id}`);
    if(d) setDetail(d);
    setLoading(false);
  };

  const Sec = ({icon,title,color,children})=>(
    <div style={{marginBottom:20}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <span style={{fontSize:16}}>{icon}</span>
        <h3 style={{fontSize:14,fontWeight:700,color:color||T.txt,margin:0}}>{title}</h3>
      </div>
      {children}
    </div>
  );

  useEffect(()=>{refresh();},[signal.id]);
  if(loading) return <EmptyState icon="⏳" title="Loading..." />;
  if(!detail) return <EmptyState icon="✕" title="Signal Not Found" />;

  return (<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}>
    <div style={{background:T.bgCard,borderRadius:12,maxWidth:500,width:"100%",maxHeight:"90vh",overflowY:"auto",padding:"20px",boxShadow:T.shadowMd}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"start",marginBottom:16}}>
        <div>
          <h2 style={{fontSize:18,fontWeight:700,margin:0,color:T.txt}}>{detail.symbol}</h2>
          <p style={{fontSize:13,color:T.mut,margin:"4px 0 0"}}>{detail.name}</p>
        </div>
        <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer"}}>✕</button>
      </div>
      <Divider/>
      <Sec icon="📊" title="Score" color={scoreColor(detail.score)}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <ScoreRing score={detail.score} size={64}/>
          <div>
            <div style={{fontSize:24,fontWeight:800,color:scoreColor(detail.score)}}>{detail.score}</div>
            <Tag text={detail.level} color={levelBadge(detail.level).text} bg={levelBadge(detail.level).bg}/>
          </div>
        </div>
      </Sec>
      <Sec icon="🎯" title="Mode">
        <Tag text={SIGNAL_MODES.find(m=>m.id===detail.mode)?.label||detail.mode} 
          color={SIGNAL_MODES.find(m=>m.id===detail.mode)?.color}/>
      </Sec>
      <Sec icon="💰" title="Targets" color={T.acc}>
        {detail.targets && detail.targets.map((t,i)=>(
          <TargetRow key={i} label={`Target ${i+1}`} price={t.price} pct={((t.price-detail.price)/detail.price)*100} color={T.acc}/>
        ))}
      </Sec>
      <Divider/>
      <div style={{display:"flex",gap:8}}>
        <button onClick={refresh} style={{flex:1,padding:"10px",background:T.bgEl,border:"none",borderRadius:6,fontWeight:600,cursor:"pointer"}}>↻ Refresh</button>
        <button onClick={()=>setShowChat(true)} style={{flex:1,padding:"10px",background:T.acc,color:T.bgCard,border:"none",borderRadius:6,fontWeight:600,cursor:"pointer"}}>💬 Ask AI</button>
      </div>
      {showChat && <AIChatPanel context={detail} onClose={()=>setShowChat(false)}/>}
    </div>
  </div>);
};

// ─── SIGNAL CARD (list) ────────────────────────────────────────────────────────
const SignalCard = ({signal:s,onClick})=>{
  const mode=SIGNAL_MODES.find(m=>m.id===s.mode);
  return (<div onClick={onClick} style={{background:T.bgCard,border:`1.5px solid ${T.bdrCard}`,borderRadius:10,
    padding:12,cursor:"pointer",transition:"all 0.2s",boxShadow:T.shadow,
    ":hover":{boxShadow:T.shadowMd,borderColor:mode?.color}}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"start",marginBottom:8}}>
      <div>
        <h3 style={{fontSize:15,fontWeight:700,color:T.txt,margin:0}}>{s.symbol}</h3>
        <p style={{fontSize:12,color:T.mut,margin:"2px 0 0"}}>{s.name}</p>
      </div>
      <ScoreRing score={s.score} size={44}/>
    </div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,fontSize:13}}>
      <Tag text={mode?.label||s.mode} color={mode?.color}/>
      <span style={{fontWeight:700,color:s.direction>0?T.grn:T.red}}>{fmt(s.price)} {fmtPct(s.direction)}</span>
    </div>
    {s.sparklineData && <Sparkline data={s.sparklineData} color={mode?.color} h={30} w="100%"/>}
  </div>);
};

// ─── HOME SCREEN ──────────────────────────────────────────────────────────────
const HomeScreen = ({signals,loading,connected,onSelect,market,horizon,setHorizon})=>{
  return (<div style={{padding:"16px 12px 80px"}}>
    <div style={{display:"flex",gap:8,marginBottom:16,overflowX:"auto",paddingBottom:8}}>
      {SIGNAL_MODES.map(m=>(
        <Chip key={m.id} label={m.label} active={horizon===m.id} onClick={()=>setHorizon(m.id)} color={m.color}/>
      ))}
    </div>
    {loading ? <LoadingPulse/> : signals.length===0 ? <EmptyState icon="📭" title="No signals" subtitle="Check back soon"/> :
      <div style={{display:"grid",gridTemplateColumns:"1fr",gap:10}}>
        {signals.map(s=><SignalCard key={s.id} signal={s} onClick={()=>onSelect(s)}/>)}
      </div>
    }
  </div>);
};

// ─── CONGRESS SCREEN ──────────────────────────────────────────────────────────
const CongressScreen = ({data,loading})=>{
  return (<div style={{padding:"16px 12px 80px"}}>
    {loading ? <LoadingPulse/> : data?.length===0 ? <EmptyState icon="📜" title="No trades" subtitle="Congress trading data"/> :
      <div style={{display:"grid",gridTemplateColumns:"1fr",gap:10}}>
        {data.map((t,i)=>(
          <div key={i} style={{background:T.bgCard,border:`1px solid ${T.bdrCard}`,borderRadius:10,padding:12}}>
            <div style={{fontSize:13,fontWeight:600,color:T.txt,marginBottom:4}}>{t.name}</div>
            <div style={{fontSize:12,color:T.mut}}>{t.action} - {fmt(t.amount)} on {new Date(t.date).toLocaleDateString()}</div>
          </div>
        ))}
      </div>
    }
  </div>);
};

// ─── NEWS SCREEN ──────────────────────────────────────────────────────────────
const NewsScreen = ({data,loading})=>{
  return (<div style={{padding:"16px 12px 80px"}}>
    {loading ? <LoadingPulse/> : data?.length===0 ? <EmptyState icon="📰" title="No news" subtitle="Check market news"/> :
      <div style={{display:"grid",gridTemplateColumns:"1fr",gap:10}}>
        {data.map((n,i)=>(
          <div key={i} style={{background:T.bgCard,border:`1px solid ${T.bdrCard}`,borderRadius:10,padding:12}}>
            <div style={{fontSize:13,fontWeight:600,color:T.txt,marginBottom:4}}>{n.title}</div>
            <div style={{fontSize:12,color:T.mut,marginBottom:6}}>{n.summary}</div>
            <a href={n.url} target="_blank" rel="noopener" style={{fontSize:11,color:T.acc,fontWeight:600,textDecoration:"none"}}>Read →</a>
          </div>
        ))}
      </div>
    }
  </div>);
};

// ─── SETTINGS SCREEN ──────────────────────────────────────────────────────────
const SettingsScreen = ({connected,onSettingsSaved})=>{
  const [apiKey,setApiKey]=useState(""), [webhook,setWebhook]=useState(""), [tg,setTg]=useState("");
  const [status,setStatus]=useState("");

  const save=async()=>{
    setStatus("Saving...");
    const ok=await api.post("/api/settings",{apiKey,webhook,telegramWebhook:tg});
    setStatus(ok?"✓ Saved!":"✕ Error");
    setTimeout(()=>setStatus(""),2000);
    if(ok) onSettingsSaved?.();
  };

  const testTelegram=async()=>{
    setStatus("Testing...");
    const ok=await api.post("/api/test-telegram",{webhook:tg});
    setStatus(ok?"✓ Sent!":"✕ Failed");
    setTimeout(()=>setStatus(""),2000);
  };

  const runDebug=async()=>{
    setStatus("Running...");
    const ok=await api.post("/api/debug",{});
    setStatus(ok?"✓ Complete":"✕ Error");
    setTimeout(()=>setStatus(""),2000);
  };

  const Inp=({label,value,onChange,placeholder})=>(
    <div style={{marginBottom:12}}>
      <label style={{display:"block",fontSize:12,fontWeight:600,color:T.txt,marginBottom:6}}>{label}</label>
      <input type="text" value={value} onChange={onChange} placeholder={placeholder}
        style={{width:"100%",padding:"10px 12px",border:`1px solid ${T.bdr}`,borderRadius:6,fontSize:12,fontFamily:"monospace",boxSizing:"border-box"}}/>
    </div>
  );

  const GrpCard=({title,children})=>(
    <div style={{background:T.bgCard,border:`1px solid ${T.bdrCard}`,borderRadius:10,padding:14,marginBottom:14}}>
      <h3 style={{fontSize:13,fontWeight:700,color:T.txt,margin:"0 0 12px"}}>{title}</h3>
      {children}
    </div>
  );

  return (<div style={{padding:"16px 12px 80px"}}>
    <GrpCard title="API Setup">
      <Inp label="API Key" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="sk-..."/>
      <Inp label="Webhook URL" value={webhook} onChange={e=>setWebhook(e.target.value)} placeholder="https://..."/>
    </GrpCard>
    <GrpCard title="Telegram">
      <Inp label="Webhook" value={tg} onChange={e=>setTg(e.target.value)} placeholder="https://..."/>
      <button onClick={testTelegram} style={{width:"100%",padding:"8px",background:T.bgEl,border:"none",borderRadius:6,cursor:"pointer",fontWeight:600,fontSize:12}}>Test</button>
    </GrpCard>
    <div style={{display:"flex",gap:8}}>
      <button onClick={save} style={{flex:1,padding:"12px",background:T.acc,color:T.bgCard,border:"none",borderRadius:6,fontWeight:600,cursor:"pointer"}}>💾 Save</button>
      <button onClick={runDebug} style={{flex:1,padding:"12px",background:T.bgEl,border:"none",borderRadius:6,fontWeight:600,cursor:"pointer"}}>🐛 Debug</button>
    </div>
    {status && <div style={{marginTop:12,textAlign:"center",fontSize:13,fontWeight:600,color:status.includes("✕")?T.red:T.grn}}>{status}</div>}
  </div>);
};

// ─── PAPER TRADING SCREEN ──────────────────────────────────────────────────────
const PaperScreen = () => {
  const [portfolio,setPortfolio]=useState([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    const load = async () => {
      const data=await api.get("/api/paper/portfolio");
      if(data) setPortfolio(data);
      setLoading(false);
    };
    load();
  },[]);

  const PnlBadge = ({pct}) => (
    <span style={{padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:700,
      background:pct>=0?T.grnLight:T.redLight,color:pct>=0?T.grn:T.red}}>
      {pct>=0?"+":""}{pct.toFixed(1)}%
    </span>
  );

  if(loading) return <LoadingPulse/>;
  return (<div style={{padding:"16px 12px 80px"}}>
    {portfolio.length===0 ? <EmptyState icon="📋" title="No trades" subtitle="Paper trading"/> :
      <div style={{display:"grid",gridTemplateColumns:"1fr",gap:10}}>
        {portfolio.map((p,i)=>(
          <div key={i} style={{background:T.bgCard,border:`1px solid ${T.bdrCard}`,borderRadius:10,padding:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"start",marginBottom:8}}>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:T.txt}}>{p.symbol}</div>
                <div style={{fontSize:12,color:T.mut}}>{p.shares} shares @ {fmt(p.entry)}</div>
              </div>
              <PnlBadge pct={p.pnl_pct}/>
            </div>
          </div>
        ))}
      </div>
    }
  </div>);
};

const BottomNav = ({active,onChange})=>(
  <div style={{position:"fixed",bottom:0,left:0,right:0,height:56,background:T.bgCard,borderTop:`1px solid ${T.bdr}`,
    display:"flex",justifyContent:"space-around",alignItems:"center",zIndex:100}}>
    {[{id:"home",icon:"📊",label:"Signals"},{id:"congress",icon:"📜",label:"Congress"},{id:"news",icon:"📰",label:"News"},
      {id:"paper",icon:"📋",label:"Paper"},{id:"settings",icon:"⚙️",label:"Settings"}].map(t=>(
      <button key={t.id} onClick={()=>onChange(t.id)} 
        style={{flex:1,height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,
          background:active===t.id?T.bgEl:"transparent",border:"none",cursor:"pointer",transition:"all 0.2s",
          color:active===t.id?T.txt:T.mut,fontSize:12,fontWeight:600}}>
        <span style={{fontSize:18}}>{t.icon}</span><span>{t.label}</span>
      </button>
    ))}
  </div>
);

// ─── APP ROOT ──────────────────────────────────────────────────────────────────
export default function App() {
  const [screen,setScreen]=useState("home"), [horizon,setHorizon]=useState("SWING");
  const [signals,setSignals]=useState([]), [congress,setCongress]=useState([]), [news,setNews]=useState([]);
  const [loading,setLoading]=useState(true), [selected,setSelected]=useState(null), [showDetail,setShowDetail]=useState(false);
  const connected=useWS(msg=>{
    if(msg.type==="signal") setSignals(s=>[msg.data,...s.slice(0,19)]);
    if(msg.type==="congress") setCongress(msg.data);
    if(msg.type==="news") setNews(msg.data);
  });

  const load=async()=>{
    setLoading(true);
    const [sigs,cong,n]=await Promise.all([
      api.get(`/api/signals?mode=${horizon}`),
      api.get("/api/congress"),
      api.get("/api/news")
    ]);
    if(sigs) setSignals(sigs);
    if(cong) setCongress(cong);
    if(n) setNews(n);
    setLoading(false);
  };

  useEffect(()=>{load();},[horizon]);
  useEffect(()=>{const iv=setInterval(load,30000); return()=>clearInterval(iv);},[horizon]);

  return (<div style={{background:T.bg,minHeight:"100vh",fontFamily:"system-ui,-apple-system,sans-serif"}}>
    <style>{`* { box-sizing:border-box; margin:0; padding:0; } body { background:${T.bg}; color:${T.txt}; } @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.6} } input:focus,button:focus { outline:2px solid ${T.acc}; outline-offset:2px; }`}</style>
    
    {screen==="home" && <HomeScreen signals={signals} loading={loading} connected={connected} onSelect={s=>{setSelected(s);setShowDetail(true);}} horizon={horizon} setHorizon={setHorizon}/>}
    {screen==="congress" && <CongressScreen data={congress} loading={loading}/>}
    {screen==="news" && <NewsScreen data={news} loading={loading}/>}
    {screen==="paper" && <PaperScreen/>}
    {screen==="settings" && <SettingsScreen connected={connected} onSettingsSaved={load}/>}

    <BottomNav active={screen} onChange={setScreen}/>
    {showDetail && selected && <SignalDetail signal={selected} onClose={()=>setShowDetail(false)}/>}
  </div>);
}
