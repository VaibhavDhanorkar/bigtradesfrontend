import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ─── API CONFIG ───────────────────────────────────────────────────────────────
const API_BASE = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL)
  ? import.meta.env.VITE_API_URL
  : "https://api.bigtrades.veloxtrader.com";
const WS_BASE = API_BASE.replace("https://","wss://").replace("http://","ws://");

// ─── IVORY + LIGHT ORANGE THEME ──────────────────────────────────────────────
const T = {
  // Backgrounds
  bg:       "#FAF8F5",       // warm ivory
  bgCard:   "#FFFFFF",       // pure white cards
  bgEl:     "#F5F2EE",       // slightly warm elevated
  bgIn:     "#EDE9E3",       // input background
  bgDark:   "#2C2418",       // dark text / headers

  // Brand colours
  acc:      "#E8640A",       // light orange (primary)
  accLight: "#FFF0E6",       // orange tint background
  accMid:   "#F5924A",       // medium orange
  grn:      "#1A8C4E",       // forest green (bullish)
  grnLight: "#E8F5EE",       // green tint
  red:      "#C0392B",       // deep red (bearish)
  redLight: "#FDECEA",       // red tint
  amb:      "#D97706",       // amber (watch)
  ambLight: "#FEF3C7",       // amber tint
  pur:      "#6D28D9",       // purple (congress)
  purLight: "#F5F3FF",       // purple tint

  // Text
  txt:      "#1C1917",       // near-black
  txtMed:   "#44403C",       // medium
  mut:      "#78716C",       // muted stone
  dim:      "#A8A29E",       // dimmed

  // Borders
  bdr:      "rgba(0,0,0,0.08)",
  bdrH:     "rgba(232,100,10,0.4)",
  bdrCard:  "rgba(0,0,0,0.06)",

  // Gradients
  gradA:    "linear-gradient(135deg,#E8640A,#F5924A)",
  gradG:    "linear-gradient(135deg,#1A8C4E,#22C55E)",
  gradR:    "linear-gradient(135deg,#C0392B,#E74C3C)",

  // Shadow
  shadow:   "0 1px 3px rgba(0,0,0,0.08),0 1px 2px rgba(0,0,0,0.06)",
  shadowMd: "0 4px 12px rgba(0,0,0,0.1)",
};

// ─── SAFE FORMATTERS ─────────────────────────────────────────────────────────
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

// ─── API CLIENT ───────────────────────────────────────────────────────────────
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

// ─── SIGNAL MODES (replaces HORIZONS) ───────────────────────────────────────
// Each mode = distinct signal type, scoring weight, hold strategy, paper trade rules
const SIGNAL_MODES = [
  { id:"SURGE",    label:"Surge",    icon:"⚡",
    color:"#C0392B", bg:"#FDECEA",
    desc:"Volume explosion + catalyst. QUCY-type. Any tier. Tight stop, fast TP.",
    holdDesc:"1–5 days",  riskLevel:"Extreme", examples:"QUCY, penny defense plays, FDA catalysts" },
  { id:"SWING",    label:"Swing",    icon:"📈",
    color:"#E8640A", bg:"#FFF0E6",
    desc:"3–10 day catalyst momentum. Clear entry/TP/stop. Most common mode.",
    holdDesc:"3–10 days", riskLevel:"High",    examples:"PLTR on contract, RKLB on NASA deal" },
  { id:"POSITION", label:"Position", icon:"🏗",
    color:"#1A8C4E", bg:"#E8F5EE",
    desc:"Fundamental 1–6 month thesis. Wide targets. SNDK-type.",
    holdDesc:"1–6 months",riskLevel:"Medium",  examples:"SNDK AI memory cycle, NVDA AI capex" },
  { id:"HOLD",     label:"Hold",     icon:"🛡",
    color:"#6D28D9", bg:"#F5F3FF",
    desc:"Don't-sell conviction check. Is the thesis still intact?",
    holdDesc:"Ongoing",   riskLevel:"Low",     examples:"SNDK holders on dip, PLTR long-term" },
  { id:"RADAR",    label:"Radar",    icon:"👁",
    color:"#D97706", bg:"#FEF3C7",
    desc:"Pre-surge watch. Volume creeping. No position yet — conditions building.",
    holdDesc:"Watch only",riskLevel:"Watch",   examples:"QUCY day before drone deal announcement" },
];

// ─── SCORE UTILS ─────────────────────────────────────────────────────────────
const scoreColor = s => s>=80?T.grn:s>=65?T.acc:s>=50?T.amb:T.red;
const scoreBg    = s => s>=80?T.grnLight:s>=65?T.accLight:s>=50?T.ambLight:T.redLight;
const levelBadge = l => ({
  CONVICTION: {bg:T.grnLight,text:T.grn,border:"#1A8C4E30"},
  "STRONG BUY":{bg:T.accLight,text:T.acc,border:"#E8640A30"},
  BUY:        {bg:T.purLight,text:T.pur,border:"#6D28D930"},
  WATCH:      {bg:T.ambLight,text:T.amb,border:"#D9770630"},
  DEVELOPING: {bg:"#F5F5F4",text:T.mut,border:"rgba(0,0,0,0.1)"},
  PASS:       {bg:T.redLight,text:T.red,border:"#C0392B30"},
}[l]||{bg:T.ambLight,text:T.amb,border:"#D9770630"});
const tierColor  = t => ({NANO:T.red,SMALL:T.amb,MID:T.acc,LARGE:T.grn,ETF:T.pur}[t]||T.mut);
const tierBg     = t => ({NANO:T.redLight,SMALL:T.ambLight,MID:T.accLight,LARGE:T.grnLight,ETF:T.purLight}[t]||T.bgEl);

// ─── MARKET HOURS UTILITY ─────────────────────────────────────────────────────
// Strategy B: detect off-hours so the UI can show staleness banner + manual refresh
const ET_OFFSET_MS = -5 * 60 * 60 * 1000; // ET is UTC-5 (approximation; DST ignored, safe for UX)
function getNowET() {
  const now = new Date();
  return new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + ET_OFFSET_MS);
}
function isMarketOpen() {
  const et = getNowET();
  const day = et.getDay(); // 0=Sun, 6=Sat
  const h = et.getHours(), m = et.getMinutes();
  const minuteOfDay = h * 60 + m;
  return day >= 1 && day <= 5 && minuteOfDay >= 570 && minuteOfDay < 960; // 9:30–16:00 ET Mon-Fri
}
function getNextMarketOpen() {
  const et = getNowET();
  const day = et.getDay();
  const h = et.getHours(), m = et.getMinutes();
  const minuteOfDay = h * 60 + m;
  // Calculate days until next Monday (or today if weekday before open)
  if (day === 0) return "Monday 9:30 AM ET";
  if (day === 6) return "Monday 9:30 AM ET";
  if (day >= 1 && day <= 5 && minuteOfDay < 570) return "Today 9:30 AM ET";
  if (day >= 1 && day <= 4 && minuteOfDay >= 960) return "Tomorrow 9:30 AM ET";
  if (day === 5 && minuteOfDay >= 960) return "Monday 9:30 AM ET";
  return "Next market day";
}
function fmtRelTime(isoStr) {
  if (!isoStr) return null;
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs/24)}d ago`;
}

// ─── STICKY SCREEN WRAPPER ────────────────────────────────────────────────────
// Shared layout: sticky header + scrollable content below.
// Used by ALL tab screens so behaviour is consistent across the app.
const StickyScreen = ({header, children})=>(
  <div style={{display:"flex",flexDirection:"column",height:"calc(100dvh - env(safe-area-inset-top,0px) - 58px)"}}>
    {/* Sticky header — never scrolls */}
    <div style={{flexShrink:0,position:"sticky",top:0,zIndex:90,
      background:T.bgCard,borderBottom:`1px solid ${T.bdr}`,boxShadow:T.shadow}}>
      {header}
    </div>
    {/* Scrollable body */}
    <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
      {children}
    </div>
  </div>
);

// ─── PRIMITIVES ───────────────────────────────────────────────────────────────
const Sparkline = ({data=[],color,h=36,w=80})=>{
  if(!data?.length) return null;
  const mn=Math.min(...data),mx=Math.max(...data),rng=mx-mn||1;
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
    {subtitle&&<div style={{fontSize:12,color:T.mut,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{subtitle}</div>}
  </div>
);

const ScoreBar = ({label,score,max,color})=>(
  <div style={{marginBottom:12}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
      <span style={{fontSize:12,color:T.mut}}>{label}</span>
      <span style={{fontSize:12,color,fontWeight:700}}>{score}/{max}</span>
    </div>
    <div style={{background:T.bgEl,borderRadius:4,height:4,overflow:"hidden"}}>
      <div style={{width:`${Math.max(0,Math.min(100,(score/max)*100))}%`,height:"100%",
        background:color,borderRadius:4,transition:"width 0.8s ease"}}/>
    </div>
  </div>
);

const TargetRow = ({label,price,pct,color})=>(
  <div style={{background:T.bgEl,borderRadius:10,padding:"12px 16px",marginBottom:8,
    display:"flex",alignItems:"center",justifyContent:"space-between",
    borderLeft:`3px solid ${color}`}}>
    <span style={{fontSize:13,fontWeight:700,color}}>{label}</span>
    <span style={{fontSize:16,fontWeight:800,color:T.txt}}>{fmt(price)}</span>
    <span style={{fontSize:12,fontWeight:700,color,background:`${color}15`,
      padding:"3px 10px",borderRadius:20}}>{fmtPct(pct)}</span>
  </div>
);

// ─── AI CHAT ─────────────────────────────────────────────────────────────────
const AIChatPanel = ({context,onClose,llmOk})=>{
  const [msgs,setMsgs]=useState([{role:"ai",text:llmOk===false
    ? "⚠️ Signal AI is not configured yet. Add OPENAI_API_KEY to your server .env file to enable chat."
    : "Ask me anything about this signal — entry timing, risk sizing, catalyst analysis, or what to watch for."}]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const bottomRef=useRef(null);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"})},[msgs]);
  const send=async()=>{
    if(!input.trim()||loading) return;
    if(llmOk===false){
      setMsgs(m=>[...m,{role:"user",text:input.trim()},{role:"ai",text:"⚠️ Signal AI requires OPENAI_API_KEY. Add it to your server .env file to enable this feature."}]);
      setInput(""); return;
    }
    const q=input.trim(); setInput(""); setMsgs(m=>[...m,{role:"user",text:q}]); setLoading(true);
    const res=await api.post("/api/chat",{message:q,context});
    setLoading(false);
    const reply = res?.response || "⚠️ Signal AI unavailable. Check OPENAI_API_KEY is set in your server .env file.";
    setMsgs(m=>[...m,{role:"ai",text:reply}]);
  };
  return (
    <div style={{position:"fixed",bottom:0,left:0,right:0,maxWidth:430,margin:"0 auto",zIndex:200,
      background:T.bgCard,borderTop:`1px solid ${T.bdr}`,borderRadius:"20px 20px 0 0",
      display:"flex",flexDirection:"column",height:"58vh",boxShadow:T.shadowMd}}>
      <div style={{padding:"14px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`1px solid ${T.bdr}`}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:28,height:28,borderRadius:"50%",background:T.gradA,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#fff",fontWeight:700}}>AI</div>
          <span style={{fontSize:14,fontWeight:700,color:T.txt}}>Signal AI</span>
          {context?.ticker&&<Tag text={context.ticker} color={T.acc}/>}
        </div>
        <button onClick={onClose} style={{background:"none",border:"none",color:T.mut,fontSize:20,cursor:"pointer",lineHeight:1}}>×</button>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"12px 16px",display:"flex",flexDirection:"column",gap:10}}>
        {msgs.map((m,i)=>(
          <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
            <div style={{maxWidth:"82%",background:m.role==="user"?T.gradA:T.bgEl,
              borderRadius:m.role==="user"?"18px 18px 4px 18px":"18px 18px 18px 4px",
              padding:"11px 15px",fontSize:13,color:m.role==="user"?T.bgCard:T.txt,lineHeight:1.5,
              boxShadow:T.shadow}}>{m.text}</div>
          </div>
        ))}
        {loading&&<div style={{display:"flex",gap:5,padding:"8px 0"}}>
          {[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:"50%",background:T.acc,opacity:0.6,animation:`pulse 1s ${i*0.2}s infinite`}}/>)}
        </div>}
        <div ref={bottomRef}/>
      </div>
      <div style={{padding:"10px 12px",borderTop:`1px solid ${T.bdr}`,display:"flex",gap:8}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()}
          placeholder="Ask about this signal..."
          style={{flex:1,background:T.bgIn,border:`1.5px solid ${T.bdr}`,borderRadius:24,padding:"11px 16px",
            color:T.txt,fontSize:13,outline:"none",fontFamily:"inherit"}}/>
        <button onClick={send} style={{background:T.gradA,border:"none",borderRadius:"50%",width:42,height:42,
          display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:18,color:T.bgCard,flexShrink:0}}>↑</button>
      </div>
    </div>
  );
};

// ─── SIGNAL DETAIL ────────────────────────────────────────────────────────────
const SignalDetail = ({signal,onClose,llmOk,llmError})=>{
  const [tab,setTab]=useState("overview");
  const [showChat,setShowChat]=useState(false);
  const [s,setS]=useState(signal);
  const badge=levelBadge(s.level);
  const pos=(s.change||0)>=0;
  const isEnriched = !!(s.catalyst_summary);
  // Live update when WebSocket pushes enrichment for this ticker
  useEffect(()=>{setS(signal);},[signal]);

  const Sec = ({icon,title,color,children})=>(
    <div style={{marginBottom:22}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
        <span style={{fontSize:14}}>{icon}</span>
        <span style={{fontSize:11,fontWeight:700,color:color||T.mut,textTransform:"uppercase",letterSpacing:"0.08em"}}>{title}</span>
      </div>
      {children}
    </div>
  );

  return (
    <div style={{position:"fixed",inset:0,background:T.bg,overflowY:showChat?"hidden":"auto",
      zIndex:100,maxWidth:430,margin:"0 auto"}}>

      {/* Header */}
      <div style={{background:T.bgCard,borderBottom:`1px solid ${T.bdr}`,padding:"16px 20px",
        position:"sticky",top:0,zIndex:10,display:"flex",alignItems:"center",gap:12,
        boxShadow:T.shadow}}>
        <button onClick={onClose} style={{background:T.bgEl,border:`1px solid ${T.bdr}`,borderRadius:"50%",
          width:38,height:38,display:"flex",alignItems:"center",justifyContent:"center",
          cursor:"pointer",color:T.txt,fontSize:18}}>←</button>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:22,fontWeight:800,color:T.txt}}>{s.ticker}</span>
            <span style={{fontSize:10,padding:"3px 9px",borderRadius:20,background:badge.bg,
              color:badge.text,border:`1px solid ${badge.border}`,fontWeight:700}}>{s.level}</span>
          </div>
          <div style={{fontSize:12,color:T.mut,marginTop:1}}>{s.name}</div>
        </div>
        {/* AI status pill — shows enrichment state, no manual trigger */}
        <div style={{
          background: isEnriched ? T.grnLight : llmOk===false ? T.redLight : T.ambLight,
          border:`1px solid ${isEnriched?T.grn:llmOk===false?T.red:T.amb}30`,
          borderRadius:20, padding:"5px 11px", fontSize:10, fontWeight:700,
          color: isEnriched ? T.grn : llmOk===false ? T.red : T.amb,
          whiteSpace:"nowrap"
        }}>
          {isEnriched ? "✓ AI Enriched" : llmOk===false ? "⚠ AI Offline" : "⏳ Enriching…"}
        </div>
        <ScoreRing score={s.score||0} size={54}/>
      </div>

      {/* Price strip */}
      <div style={{background:T.bgCard,padding:"14px 20px",display:"flex",alignItems:"center",gap:14,
        borderBottom:`1px solid ${T.bdr}`}}>
        <div>
          <span style={{fontSize:30,fontWeight:800,color:T.txt}}>
            {s.price?`$${Number(s.price).toFixed(2)}`:"—"}
          </span>
          <span style={{fontSize:13,color:pos?T.grn:T.red,fontWeight:700,
            background:pos?T.grnLight:T.redLight,padding:"3px 10px",borderRadius:20,marginLeft:10,
            border:`1px solid ${pos?T.grn:T.red}30`}}>
            {s.change!==undefined?`${pos?"+":""}${Number(s.change).toFixed(2)}%`:"—"}
          </span>
        </div>
        <div style={{marginLeft:"auto"}}>
          <Sparkline data={s.sparkline||[]} color={pos?T.grn:T.red} h={42} w={100}/>
        </div>
      </div>

      {/* Mode badge */}
      {(()=>{const m=SIGNAL_MODES.find(x=>x.id===(s.signal_mode||"SWING"))||SIGNAL_MODES[1]; return (
        <div style={{background:m.bg,padding:"8px 20px",display:"flex",alignItems:"center",gap:8,borderBottom:`1px solid ${T.bdr}`}}>
          <span style={{fontSize:13}}>{m.icon}</span>
          <span style={{fontSize:12,color:m.color,fontWeight:700}}>{m.label} Signal</span>
          <span style={{fontSize:11,color:T.mut}}>— {m.desc}</span>
        </div>
      );})()}

      {/* Tabs */}
      <div style={{display:"flex",background:T.bgCard,borderBottom:`1px solid ${T.bdr}`}}>
        {[["overview","Overview"],["trade","Trade"],["intel","Intel"],["scores","Scores"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{flex:1,padding:"13px 4px",fontSize:12,fontWeight:600,
            cursor:"pointer",background:"none",border:"none",
            borderBottom:tab===k?`2.5px solid ${T.acc}`:"2.5px solid transparent",
            color:tab===k?T.acc:T.mut,transition:"color 0.15s"}}>{l}</button>
        ))}
      </div>

      <div style={{padding:"20px",paddingBottom:100}}>

        {tab==="overview"&&(
          <>
            <Sec icon="⚡" title="Primary Catalyst" color={T.acc}>
              <div style={{background:T.accLight,border:`1px solid ${T.acc}30`,borderRadius:12,padding:16}}>
                {s.catalyst_summary
                  ? <div style={{fontSize:14,color:T.txt,lineHeight:1.6}}>{s.catalyst_summary}</div>
                  : llmOk===false
                    ? <div style={{fontSize:13,color:T.red,lineHeight:1.6}}>
                        <div style={{fontWeight:700,marginBottom:4}}>⚠️ AI Enrichment Offline</div>
                        <div style={{color:T.txtMed}}>{llmError||"Add OPENAI_API_KEY to your server .env file to enable AI enrichment."}</div>
                      </div>
                    : <div style={{display:"flex",alignItems:"center",gap:10,color:T.amb}}>
                        <div style={{width:14,height:14,borderRadius:"50%",background:T.amb,
                          animation:"pulse 1.2s infinite",flexShrink:0}}/>
                        <div>
                          <div style={{fontSize:13,fontWeight:700,marginBottom:2}}>AI Enrichment Queued</div>
                          <div style={{fontSize:12,color:T.mut}}>
                            {s.score>=70
                              ? "Analysis is running in the background — this card will update automatically."
                              : `Score ${s.score}/100 is below the enrichment threshold (70). Enrichment runs on high-conviction signals only.`}
                          </div>
                        </div>
                      </div>
                }
              </div>
            </Sec>
            <Sec icon="✅" title="Why This Conviction?" color={T.grn}>
              {(s.reasons||[]).length>0
                ?s.reasons.map((r,i)=>(
                  <div key={i} style={{display:"flex",gap:12,marginBottom:12}}>
                    <div style={{width:20,height:20,borderRadius:"50%",background:T.grnLight,
                      border:`1.5px solid ${T.grn}40`,display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:10,color:T.grn,flexShrink:0,marginTop:2,fontWeight:700}}>{i+1}</div>
                    <span style={{fontSize:13,color:T.txt,lineHeight:1.6}}>{r}</span>
                  </div>
                ))
                :<div style={{fontSize:13,color:T.dim,fontStyle:"italic"}}>
                    {llmOk===false ? "⚠ AI offline — add OPENAI_API_KEY to enable" : s.score>=44 ? "Running in background…" : `Score ${s.score}/100 below enrichment threshold`}
                  </div>
              }
            </Sec>
            <Sec icon="⚠️" title="Risks" color={T.amb}>
              {(s.risks||[]).length>0
                ?s.risks.map((r,i)=>(
                  <div key={i} style={{display:"flex",gap:10,marginBottom:10}}>
                    <span style={{color:T.amb,flexShrink:0,marginTop:2}}>▲</span>
                    <span style={{fontSize:13,color:T.txtMed,lineHeight:1.6}}>{r}</span>
                  </div>
                ))
                :<div style={{fontSize:13,color:T.dim,fontStyle:"italic"}}>
                    {llmOk===false ? "⚠ AI offline" : s.score>=44 ? "Running in background…" : "Below enrichment threshold"}
                  </div>
              }
            </Sec>
            {s.upside&&(
              <Sec icon="💰" title="Upside Scenario" color={T.grn}>
                <div style={{background:T.grnLight,borderLeft:`3px solid ${T.grn}`,
                  padding:"13px 16px",borderRadius:"0 10px 10px 0"}}>
                  <span style={{fontSize:13,color:T.txt,lineHeight:1.6}}>{s.upside}</span>
                </div>
              </Sec>
            )}
            {(s.monitor||[]).length>0&&(
              <Sec icon="👁" title="Monitor" color={T.pur}>
                {s.monitor.map((m,i)=>(
                  <div key={i} style={{display:"flex",gap:10,marginBottom:9}}>
                    <span style={{color:T.pur,fontWeight:700}}>•</span>
                    <span style={{fontSize:13,color:T.txt,lineHeight:1.5}}>{m}</span>
                  </div>
                ))}
              </Sec>
            )}
          </>
        )}

        {tab==="trade"&&(
          <>
            <Sec icon="🎯" title="Entry Zone" color={T.acc}>
              <div style={{background:T.bgEl,borderRadius:14,padding:18,
                display:"flex",justifyContent:"space-between",alignItems:"center",
                border:`1px solid ${T.bdr}`}}>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:11,color:T.mut,fontWeight:500,marginBottom:4}}>Low</div>
                  <div style={{fontSize:24,fontWeight:800,color:T.txt}}>{fmt(s.entry?.low)}</div>
                </div>
                <div style={{background:T.accLight,borderRadius:"50%",width:32,height:32,
                  display:"flex",alignItems:"center",justifyContent:"center",color:T.acc,fontSize:14}}>→</div>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:11,color:T.mut,fontWeight:500,marginBottom:4}}>High</div>
                  <div style={{fontSize:24,fontWeight:800,color:T.txt}}>{fmt(s.entry?.high)}</div>
                </div>
              </div>
              {!s.entry?.low&&<div style={{fontSize:11,color:T.dim,textAlign:"center",marginTop:8,fontStyle:"italic"}}>
                {llmOk===false?"⚠ AI offline — entry zones unavailable":s.score>=44?"Entry zones generating in background…":"Below enrichment threshold (score 70+)"}
              </div>}
            </Sec>
            <Sec icon="📈" title="Targets" color={T.grn}>
              <TargetRow label="TP1" price={s.targets?.tp1} pct={s.targets?.tp1pct} color={T.grn}/>
              <TargetRow label="TP2" price={s.targets?.tp2} pct={s.targets?.tp2pct} color={T.acc}/>
              <TargetRow label="Stop Loss" price={s.targets?.stop} pct={s.targets?.stopPct?-Number(s.targets.stopPct):undefined} color={T.red}/>
              {!s.targets?.tp1&&<div style={{fontSize:11,color:T.dim,textAlign:"center",fontStyle:"italic"}}>
                {llmOk===false?"⚠ AI offline — targets unavailable":s.score>=44?"Price targets generating in background…":"Below enrichment threshold (score 70+)"}
              </div>}
            </Sec>
            <Sec icon="⚖️" title="Risk / Reward" color={T.amb}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {[
                  ["R:R Ratio",fmtRR(s.targets?.rr),s.targets?.rr>=2?T.grn:T.red,s.targets?.rr>=2?T.grnLight:T.redLight],
                  ["Stop %",s.targets?.stopPct?`-${Number(s.targets.stopPct).toFixed(1)}%`:"—",T.red,T.redLight],
                  ["Tier",s.tier||"—",tierColor(s.tier),tierBg(s.tier)],
                  ["Score",`${s.score||0}/100`,scoreColor(s.score||0),scoreBg(s.score||0)],
                ].map(([l,v,c,bg])=>(
                  <div key={l} style={{background:bg||T.bgEl,borderRadius:12,padding:"12px 14px",
                    border:`1px solid ${c}20`}}>
                    <div style={{fontSize:10,color:T.mut,marginBottom:5,fontWeight:500}}>{l}</div>
                    <div style={{fontSize:16,fontWeight:800,color:c||T.txt}}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{marginTop:14,padding:13,background:T.ambLight,border:`1px solid ${T.amb}30`,
                borderRadius:12,fontSize:12,color:T.txtMed,lineHeight:1.7}}>
                <strong style={{color:T.amb}}>Position sizing:</strong>{" "}
                {s.score>=85?"High conviction: up to 5% of portfolio":"Standard: 2–3% of portfolio"}.
                Sell 50% at TP1, raise stop to breakeven on remainder.
              </div>
            </Sec>
          </>
        )}

        {tab==="intel"&&(
          <>
            <Sec icon="🏢" title="Corporate Insider Activity" color={T.acc}>
              <div style={{background:T.bgEl,borderRadius:12,padding:14,borderLeft:`3px solid ${T.grn}`}}>
                <div style={{fontSize:13,color:T.txt,lineHeight:1.5,marginBottom:8}}>
                  {s.insider_summary||"No recent Form 4 insider activity found"}
                </div>
                {(s.insider_trades||[]).slice(0,3).map((t,i)=>(
                  <div key={i} style={{fontSize:11,color:T.mut,marginTop:4}}>
                    • {t.entity||t.name||"Unknown"} — {t.file_date||t.date||""}
                  </div>
                ))}
              </div>
            </Sec>
            <Sec icon="🏛" title="Congressional Activity" color={T.pur}>
              {(s.congress_trades||[]).length>0
                ?s.congress_trades.slice(0,5).map((t,i)=>(
                  <div key={i} style={{background:T.bgEl,borderRadius:12,padding:13,
                    marginBottom:8,borderLeft:`3px solid ${T.pur}`,border:`1px solid ${T.bdr}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div style={{fontSize:13,fontWeight:700,color:T.txt}}>{t.Representative||t.member||"Unknown"}</div>
                      <Tag text={t.source||"STOCK Act"} color={T.pur} bg={T.purLight}/>
                    </div>
                    <div style={{fontSize:12,color:T.mut,marginTop:4}}>
                      {t.Transaction||t.action||""}
                      {(t.Range||t.amount)?` · ${t.Range||t.amount}`:""}
                      {(t.Date||t.date)?` · ${t.Date||t.date}`:""}
                    </div>
                    {(t.committee||t.Committee)&&(
                      <div style={{fontSize:11,color:T.pur,marginTop:4,fontWeight:500}}>
                        📋 {t.committee||t.Committee}
                      </div>
                    )}
                  </div>
                ))
                :<EmptyState icon="🏛" title="No congressional trades found"
                    subtitle={`Requires FINNHUB_API_KEY in your server environment.\n\nTest: ${API_BASE}/api/congress?ticker=${s.ticker}`}/>
              }
            </Sec>
          </>
        )}

        {tab==="scores"&&(
          <>
            <div style={{background:T.bgCard,borderRadius:16,padding:20,marginBottom:16,
              display:"flex",alignItems:"center",gap:16,boxShadow:T.shadow,border:`1px solid ${T.bdr}`}}>
              <ScoreRing score={s.score||0} size={72}/>
              <div>
                <div style={{fontSize:12,color:T.mut,fontWeight:500}}>Conviction Score</div>
                <div style={{fontSize:32,fontWeight:800,color:scoreColor(s.score||0)}}>{s.score||0}/100</div>
                <div style={{fontSize:12,color:T.mut}}>{s.level}</div>
              </div>
            </div>
            <div style={{background:T.bgCard,borderRadius:16,padding:20,
              boxShadow:T.shadow,border:`1px solid ${T.bdr}`}}>
              {Object.entries(s.breakdown||{}).map(([k,v])=>{
                const maxes={catalyst:25,insider:20,technical:20,macro:15,news:10,liquidity:10};
                const colors={catalyst:T.acc,insider:T.pur,technical:T.grn,macro:T.amb,news:T.mut,liquidity:T.acc};
                const labels={catalyst:"Catalyst Strength",insider:"Insider + Congress",technical:"Technical Setup",
                  macro:"Macro Alignment",news:"News Momentum",liquidity:"Liquidity"};
                return <ScoreBar key={k} label={labels[k]||k} score={v||0} max={maxes[k]||10} color={colors[k]||T.acc}/>;
              })}
            </div>
          </>
        )}
      </div>

      {/* AI Chat button */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,maxWidth:430,margin:"0 auto",
        padding:"12px 20px",background:T.bgCard,borderTop:`1px solid ${T.bdr}`,zIndex:50}}>
        <button onClick={()=>setShowChat(true)} style={{width:"100%",background:T.gradA,border:"none",
          borderRadius:16,padding:15,fontSize:14,fontWeight:800,color:T.bgCard,cursor:"pointer",
          display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:`0 4px 12px ${T.acc}40`}}>
          <span>✦</span> Ask Signal AI
        </button>
      </div>
      {showChat&&<AIChatPanel context={s} onClose={()=>setShowChat(false)} llmOk={llmOk}/>}
    </div>
  );
};

// ─── SIGNAL CARD (list) ───────────────────────────────────────────────────────
const SignalCard = ({signal:s,onClick})=>{
  const badge=levelBadge(s.level);
  const pos=(s.change||0)>=0;
  const entryStr=(s.entry?.low&&s.entry?.high)?`${fmt(s.entry.low)}–${fmt(s.entry.high)}`:"—";
  const tp1Str=s.targets?.tp1?`${fmt(s.targets.tp1)} (${fmtPct(s.targets.tp1pct)})`:"—";
  const stopStr=s.targets?.stop?`${fmt(s.targets.stop)} (${s.targets.stopPct?fmtPct(-s.targets.stopPct):"—"})`:"—";
  return (
    <div onClick={onClick} style={{background:T.bgCard,border:`1px solid ${T.bdrCard}`,borderRadius:16,
      padding:16,marginBottom:12,cursor:"pointer",transition:"all 0.15s",boxShadow:T.shadow}}
      onMouseEnter={e=>{e.currentTarget.style.borderColor=T.acc;e.currentTarget.style.boxShadow=`0 4px 16px ${T.acc}20`;}}
      onMouseLeave={e=>{e.currentTarget.style.borderColor=T.bdrCard;e.currentTarget.style.boxShadow=T.shadow;}}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}}>
            <span style={{fontSize:19,fontWeight:800,color:T.txt}}>{s.ticker}</span>
            <span style={{fontSize:10,padding:"3px 9px",borderRadius:20,background:badge.bg,
              color:badge.text,border:`1px solid ${badge.border}`,fontWeight:700}}>{s.level}</span>
            <span style={{fontSize:10,color:tierColor(s.tier),background:tierBg(s.tier),
              padding:"3px 8px",borderRadius:20,fontWeight:600}}>{s.tier}</span>
            {s.signal_mode&&s.signal_mode!=="SWING"&&(
              <span style={{fontSize:9,color:(SIGNAL_MODES.find(m=>m.id===s.signal_mode)||{color:T.acc}).color,
                background:(SIGNAL_MODES.find(m=>m.id===s.signal_mode)||{bg:T.accLight}).bg,
                padding:"2px 6px",borderRadius:20,fontWeight:600}}>
                {(SIGNAL_MODES.find(m=>m.id===s.signal_mode)||{icon:"",label:s.signal_mode}).icon}{" "}
                {(SIGNAL_MODES.find(m=>m.id===s.signal_mode)||{label:s.signal_mode}).label}
              </span>
            )}
          </div>
          <div style={{fontSize:12,color:T.mut,marginBottom:6,fontWeight:500}}>{s.name}</div>
          <div style={{fontSize:11,color:T.mut,lineHeight:1.5,overflow:"hidden",
            display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>
            {s.catalyst_summary||s.catalyst?.text||""}
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,flexShrink:0}}>
          <ScoreRing score={s.score||0} size={50}/>
          <Sparkline data={s.sparkline||[]} color={pos?T.grn:T.red} h={28} w={64}/>
          <span style={{fontSize:12,color:pos?T.grn:T.red,fontWeight:700,
            background:pos?T.grnLight:T.redLight,padding:"2px 8px",borderRadius:20}}>
            {s.change!==undefined?`${pos?"+":""}${Number(s.change).toFixed(2)}%`:"—"}
          </span>
        </div>
      </div>
      <Divider/>
      <div style={{display:"flex"}}>
        {[["Entry",entryStr,T.txt],["TP1",tp1Str,T.grn],["Stop",stopStr,T.red]].map(([l,v,c],i)=>(
          <div key={l} style={{flex:1,textAlign:"center",borderLeft:i>0?`1px solid ${T.bdr}`:"none",padding:"0 4px"}}>
            <div style={{fontSize:9,color:T.dim,fontWeight:500,marginBottom:2}}>{l}</div>
            <div style={{fontSize:10,color:c,fontWeight:700}}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── HOME SCREEN ─────────────────────────────────────────────────────────────
const HomeScreen = ({signals,loading,connected,onSelect,market,horizon,setHorizon,onManualRefresh,refreshing})=>{
  const [filter,setFilter]=useState("ALL");
  const [search,setSearch]=useState("");
  const [showFeatures,setShowFeatures]=useState(false);
  const [showModeInfo,setShowModeInfo]=useState(false); // A2: hidden by default, toggled by ℹ️
  const tiers=["ALL","SMALL","MID","LARGE","ETF","NANO"];

  const marketOpen = isMarketOpen();
  // Find the most recent updated_at across all signals for staleness display
  const lastUpdated = useMemo(()=>{
    const ts = signals.map(s=>s.updated_at).filter(Boolean).sort().at(-1);
    return ts ? fmtRelTime(ts) : null;
  },[signals]);

  const filtered=useMemo(()=>signals
    .filter(s=>filter==="ALL"||s.tier===filter)
    .filter(s=>!search||s.ticker?.includes(search.toUpperCase())||s.name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b)=>(b.score||0)-(a.score||0)),[signals,filter,search]);

  const top4=useMemo(()=>[...signals].sort((a,b)=>(b.score||0)-(a.score||0)).slice(0,4),[signals]);

  const activeMode = SIGNAL_MODES.find(x=>x.id===horizon)||SIGNAL_MODES[1];

  // Header rendered separately so StickyScreen can pin it
  const header = (
    <>
      {/* Identity row */}
      <div style={{padding:"16px 20px 12px",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={{fontSize:11,color:T.acc,letterSpacing:"0.12em",textTransform:"uppercase",fontWeight:700}}>BigTrades</div>
          <div style={{fontSize:24,fontWeight:800,color:T.txt,lineHeight:1.1}}>Market Intel</div>
          <div style={{fontSize:12,color:T.mut,marginTop:2}}>{new Date().toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
          <StatusDot connected={connected}/>
          <button onClick={()=>setShowFeatures(!showFeatures)}
            style={{background:T.accLight,border:`1px solid ${T.acc}30`,borderRadius:8,
              padding:"4px 10px",fontSize:11,color:T.acc,cursor:"pointer",fontWeight:600}}>
            {showFeatures?"Hide":"What is this?"}
          </button>
        </div>
      </div>

      {/* Features explainer */}
      {showFeatures&&(
        <div style={{margin:"0 20px 10px",background:T.accLight,borderRadius:12,padding:14,border:`1px solid ${T.acc}30`}}>
          <div style={{fontSize:13,fontWeight:700,color:T.acc,marginBottom:8}}>BigTrades — What This App Does</div>
          <div style={{fontSize:12,color:T.txtMed,lineHeight:1.8}}>
            🔍 <strong>Signal Scanning</strong> — Scans 30+ stocks using yfinance. Scores on catalyst, insiders, congress, technicals, macro, liquidity.<br/>
            🏛 <strong>Congressional Intel</strong> — STOCK Act disclosures from Capitol Trades + Finnhub. Politicians buying before legislation = alpha.<br/>
            🤖 <strong>AI Enrichment</strong> — Claude AI writes buy reasons, risks, entry/TP/stop targets for each signal.<br/>
            📡 <strong>Telegram Alerts</strong> — Signals ≥ {80} fire to your Telegram automatically.<br/>
            📄 <strong>Paper Trading</strong> — Autonomous virtual portfolio tracks each mode's performance.
          </div>
        </div>
      )}

      {/* Market strip */}
      <div style={{display:"flex",gap:8,overflowX:"auto",padding:"0 20px 12px",WebkitOverflowScrolling:"touch"}}>
        {[
          ["VIX",market?.vix?.toFixed?.(1)||"—",market?.sentiment==="RISK-ON"?T.grn:market?.sentiment==="RISK-OFF"?T.red:T.amb],
          ["Sentiment",market?.sentiment||"—",market?.sentiment==="RISK-ON"?T.grn:T.amb],
        ].map(([l,v,c])=>(
          <div key={l} style={{background:T.bgEl,border:`1px solid ${T.bdr}`,borderRadius:10,padding:"8px 14px",flexShrink:0}}>
            <div style={{fontSize:10,color:T.mut,fontWeight:500}}>{l}</div>
            <div style={{fontSize:14,fontWeight:700,color:c||T.txt}}>{v}</div>
          </div>
        ))}
      </div>

      {/* Signal Mode selector */}
      <div style={{padding:"0 20px 14px",borderTop:`1px solid ${T.bdr}`}}>
        {/* Label row with ℹ️ toggle on the right — A2 */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",margin:"12px 0 10px"}}>
          <div style={{fontSize:11,fontWeight:700,color:T.mut,textTransform:"uppercase",letterSpacing:"0.08em"}}>
            Signal Mode
          </div>
          <button onClick={()=>setShowModeInfo(v=>!v)}
            title="About signal modes"
            style={{background:showModeInfo?T.acc:T.bgEl,border:`1px solid ${showModeInfo?T.acc:T.bdr}`,
              borderRadius:"50%",width:24,height:24,display:"flex",alignItems:"center",
              justifyContent:"center",cursor:"pointer",color:showModeInfo?T.bgCard:T.mut,
              fontSize:13,fontWeight:700,lineHeight:1,flexShrink:0,transition:"all 0.15s"}}>
            ⓘ
          </button>
        </div>

        {/* Mode info panel — only visible when ℹ️ toggled on — A2 */}
        {showModeInfo&&(
          <div style={{marginBottom:10,background:activeMode.bg,border:`1px solid ${activeMode.color}25`,
            borderRadius:10,padding:"10px 12px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <span style={{fontSize:12,color:activeMode.color,fontWeight:700}}>{activeMode.icon} {activeMode.label}</span>
              <span style={{fontSize:10,color:activeMode.color,background:`${activeMode.color}20`,
                padding:"2px 8px",borderRadius:20,fontWeight:600}}>Hold: {activeMode.holdDesc}</span>
            </div>
            <div style={{fontSize:11,color:T.txtMed,lineHeight:1.5,marginBottom:4}}>{activeMode.desc}</div>
            <div style={{fontSize:10,color:T.mut}}>e.g. {activeMode.examples}</div>
          </div>
        )}

        {/* Row 1: SURGE + SWING + POSITION */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
          {SIGNAL_MODES.slice(0,3).map(m=>(
            <button key={m.id} onClick={()=>setHorizon(m.id)} style={{
              background:horizon===m.id?m.color:T.bgEl,
              border:`1.5px solid ${horizon===m.id?m.color:T.bdr}`,
              color:horizon===m.id?T.bgCard:T.mut,
              borderRadius:12,padding:"9px 4px",cursor:"pointer",transition:"all 0.15s",
              boxShadow:horizon===m.id?`0 3px 10px ${m.color}40`:"none"}}>
              <div style={{fontSize:18,marginBottom:2}}>{m.icon}</div>
              <div style={{fontSize:10,fontWeight:700}}>{m.label}</div>
            </button>
          ))}
        </div>
        {/* Row 2: HOLD + RADAR */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {SIGNAL_MODES.slice(3).map(m=>(
            <button key={m.id} onClick={()=>setHorizon(m.id)} style={{
              background:horizon===m.id?m.color:T.bgEl,
              border:`1.5px solid ${horizon===m.id?m.color:T.bdr}`,
              color:horizon===m.id?T.bgCard:T.mut,
              borderRadius:12,padding:"9px 4px",cursor:"pointer",transition:"all 0.15s",
              boxShadow:horizon===m.id?`0 3px 10px ${m.color}40`:"none"}}>
              <div style={{fontSize:18,marginBottom:2}}>{m.icon}</div>
              <div style={{fontSize:10,fontWeight:700}}>{m.label}</div>
            </button>
          ))}
        </div>
      </div>
    </>
  );

  return (
    <StickyScreen header={header}>

      {/* ── B: Off-hours banner ──────────────────────────────────────────────
          Always shown when market is closed. Signals from the last scan remain
          visible. User can manually trigger a lightweight refresh (yfinance
          30d cached data, no extra API cost) to prep for next market open.     */}
      {!marketOpen&&(
        <div style={{margin:"14px 14px 0",background:T.ambLight,border:`1px solid ${T.amb}40`,
          borderRadius:14,padding:"12px 14px",display:"flex",alignItems:"center",gap:10}}>
          <div style={{flex:1}}>
            <div style={{fontSize:12,fontWeight:700,color:T.amb,marginBottom:2}}>
              🌙 Market Closed · Opens {getNextMarketOpen()}
            </div>
            <div style={{fontSize:11,color:T.mut}}>
              {lastUpdated?`Signals last updated ${lastUpdated} · `:""}
              Showing last known data
            </div>
          </div>
          <button onClick={onManualRefresh} disabled={refreshing}
            style={{background:refreshing?T.bgEl:T.amb,border:"none",borderRadius:10,
              padding:"8px 12px",fontSize:11,fontWeight:700,color:refreshing?T.mut:T.bgCard,
              cursor:refreshing?"default":"pointer",flexShrink:0,whiteSpace:"nowrap",
              transition:"all 0.2s"}}>
            {refreshing?"↻ Refreshing…":"↻ Refresh"}
          </button>
        </div>
      )}

      {/* Top conviction carousel */}
      {top4.length>0&&(
        <div style={{padding:"14px 20px 0"}}>
          <div style={{fontSize:11,fontWeight:700,color:T.mut,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:10}}>
            🔥 Top Conviction
          </div>
          <div style={{display:"flex",gap:10,overflowX:"auto",paddingBottom:4,WebkitOverflowScrolling:"touch"}}>
            {top4.map(s=>(
              <div key={s.ticker} onClick={()=>onSelect(s)} style={{background:T.bgCard,
                border:`1px solid ${T.bdrCard}`,borderRadius:14,padding:14,minWidth:148,
                cursor:"pointer",flexShrink:0,boxShadow:T.shadow,transition:"all 0.15s"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=T.acc;e.currentTarget.style.transform="translateY(-2px)";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=T.bdrCard;e.currentTarget.style.transform="none";}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                  <span style={{fontSize:16,fontWeight:800,color:T.txt}}>{s.ticker}</span>
                  <ScoreRing score={s.score||0} size={36}/>
                </div>
                <div style={{fontSize:10,color:T.mut,marginBottom:6,fontWeight:500}}>{s.sector||s.tier}</div>
                <Sparkline data={s.sparkline||[]} color={(s.change||0)>=0?T.grn:T.red} h={28} w={118}/>
                <div style={{fontSize:12,color:(s.change||0)>=0?T.grn:T.red,fontWeight:700,marginTop:5,
                  background:(s.change||0)>=0?T.grnLight:T.redLight,padding:"2px 8px",borderRadius:20,display:"inline-block"}}>
                  {s.change!==undefined?`${(s.change||0)>=0?"+":""}${Number(s.change).toFixed(2)}%`:"—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search + tier filter */}
      <div style={{padding:"14px 20px 0"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search ticker or company..."
          style={{width:"100%",background:T.bgCard,border:`1.5px solid ${T.bdr}`,borderRadius:12,
            padding:"11px 16px",color:T.txt,fontSize:13,boxSizing:"border-box",outline:"none",
            fontFamily:"inherit",boxShadow:T.shadow,marginBottom:10}}
          onFocus={e=>e.target.style.borderColor=T.acc}
          onBlur={e=>e.target.style.borderColor=T.bdr}/>
        <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:6,WebkitOverflowScrolling:"touch"}}>
          {tiers.map(t=><Chip key={t} label={t} active={filter===t} onClick={()=>setFilter(t)}
            color={t!=="ALL"?tierColor(t):T.acc}/>)}
        </div>
      </div>

      {/* Signal list */}
      <div style={{padding:"12px 20px 80px"}}>
        {loading&&signals.length===0
          ?<><LoadingPulse/><LoadingPulse/><LoadingPulse/></>
          :filtered.length===0
          ?<EmptyState icon="📡" title="No signals match filter"
              subtitle="Try ALL tier or clear search. Scan runs every 10 min during market hours."/>
          :filtered.map(s=><SignalCard key={s.ticker||s.id} signal={s} onClick={()=>onSelect(s)}/>)}
      </div>

    </StickyScreen>
  );
};

// ─── CONGRESS SCREEN ─────────────────────────────────────────────────────────
const CongressScreen = ({data,loading})=>{
  const hasData=data&&data.length>0;
  const header=(
    <div style={{padding:"20px 20px 14px"}}>
      <div style={{fontSize:11,color:T.acc,letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:700}}>Intelligence</div>
      <div style={{fontSize:24,fontWeight:800,color:T.txt}}>Congressional Trades</div>
      <div style={{fontSize:12,color:T.mut,marginTop:2}}>
        {hasData?`${data.length} trades · Capitol Trades + Finnhub`:"STOCK Act disclosures · Live feed"}
      </div>
    </div>
  );
  return (
    <StickyScreen header={header}>
      <div style={{padding:"0 20px 80px"}}>
        <div style={{background:T.ambLight,border:`1px solid ${T.amb}30`,borderRadius:12,
          padding:"11px 14px",marginBottom:16,display:"flex",gap:10,alignItems:"center",marginTop:14}}>
          <span>🏛</span>
          <span style={{fontSize:12,color:T.amb,lineHeight:1.5,fontWeight:500}}>
            Members disclose within 45 days. Committee-relevant buys have historically preceded major price moves.
          </span>
        </div>
        {loading?<><LoadingPulse/><LoadingPulse/></>
        :!hasData?<EmptyState icon="🏛" title="No congressional trades loaded"
            subtitle={`Requires FINNHUB_API_KEY in server environment.\n\nDebug: ${API_BASE}/api/telegram/debug\nTest congress: ${API_BASE}/api/congress`}/>
        :data.map((t,i)=>(
          <div key={i} style={{background:T.bgCard,border:`1px solid ${T.bdrCard}`,borderRadius:16,
            padding:16,marginBottom:10,boxShadow:T.shadow}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:T.txt}}>{t.member||t.Representative||"Unknown"}</div>
                <div style={{fontSize:11,color:T.mut,marginTop:2}}>
                  {t.party==="D"?"🔵":t.party==="R"?"🔴":"⚪"} {t.state||t.chamber||""} · {t.date||t.Date||""}
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:20,fontWeight:800,
                  color:(t.action||t.Transaction||"").toLowerCase().includes("buy")||(t.action||"").toLowerCase().includes("purchase")?T.grn:T.red}}>
                  {t.ticker||t.Ticker||""}
                </div>
                <div style={{fontSize:11,fontWeight:600,
                  color:(t.action||t.Transaction||"").toLowerCase().includes("buy")||(t.action||"").toLowerCase().includes("purchase")?T.grn:T.red,
                  background:(t.action||t.Transaction||"").toLowerCase().includes("buy")?T.grnLight:T.redLight,
                  padding:"2px 8px",borderRadius:20,display:"inline-block",marginTop:2}}>
                  {t.action||t.Transaction||""}
                </div>
              </div>
            </div>
            <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
              {(t.amount||t.Range)&&<Tag text={t.amount||t.Range} color={T.acc} bg={T.accLight}/>}
              {(t.committee||t.Committee)&&<Tag text={`${t.committee||t.Committee}`} color={T.pur} bg={T.purLight}/>}
              {t.relevance&&<Tag text={t.relevance} color={t.relevance==="Direct"?T.grn:T.amb}/>}
              <Tag text={t.source||t.verified_source||"STOCK Act"} color={T.mut} bg={T.bgEl}/>
            </div>
          </div>
        ))}
      </div>
    </StickyScreen>
  );
};

// ─── NEWS SCREEN ─────────────────────────────────────────────────────────────
const NewsScreen = ({data,loading})=>{
  const hasData=data&&data.length>0;
  const header=(
    <div style={{padding:"20px 20px 14px"}}>
      <div style={{fontSize:11,color:T.acc,letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:700}}>Catalyst Feed</div>
      <div style={{fontSize:24,fontWeight:800,color:T.txt}}>Market News</div>
      <div style={{fontSize:12,color:T.mut,marginTop:2}}>{hasData?`${data.length} articles · Finnhub`:"Live company news"}</div>
    </div>
  );
  return (
    <StickyScreen header={header}>
      <div style={{padding:"14px 20px 80px"}}>
        {loading?<><LoadingPulse lines={4}/></>
        :!hasData?<EmptyState icon="📰" title="No live news loaded"
            subtitle={`Requires FINNHUB_API_KEY in server environment.\n\nThe backend fetches Finnhub company news for all watchlist tickers every 5 minutes.\n\nTest: ${API_BASE}/api/news`}/>
        :data.map((n,i)=>(
          <div key={i} style={{background:T.bgCard,border:`1px solid ${T.bdrCard}`,borderRadius:14,
            padding:16,marginBottom:10,boxShadow:T.shadow,
            borderLeft:`3px solid ${n.sentiment==="bull"?T.grn:n.sentiment==="bear"?T.red:T.dim}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{display:"flex",gap:7,alignItems:"center"}}>
                <span style={{fontSize:14,fontWeight:800,
                  color:n.sentiment==="bull"?T.grn:n.sentiment==="bear"?T.red:T.mut}}>
                  {n.ticker||n.keyword||""}
                </span>
                <span style={{fontSize:9,padding:"2px 7px",borderRadius:20,fontWeight:700,
                  background:n.sentiment==="bull"?T.grnLight:n.sentiment==="bear"?T.redLight:T.bgEl,
                  color:n.sentiment==="bull"?T.grn:n.sentiment==="bear"?T.red:T.mut,
                  border:`1px solid ${n.sentiment==="bull"?T.grn:n.sentiment==="bear"?T.red:T.dim}30`}}>
                  {(n.sentiment||"neutral").toUpperCase()}
                </span>
              </div>
              <span style={{fontSize:10,color:T.dim}}>{n.time||n.published?.slice(0,10)||""}</span>
            </div>
            <div style={{fontSize:13,color:T.txt,lineHeight:1.5,marginBottom:5}}>{n.headline||n.title||""}</div>
            <div style={{fontSize:11,color:T.dim}}>{n.source||""}</div>
          </div>
        ))}
      </div>
    </StickyScreen>
  );
};

// ─── SETTINGS SCREEN ──────────────────────────────────────────────────────────
const SettingsScreen = ({connected,onSettingsSaved})=>{
  const [unlocked,setUnlocked]=useState(false);
  const [pin,setPin]=useState("");
  const PIN="1234"; // Change before deploying

  const [tgToken,setTgToken]=useState("");
  const [tgChat,setTgChat]=useState("");
  const [threshold,setThreshold]=useState();
  const [llm,setLlm]=useState("anthropic");
  const [saved,setSaved]=useState(false);
  const [testing,setTesting]=useState(false);
  const [testResult,setTestResult]=useState(null);
  const [health,setHealth]=useState(null);
  const [debugData,setDebugData]=useState(null);
  const [loadingDebug,setLoadingDebug]=useState(false);

  useEffect(()=>{api.get("/api/health").then(h=>h&&setHealth(h));},[]);

  const save=async()=>{
    const payload={alert_threshold:threshold,llm_backend:llm};
    if(tgToken) payload.telegram_token=tgToken;
    if(tgChat)  payload.telegram_chat_id=tgChat;
    await api.post("/api/settings",payload);
    setSaved(true); onSettingsSaved?.(); setTimeout(()=>setSaved(false),2500);
  };

  const testTelegram=async()=>{
    if(!tgToken||!tgChat){setTestResult("error");return;}
    setTesting(true);
    try {
      const r=await fetch(`${API_BASE}/api/telegram/test?token=${encodeURIComponent(tgToken)}&chat_id=${encodeURIComponent(tgChat)}`,{method:"POST"});
      const d=await r.json();
      setTestResult(d.success?"ok":"error");
    } catch { setTestResult("error"); }
    setTesting(false); setTimeout(()=>setTestResult(null),4000);
  };

  const runDebug=async()=>{
    setLoadingDebug(true);
    const d=await api.get("/api/telegram/debug");
    setDebugData(d); setLoadingDebug(false);
  };

  const Inp=({label,value,onChange,placeholder})=>(
    <div style={{marginBottom:12}}>
      <div style={{fontSize:11,color:T.mut,marginBottom:5,fontWeight:500}}>{label}</div>
      <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{width:"100%",background:T.bgIn,border:`1.5px solid ${T.bdr}`,borderRadius:10,
          padding:"11px 12px",color:T.txt,fontSize:12,boxSizing:"border-box",
          fontFamily:"monospace",outline:"none"}}
        onFocus={e=>e.target.style.borderColor=T.acc}
        onBlur={e=>e.target.style.borderColor=T.bdr}/>
    </div>
  );

  const GrpCard=({title,children})=>(
    <div style={{marginBottom:20}}>
      <div style={{fontSize:11,fontWeight:700,color:T.mut,letterSpacing:"0.07em",textTransform:"uppercase",marginBottom:10}}>{title}</div>
      <div style={{background:T.bgCard,border:`1px solid ${T.bdrCard}`,borderRadius:14,padding:16,boxShadow:T.shadow}}>{children}</div>
    </div>
  );

  if(!unlocked) return (
    <div style={{padding:"60px 24px",display:"flex",flexDirection:"column",alignItems:"center",gap:20}}>
      <div style={{fontSize:44}}>🔒</div>
      <div style={{fontSize:20,fontWeight:800,color:T.txt}}>Settings</div>
      <div style={{fontSize:13,color:T.mut,textAlign:"center"}}>Enter your PIN to access settings</div>
      <input type="password" value={pin} onChange={e=>setPin(e.target.value)}
        onKeyDown={e=>e.key==="Enter"&&(pin===PIN?setUnlocked(true):(alert("Wrong PIN"),setPin("")))}
        placeholder="Enter PIN" maxLength={8}
        style={{width:"100%",maxWidth:200,background:T.bgIn,border:`1.5px solid ${T.bdr}`,
          borderRadius:14,padding:"16px",color:T.txt,fontSize:24,textAlign:"center",
          outline:"none",letterSpacing:6,fontFamily:"monospace"}}/>
      <button onClick={()=>pin===PIN?setUnlocked(true):(alert("Wrong PIN"),setPin(""))}
        style={{width:"100%",maxWidth:200,background:T.gradA,border:"none",borderRadius:14,
          padding:15,fontSize:15,fontWeight:700,color:T.bgCard,cursor:"pointer"}}>
        Unlock Settings
      </button>
      <div style={{fontSize:11,color:T.dim,textAlign:"center"}}>Default PIN: 1234 — change in App.jsx</div>
    </div>
  );

  return (
    <StickyScreen header={
      <div style={{padding:"20px 20px 16px",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={{fontSize:11,color:T.acc,letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:700}}>Configuration</div>
          <div style={{fontSize:24,fontWeight:800,color:T.txt}}>Settings</div>
        </div>
        <button onClick={()=>setUnlocked(false)} style={{background:T.bgEl,border:`1px solid ${T.bdr}`,
          borderRadius:10,padding:"7px 14px",fontSize:11,color:T.mut,cursor:"pointer",fontWeight:600}}>
          🔒 Lock
        </button>
      </div>
    }>
      <div style={{padding:"0 20px 80px"}}>

      {health&&(
        <GrpCard title="🟢 Backend Health">
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            {[
              ["API",health.status==="healthy"?"Online ✓":"Offline ✗",health.status==="healthy"?T.grn:T.red],
              ["WebSocket",connected?"Connected":"Disconnected",connected?T.grn:T.amb],
              ["LLM",
                health.llm_live_status?.ok===true ? "✓ Working" :
                health.llm_live_status?.ok===false ? "✗ " + (health.llm_live_status.error||"Error").slice(0,30) :
                health.llm_configured ? "⏳ Pending first call" : "✗ Key missing",
                health.llm_live_status?.ok===true ? T.grn :
                health.llm_live_status?.ok===false ? T.red : T.amb],
              ["Telegram",health.telegram_configured?"✓ Ready":"✗ Keys missing",health.telegram_configured?T.grn:T.red],
              ["Finnhub",health.finnhub_configured?"✓ Ready":"✗ Key missing",health.finnhub_configured?T.grn:T.red],
              ["Signals",`${health.signals_in_db||0} in DB`,T.acc],
            ].map(([l,v,c])=>(
              <div key={l} style={{background:T.bgEl,borderRadius:10,padding:"10px 12px",border:`1px solid ${c}20`}}>
                <div style={{fontSize:10,color:T.mut,fontWeight:500}}>{l}</div>
                <div style={{fontSize:12,fontWeight:700,color:c||T.txt}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{background:T.ambLight,borderRadius:10,padding:"10px 12px",fontSize:11,color:T.txtMed,lineHeight:1.7}}>
            ⚠️ API keys must be set in your <strong>hosting environment</strong> (not here).<br/>
            Keys entered here only last until server restarts.
          </div>
        </GrpCard>
      )}

      <GrpCard title="📡 Telegram — Debug & Test">
        <div style={{background:T.ambLight,border:`1px solid ${T.amb}30`,borderRadius:10,padding:"10px 12px",marginBottom:14,fontSize:12,color:T.txtMed,lineHeight:1.6}}>
          <strong style={{color:T.amb}}>Keys must be in your server environment</strong>, not just typed below.
          Enter below only to test the connection.
        </div>
        <Inp label="Bot Token (test only)" value={tgToken} onChange={setTgToken} placeholder="7XXXXXXXX:AAXXXXXXXXXX"/>
        <Inp label="Channel Chat ID (test only)" value={tgChat} onChange={setTgChat} placeholder="-100XXXXXXXXXX"/>
        <div style={{display:"flex",gap:8,marginTop:4}}>
          <button onClick={testTelegram} disabled={testing} style={{flex:1,
            background:testResult==="ok"?T.grn:testResult==="error"?T.red:T.gradA,
            border:"none",borderRadius:10,padding:"11px 0",fontSize:12,fontWeight:700,color:T.bgCard,cursor:"pointer"}}>
            {testing?"Testing...":testResult==="ok"?"✓ Message sent!":testResult==="error"?"✗ Failed":"Test Connection"}
          </button>
          <button onClick={()=>api.post("/api/telegram/digest",{})}
            style={{flex:1,background:T.bgEl,border:`1px solid ${T.bdr}`,borderRadius:10,
              padding:"11px 0",fontSize:12,fontWeight:700,color:T.mut,cursor:"pointer"}}>
            Send Digest Now
          </button>
        </div>

        {/* Telegram debug button */}
        <button onClick={runDebug} disabled={loadingDebug}
          style={{width:"100%",marginTop:8,background:T.bgIn,border:`1px solid ${T.bdr}`,
            borderRadius:10,padding:"10px 0",fontSize:12,fontWeight:600,color:T.pur,cursor:"pointer"}}>
          {loadingDebug?"Running diagnosis...":"🔍 Run Full Telegram Diagnosis"}
        </button>

        {debugData&&(
          <div style={{marginTop:12,background:T.bgIn,borderRadius:10,padding:12,fontSize:11,
            color:T.txtMed,lineHeight:1.8}}>
            <div style={{fontWeight:700,color:debugData.issues?.length?T.red:T.grn,marginBottom:8,fontSize:12}}>
              {debugData.diagnosis}
            </div>
            {debugData.issues?.length>0&&(
              <div style={{marginBottom:8}}>
                <strong style={{color:T.red}}>Issues found:</strong>
                {debugData.issues.map((iss,i)=>(
                  <div key={i} style={{marginTop:4,paddingLeft:8,borderLeft:`2px solid ${T.red}`,color:T.red}}>
                    {iss}
                  </div>
                ))}
              </div>
            )}
            <div style={{marginTop:8}}>
              <strong>Recent signal log:</strong>
              {(debugData.details?.recent_telegram_activity||[]).slice(0,5).map((l,i)=>(
                <div key={i} style={{marginTop:3,color:l.sent?T.grn:T.mut}}>
                  {l.sent?"✅":"⏭"} {l.ticker} (score:{l.score}) — {l.reason}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{marginTop:12,padding:12,background:T.accLight,borderRadius:10,fontSize:11,color:T.txtMed,lineHeight:1.8}}>
          <strong style={{color:T.acc}}>Why signals aren't firing — checklist:</strong><br/>
          1. TELEGRAM_BOT_TOKEN must be in server env (not just typed above)<br/>
          2. TELEGRAM_CHAT_ID must be in server env<br/>
          3. Score must reach ≥ {threshold} threshold<br/>
          4. Server must be awake — set UptimeRobot to ping /api/health<br/>
          5. Signals only fire 9AM–4PM ET, Mon–Fri
        </div>
      </GrpCard>

      <GrpCard title="⚡ Alert Threshold">
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
          <span style={{fontSize:12,color:T.mut,fontWeight:500}}>Fire Telegram when score ≥</span>
          <span style={{fontSize:15,fontWeight:800,color:scoreColor(threshold)}}>{threshold}/100</span>
        </div>
        <input type="range" min={50} max={95} step={5} value={threshold}
          onChange={e=>setThreshold(Number(e.target.value))} style={{width:"100%",accentColor:T.acc}}/>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:T.dim,marginTop:4}}>
          <span>50 – More alerts</span><span>95 – Strict only</span>
        </div>
      </GrpCard>

      <GrpCard title="🤖 LLM Backend">
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
          {["anthropic","openai","ollama"].map(opt=>(
            <button key={opt} onClick={()=>setLlm(opt)} style={{
              background:llm===opt?T.gradA:T.bgEl,border:`1.5px solid ${llm===opt?T.acc:T.bdr}`,
              color:llm===opt?T.bgCard:T.mut,borderRadius:10,padding:"10px 4px",
              fontSize:11,fontWeight:700,cursor:"pointer",textTransform:"capitalize"}}>{opt}</button>
          ))}
        </div>
        <div style={{fontSize:11,color:T.dim,lineHeight:1.6}}>
          {llm==="anthropic"?"Requires ANTHROPIC_API_KEY in server env. Best quality for signal analysis.":
           llm==="openai"?"Requires OPENAI_API_KEY in server env.":
           "Requires Ollama on same machine as backend. No API cost."}
        </div>
      </GrpCard>

      <button onClick={save} style={{width:"100%",background:saved?T.grn:T.gradA,border:"none",
        borderRadius:16,padding:17,fontSize:15,fontWeight:800,color:T.bgCard,cursor:"pointer",
        transition:"all 0.3s",boxShadow:saved?`0 4px 12px ${T.grn}40`:`0 4px 12px ${T.acc}40`}}>
        {saved?"✓ Saved!":"Save Settings"}
      </button>

      </div>
    </StickyScreen>
  );
};

// ─── PAPER TRADING SCREEN ────────────────────────────────────────────────────
const PaperScreen = () => {
  const [portfolios,setPortfolios] = useState([]);
  const [positions,setPositions]   = useState([]);
  const [trades,setTrades]         = useState([]);
  const [summary,setSummary]       = useState(null);
  const [tab,setTab]               = useState("overview");
  const [loading,setLoading]       = useState(true);
  const [modeFilter,setModeFilter] = useState("ALL");

  useEffect(()=>{
    const load = async () => {
      setLoading(true);
      const [pf,pos,tr,sm] = await Promise.all([
        api.get("/api/paper/portfolios"),
        api.get("/api/paper/positions"),
        api.get("/api/paper/trades?limit=50"),
        api.get("/api/paper/summary"),
      ]);
      if(pf?.portfolios) setPortfolios(pf.portfolios);
      if(pos?.positions) setPositions(pos.positions);
      if(tr?.trades)     setTrades(tr.trades);
      if(sm)             setSummary(sm);
      setLoading(false);
    };
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  },[]);

  const filteredTrades = modeFilter==="ALL" ? trades : trades.filter(t=>t.signal_mode===modeFilter);
  const filteredPos    = modeFilter==="ALL" ? positions : positions.filter(p=>p.signal_mode===modeFilter);

  const PnlBadge = ({pct}) => {
    const pos = (pct||0) >= 0;
    return <span style={{fontSize:11,fontWeight:700,color:pos?T.grn:T.red,
      background:pos?T.grnLight:T.redLight,padding:"2px 8px",borderRadius:20}}>
      {pos?"+":""}{(pct||0).toFixed(1)}%
    </span>;
  };

  return (
    <StickyScreen header={
      <div style={{background:T.bgCard,padding:"20px 20px 0"}}>
        <div style={{fontSize:11,color:T.acc,letterSpacing:"0.12em",textTransform:"uppercase",fontWeight:700}}>BigTrades</div>
        <div style={{fontSize:24,fontWeight:800,color:T.txt,marginBottom:14}}>Paper Trading</div>
        {summary && (
          <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:14,WebkitOverflowScrolling:"touch"}}>
            {[
              ["Total PnL", `${summary.total_realised_pnl>=0?"+":""}$${Math.abs(summary.total_realised_pnl||0).toFixed(0)}`, summary.total_realised_pnl>=0?T.grn:T.red],
              ["Win Rate", `${summary.overall_win_rate||0}%`, T.acc],
              ["Trades", summary.total_trades||0, T.txt],
              ["Open", summary.open_positions||0, T.amb],
            ].map(([l,v,c])=>(
              <div key={l} style={{background:T.bgEl,border:`1px solid ${T.bdr}`,borderRadius:10,padding:"8px 14px",flexShrink:0}}>
                <div style={{fontSize:10,color:T.mut,fontWeight:500}}>{l}</div>
                <div style={{fontSize:14,fontWeight:800,color:c||T.txt}}>{v}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{display:"flex",borderTop:`1px solid ${T.bdr}`,margin:"0 -20px"}}>
          {[["overview","Portfolios"],["positions","Open"],["trades","Closed"],["analytics","Analytics"]].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} style={{flex:1,padding:"12px 4px",fontSize:11,fontWeight:700,
              cursor:"pointer",background:"none",border:"none",
              borderBottom:tab===k?`2.5px solid ${T.acc}`:"2.5px solid transparent",
              color:tab===k?T.acc:T.mut}}>{l}</button>
          ))}
        </div>
      </div>
    }>
      <div style={{padding:"0 20px 80px"}}>
        {/* Mode filter chips */}
        <div style={{display:"flex",gap:8,overflowX:"auto",padding:"12px 0 4px",WebkitOverflowScrolling:"touch"}}>
          {["ALL",...SIGNAL_MODES.map(m=>m.id)].map(id=>{
            const m = SIGNAL_MODES.find(x=>x.id===id);
            return <Chip key={id} label={m?`${m.icon} ${m.label}`:"All"} active={modeFilter===id}
              onClick={()=>setModeFilter(id)} color={m?.color||T.acc}/>;
          })}
        </div>

        {tab==="overview" && (
          loading ? <LoadingPulse/> :
          portfolios.filter(p=>modeFilter==="ALL"||p.mode===modeFilter).map(pf=>{
            const m = SIGNAL_MODES.find(x=>x.id===pf.mode)||{icon:"",color:T.acc,bg:T.accLight};
            const won = pf.total_return_pct >= 0;
            return (
              <div key={pf.mode} style={{background:T.bgCard,border:`1px solid ${T.bdrCard}`,borderRadius:16,
                padding:16,marginBottom:12,boxShadow:T.shadow}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:36,height:36,borderRadius:"50%",background:m.bg,
                      display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{m.icon}</div>
                    <div>
                      <div style={{fontSize:14,fontWeight:800,color:T.txt}}>{pf.label}</div>
                      <div style={{fontSize:11,color:T.mut}}>{m.id}</div>
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:18,fontWeight:800,color:won?T.grn:T.red}}>
                      ${(pf.total_value||0).toLocaleString("en",{maximumFractionDigits:0})}
                    </div>
                    <PnlBadge pct={pf.total_return_pct}/>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
                  {[
                    ["Cash", `$${(pf.cash||0).toFixed(0)}`, T.txt],
                    ["Invested", `$${(pf.total_invested||0).toFixed(0)}`, T.acc],
                    ["Win Rate", `${pf.win_rate||0}%`, pf.win_rate>=50?T.grn:T.red],
                    ["Trades", pf.trade_count||0, T.mut],
                  ].map(([l,v,c])=>(
                    <div key={l} style={{background:T.bgEl,borderRadius:8,padding:"8px 10px"}}>
                      <div style={{fontSize:9,color:T.dim,fontWeight:500}}>{l}</div>
                      <div style={{fontSize:12,fontWeight:700,color:c}}>{v}</div>
                    </div>
                  ))}
                </div>
                {/* PnL bar */}
                <div style={{marginTop:10,background:T.bgEl,borderRadius:4,height:4,overflow:"hidden"}}>
                  <div style={{width:`${Math.min(100,Math.max(0,(pf.win_count||0)/(pf.trade_count||1)*100))}%`,
                    height:"100%",background:T.grn,borderRadius:4}}/>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:T.dim,marginTop:4}}>
                  <span>{pf.win_count||0} wins</span><span>{pf.loss_count||0} losses</span>
                </div>
              </div>
            );
          })
        )}

        {tab==="positions" && (
          loading ? <LoadingPulse/> :
          filteredPos.length===0
            ? <EmptyState icon="📭" title="No open positions" subtitle="Paper trades open automatically when signals score above mode threshold during market hours."/>
            : filteredPos.map(pos=>{
                const m = SIGNAL_MODES.find(x=>x.id===pos.signal_mode)||{icon:"",color:T.acc,bg:T.accLight};
                return (
                  <div key={pos.id} style={{background:T.bgCard,border:`1px solid ${T.bdrCard}`,borderRadius:16,
                    padding:16,marginBottom:12,boxShadow:T.shadow,borderLeft:`3px solid ${m.color}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                      <div>
                        <div style={{display:"flex",gap:7,alignItems:"center"}}>
                          <span style={{fontSize:18,fontWeight:800,color:T.txt}}>{pos.ticker}</span>
                          <span style={{fontSize:10,background:m.bg,color:m.color,padding:"2px 8px",borderRadius:20,fontWeight:700}}>{m.icon} {pos.signal_mode}</span>
                        </div>
                        <div style={{fontSize:11,color:T.mut,marginTop:3}}>
                          Entered @ ${pos.entry_price} · Score {pos.entry_score}/100 · {pos.entry_level}
                        </div>
                        <div style={{fontSize:10,color:T.dim,marginTop:2}}>
                          {pos.entry_ts?.slice(0,10)} · {pos.shares} shares · ${(pos.position_value||0).toFixed(0)}
                        </div>
                      </div>
                      <ScoreRing score={pos.entry_score||0} size={42}/>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                      {[
                        ["TP1",`$${pos.tp1_price||"—"}`,T.grn],
                        ["Stop",`$${pos.stop_price||"—"}`,T.red],
                        ["Max Hold",`${pos.max_hold_days||"—"}d`,T.mut],
                      ].map(([l,v,c])=>(
                        <div key={l} style={{background:T.bgEl,borderRadius:8,padding:"8px 10px"}}>
                          <div style={{fontSize:9,color:T.dim}}>{l}</div>
                          <div style={{fontSize:12,fontWeight:700,color:c}}>{v}</div>
                        </div>
                      ))}
                    </div>
                    {pos.entry_catalyst && (
                      <div style={{marginTop:10,fontSize:11,color:T.mut,lineHeight:1.5,
                        background:T.bgEl,borderRadius:8,padding:"8px 10px"}}>
                        {pos.entry_catalyst}
                      </div>
                    )}
                  </div>
                );
              })
        )}

        {tab==="trades" && (
          loading ? <LoadingPulse/> :
          filteredTrades.length===0
            ? <EmptyState icon="📋" title="No closed trades yet" subtitle="Trades close automatically when TP/Stop is hit, score drops, or max hold expires."/>
            : filteredTrades.map(tr=>{
                const m  = SIGNAL_MODES.find(x=>x.id===tr.signal_mode)||{icon:"",color:T.acc};
                const won = (tr.pnl_pct||0) >= 0;
                const statusColors = {CLOSED_TP1:T.grn,CLOSED_TP2:T.grn,CLOSED_STOP:T.red,CLOSED_SCORE:T.amb,CLOSED_EXPIRE:T.mut,CLOSED_MANUAL:T.mut};
                return (
                  <div key={tr.id} style={{background:T.bgCard,border:`1px solid ${T.bdrCard}`,borderRadius:14,
                    padding:14,marginBottom:10,boxShadow:T.shadow}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                      <div style={{display:"flex",gap:7,alignItems:"center"}}>
                        <span style={{fontSize:16,fontWeight:800,color:T.txt}}>{tr.ticker}</span>
                        <span style={{fontSize:9,background:m.bg||T.accLight,color:m.color||T.acc,
                          padding:"2px 7px",borderRadius:20,fontWeight:700}}>{m.icon} {tr.signal_mode}</span>
                      </div>
                      <PnlBadge pct={tr.pnl_pct}/>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6,marginBottom:8}}>
                      {[
                        ["Entry","$"+(tr.entry_price||"—"),T.txt],
                        ["Exit","$"+(tr.exit_price||"—"),won?T.grn:T.red],
                        ["Score",`${tr.entry_score||0}/100`,scoreColor(tr.entry_score||0)],
                        ["Days",(tr.hold_days||0).toFixed(1),T.mut],
                      ].map(([l,v,c])=>(
                        <div key={l} style={{background:T.bgEl,borderRadius:7,padding:"7px 8px"}}>
                          <div style={{fontSize:8,color:T.dim}}>{l}</div>
                          <div style={{fontSize:11,fontWeight:700,color:c}}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{fontSize:10,color:statusColors[tr.status]||T.mut,fontWeight:600}}>
                      {tr.status?.replace("CLOSED_","").replace("_"," ")} — {tr.exit_reason}
                    </div>
                  </div>
                );
              })
        )}

        {tab==="analytics" && (
          <div>
            <div style={{background:T.bgCard,border:`1px solid ${T.bdrCard}`,borderRadius:14,padding:16,marginBottom:12,boxShadow:T.shadow}}>
              <div style={{fontSize:12,fontWeight:700,color:T.txt,marginBottom:12}}>Developer Data Access</div>
              {[
                ["📥 Export Paper Trades CSV", "/api/export/paper_trades.csv", T.grn],
                ["📥 Export Signal History CSV", "/api/export/signal_history.csv?days=30", T.acc],
                ["🔍 Signal History API", "/api/analytics/signal_history?days=7", T.pur],
                ["📊 Performance by Mode", "/api/analytics/performance_by_mode", T.amb],
                ["🔗 Score vs Return", "/api/analytics/score_vs_return", T.acc],
                ["⚡ Surge Candidates", "/api/analytics/surge_detection", T.red],
                ["🗄 Table Row Counts", "/api/developer/tables", T.mut],
                ["💬 Raw SQL Query", "/api/developer/raw_sql?q=SELECT+*+FROM+paper_trades+LIMIT+10", T.txt],
              ].map(([label, path, color])=>(
                <a key={path} href={`${API_BASE}${path}`} target="_blank" rel="noreferrer"
                  style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                    padding:"10px 0",borderBottom:`1px solid ${T.bdr}`,textDecoration:"none"}}>
                  <span style={{fontSize:12,color:T.txt}}>{label}</span>
                  <span style={{fontSize:10,color,background:`${color}15`,padding:"3px 8px",borderRadius:20,fontWeight:600}}>Open →</span>
                </a>
              ))}
            </div>
            <div style={{background:T.ambLight,border:`1px solid ${T.amb}30`,borderRadius:12,padding:14}}>
              <div style={{fontSize:12,fontWeight:700,color:T.amb,marginBottom:6}}>For Python / Pandas analysis</div>
              <div style={{background:"#1C1917",borderRadius:8,padding:12,fontSize:11,color:"#A8A29E",fontFamily:"monospace",lineHeight:1.8}}>
                <span style={{color:"#E8640A"}}>import</span> pandas <span style={{color:"#E8640A"}}>as</span> pd{"\n"}
                df = pd.read_csv({'"'}{API_BASE}/api/export/paper_trades.csv{'"'}){"\n"}
                df[<span style={{color:"#1A8C4E"}}>'pnl_pct'</span>].hist(){"\n"}
                <span style={{color:"#8890AA"}}># or raw SQL:</span>{"\n"}
                url = {'"'}{API_BASE}/api/developer/raw_sql{'"'}{"\n"}
                r = requests.get(url, params={"{"}{'q'}: {'"'}SELECT signal_mode, AVG(pnl_pct) FROM paper_trades GROUP BY signal_mode{'"'}{"}"}){"\n"}
              </div>
            </div>
          </div>
        )}

      </div>
    </StickyScreen>
  );
};
const NAV=[{id:"home",icon:"⚡",label:"Signals"},{id:"congress",icon:"🏛",label:"Congress"},
  {id:"news",icon:"📰",label:"News"},{id:"paper",icon:"📄",label:"Paper"},
  {id:"settings",icon:"⚙️",label:"Settings"}];

const BottomNav = ({active,onChange})=>(
  <div style={{position:"fixed",bottom:0,left:0,right:0,maxWidth:430,margin:"0 auto",
    background:T.bgCard,borderTop:`1px solid ${T.bdr}`,display:"flex",zIndex:50,
    paddingBottom:"env(safe-area-inset-bottom,0px)",boxShadow:"0 -4px 16px rgba(0,0,0,0.08)"}}>
    {NAV.map(item=>(
      <button key={item.id} onClick={()=>onChange(item.id)} style={{flex:1,background:"none",
        border:"none",padding:"10px 0 8px",cursor:"pointer",display:"flex",
        flexDirection:"column",alignItems:"center",gap:3,transition:"all 0.15s"}}>
        <span style={{fontSize:20,filter:active===item.id?"none":"grayscale(1) opacity(0.3)",
          transform:active===item.id?"scale(1.1)":"scale(1)",transition:"all 0.15s"}}>{item.icon}</span>
        <span style={{fontSize:9,fontWeight:active===item.id?700:400,
          color:active===item.id?T.acc:T.dim,letterSpacing:"0.02em"}}>{item.label}</span>
      </button>
    ))}
  </div>
);

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App() {
  const [screen,setScreen]       = useState("home");
  const [selected,setSelected]   = useState(null);
  const [mode,setMode]           = useState("SWING");
  const [signals,setSignals]     = useState([]);
  const [congress,setCongress]   = useState([]);
  const [news,setNews]           = useState([]);
  const [market,setMarket]       = useState({});
  const [loading,setLoading]     = useState(true);
  const [toast,setToast]         = useState(null);
  const [refreshing,setRefreshing] = useState(false); // B: manual refresh spinner
  const [llmOk,setLlmOk]           = useState(null);   // null=unknown, true=working, false=offline
  const [llmError,setLlmError]      = useState(null);   // human-readable error from /api/health
  const horizon    = mode;
  const setHorizon = setMode;

  const showToast=useCallback((msg)=>{setToast(msg);setTimeout(()=>setToast(null),3500);},[]);

  const handleWsMessage=useCallback((msg)=>{
    if(msg.type==="initial_load"&&msg.data?.length){
      setSignals(msg.data); setLoading(false);
    } else if(msg.type==="signal_update"&&msg.data?.ticker){
      setSignals(prev=>{
        const idx=prev.findIndex(s=>s.ticker===msg.data.ticker);
        if(idx>=0){const n=[...prev];n[idx]=msg.data;return n;}
        return [msg.data,...prev];
      });
      if(msg.data.fire_telegram) showToast(`${msg.data.signal_mode==="SURGE"?"⚡":"🔥"} ${msg.data.ticker} ${msg.data.signal_mode||""} signal! (${msg.data.score}/100)`);
    }
  },[showToast]);

  const connected=useWS(handleWsMessage);

  // B: fetchSignals is a stable callback keyed on mode
  const fetchSignals = useCallback(async(showSpinner=false)=>{
    if(showSpinner) setRefreshing(true);
    const s = await api.get(`/api/signals?mode=${mode}`);
    if(s?.signals?.length) setSignals(s.signals);
    if(showSpinner) setRefreshing(false);
  },[mode]);

  // B: Manual refresh — triggers backend scan then re-fetches
  // Uses yfinance 30-day cached data → no extra API cost vs regular scan
  const handleManualRefresh = useCallback(async()=>{
    if(refreshing) return;
    setRefreshing(true);
    showToast("↻ Refreshing signals…");
    await api.post("/api/scan",{});
    await new Promise(r=>setTimeout(r,4000));
    await fetchSignals(false);
    setRefreshing(false);
    showToast("✓ Signals refreshed");
  },[fetchSignals,showToast,refreshing]);

  useEffect(()=>{
    const load=async()=>{
      setLoading(true);
      const [sig,cong,nws,mkt]=await Promise.all([
        api.get(`/api/signals?mode=${mode}`),
        api.get("/api/congress"),
        api.get("/api/news"),
        api.get("/api/market"),
      ]);
      if(sig?.signals?.length) setSignals(sig.signals);
      if(cong?.trades?.length) setCongress(cong.trades);
      if(nws?.catalysts?.length) setNews(nws.catalysts);
      if(mkt?.vix) setMarket(mkt);
      setLoading(false);
    };
    load();

    // Poll /api/health once on mount to get LLM status for soft-error display
    api.get("/api/health").then(h=>{
      if(!h) return;
      const live = h.llm_live_status;
      if(live?.ok===true)  { setLlmOk(true);  setLlmError(null); }
      else if(live?.ok===false){ setLlmOk(false); setLlmError(live.error||"AI backend error"); }
      else if(h.llm_configured===false){ setLlmOk(false); setLlmError("OPENAI_API_KEY not set in server .env"); }
      else { setLlmOk(null); } // key is set but no call made yet — show "pending"
    });

    // Smart interval: 10 min during market hours, 30 min off-hours
    // Uses self-scheduling setTimeout so each tick re-evaluates market status
    const MARKET_MS   = 10 * 60 * 1000;
    const OFFHOURS_MS = 30 * 60 * 1000;
    const timerRef = {current:null};
    const tick = ()=>{
      timerRef.current = setTimeout(async()=>{
        await fetchSignals();
        api.get("/api/news").then(n=>n?.catalysts?.length&&setNews(n.catalysts));
        api.get("/api/market").then(m=>m?.vix&&setMarket(m));
        api.get("/api/congress").then(c=>c?.trades?.length&&setCongress(c.trades));
        tick(); // reschedule — picks up new market-open status each time
      }, isMarketOpen() ? MARKET_MS : OFFHOURS_MS);
    };
    tick();
    return()=>clearTimeout(timerRef.current);
  },[mode,fetchSignals]);

  return (
    <div style={{background:T.bg,minHeight:"100vh",maxWidth:430,margin:"0 auto",
      fontFamily:"-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif",
      position:"relative",overflowX:"hidden"}}>
      <div style={{height:"env(safe-area-inset-top,0px)",background:T.bgCard}}/>

      {screen==="home"      &&<HomeScreen signals={signals} loading={loading} connected={connected} onSelect={setSelected} market={market} horizon={horizon} setHorizon={setHorizon} onManualRefresh={handleManualRefresh} refreshing={refreshing}/>}
      {screen==="congress"  &&<CongressScreen data={congress} loading={loading}/>}
      {screen==="news"      &&<NewsScreen data={news} loading={loading}/>}
      {screen==="paper"     &&<PaperScreen/>}
      {screen==="settings"  &&<SettingsScreen connected={connected} onSettingsSaved={()=>showToast("✓ Settings saved")}/>}

      {selected&&<SignalDetail
        signal={signals.find(s=>s.ticker===selected.ticker&&s.signal_mode===selected.signal_mode)||selected}
        onClose={()=>setSelected(null)}
        llmOk={llmOk}
        llmError={llmError}
      />}
      {!selected&&<BottomNav active={screen} onChange={setScreen}/>}

      {toast&&(
        <div style={{position:"fixed",bottom:90,left:"50%",transform:"translateX(-50%)",
          background:T.bgCard,border:`1px solid ${T.acc}40`,borderRadius:24,
          padding:"11px 22px",fontSize:13,color:T.txt,zIndex:300,whiteSpace:"nowrap",
          boxShadow:`0 8px 24px rgba(0,0,0,0.15), 0 0 0 1px ${T.acc}20`}}>
          {toast}
        </div>
      )}

      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
        *{-webkit-tap-highlight-color:transparent;box-sizing:border-box}
        input,button{font-family:inherit}
        ::-webkit-scrollbar{display:none}
      `}</style>
    </div>
  );
}


/* ─── PHASE 1: MACRO + AI DIAGNOSTICS ───────────────────────────────────── */

const FreshnessBadge = ({ts})=>{
  if(!ts) return null;
  const mins = Math.floor((Date.now() - new Date(ts).getTime())/60000);
  const stale = mins > 240;

  return (
    <div style={{
      fontSize:11,
      padding:"4px 8px",
      borderRadius:20,
      background: stale ? T.redLight : T.grnLight,
      color: stale ? T.red : T.grn,
      border:`1px solid ${stale ? T.red : T.grn}30`,
      fontWeight:700
    }}>
      {stale ? "STALE" : "FRESH"} · {fmtRelTime(ts)}
    </div>
  );
};

const MacroRegimeCard = ({macro})=>{
  if(!macro) return null;

  return (
    <div style={{
      background:T.bgCard,
      border:`1px solid ${T.bdr}`,
      borderRadius:18,
      padding:18,
      marginBottom:18,
      boxShadow:T.shadow
    }}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div>
          <div style={{fontSize:13,fontWeight:800,color:T.txt}}>Macro Regime</div>
          <div style={{fontSize:11,color:T.mut}}>
            {macro.risk_mode} · Fed {macro.fed_stance}
          </div>
        </div>

        <FreshnessBadge ts={macro.updated_at}/>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div style={{background:T.bgEl,padding:12,borderRadius:12}}>
          <div style={{fontSize:11,color:T.mut}}>10Y Treasury</div>
          <div style={{fontSize:18,fontWeight:800,color:T.txt}}>
            {macro.treasury_10y || "—"}%
          </div>
          <div style={{fontSize:11,color:T.acc}}>
            {macro.treasury_trend}
          </div>
        </div>

        <div style={{background:T.bgEl,padding:12,borderRadius:12}}>
          <div style={{fontSize:11,color:T.mut}}>VIX</div>
          <div style={{fontSize:18,fontWeight:800,color:T.txt}}>
            {macro.vix || "—"}
          </div>
          <div style={{fontSize:11,color:T.acc}}>
            {macro.vix_regime}
          </div>
        </div>
      </div>

      <div style={{marginTop:14,fontSize:12,color:T.txtMed}}>
        <strong>Strongest:</strong> {(macro.strongest_sectors||[]).join(", ")}
      </div>

      <div style={{marginTop:6,fontSize:12,color:T.txtMed}}>
        <strong>Weakest:</strong> {(macro.weakest_sectors||[]).join(", ")}
      </div>
    </div>
  );
};

const AIDiagnosticsPanel = ({health})=>(
  <div style={{
    background:T.bgCard,
    border:`1px solid ${T.bdr}`,
    borderRadius:16,
    padding:16,
    marginBottom:18
  }}>
    <div style={{display:"flex",justifyContent:"space-between"}}>
      <div>
        <div style={{fontSize:13,fontWeight:800,color:T.txt}}>AI Diagnostics</div>
        <div style={{fontSize:11,color:T.mut}}>
          GPT-4o-mini enrichment engine
        </div>
      </div>

      <div style={{
        fontSize:11,
        fontWeight:700,
        color:health?.ok ? T.grn : T.red
      }}>
        {health?.ok ? "ONLINE" : "DEGRADED"}
      </div>
    </div>

    <div style={{marginTop:10,fontSize:12,color:T.txtMed}}>
      Backend: {health?.backend || "gpt-4o-mini"}
    </div>

    <div style={{marginTop:4,fontSize:12,color:T.txtMed}}>
      Model: {health?.model || "gpt-4o-mini"}
    </div>

    {!!health?.error && (
      <div style={{marginTop:8,fontSize:11,color:T.red}}>
        {health.error}
      </div>
    )}
  </div>
);


/* ─── PHASE 1 UI NOTES ──────────────────────────────────────────────────────
Added:
- macro regime dashboard card
- AI diagnostics panel
- enrichment freshness badges
- persistent AI enrichment rendering support
- graceful stale/offline states
- institutional Telegram-ready UI foundations
*/
