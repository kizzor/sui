'use client'
import './globals.css'
import '@solana/wallet-adapter-react-ui/styles.css'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { ConnectionProvider, WalletProvider, useWallet } from '@solana/wallet-adapter-react'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui'

// ─── Types ────────────────────────────────────────────────────────────────────
type Cell = { num:number|null; matched:boolean; clicked:boolean; missed:boolean }
type Device = {
  walletAddr:string|null; id:number; nftId:string; grid:Cell[][]; claimed:Set<string>; active:boolean; corrupted:boolean }
type WinType = 'EARLY_FIVE'|'TOP_LINE'|'MIDDLE_LINE'|'BOTTOM_LINE'|'FULL_HOUSE_1'|'FULL_HOUSE_2'|'FULL_HOUSE_3'
type WinState = { claimed:boolean; claimable:boolean; flickering:boolean; broken:boolean; claimers:string[]; expired:boolean; bursting:boolean }
type ChatLine = { t:'sys'|'user'|'cmd'|'img'; m:string; src?:string; vSrc?:string }
type WinRecord = { wt:WinType; claimers:string[]; round:number; split:number; rnsmEach:number }
type MediaItem = { src:string; type:'image'|'video'; name:string }

const STORAGE_KEY='ransome_state_v1'
function saveState(data:object){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(data))}catch{}}
function loadState():any{try{const s=localStorage.getItem(STORAGE_KEY);return s?JSON.parse(s):null}catch{return null}}

// ─── Constants ────────────────────────────────────────────────────────────────
const WIN_LABELS:Record<WinType,string> = {
  EARLY_FIVE:'5 Digit Accounts Hacked', TOP_LINE:'Top Accounts Hacked',
  MIDDLE_LINE:'Central System Hacked',  BOTTOM_LINE:'Basement Hacked',
  FULL_HOUSE_1:'Bankrupt Ransome I',    FULL_HOUSE_2:'Bankrupt Ransome II', FULL_HOUSE_3:'Bankrupt Ransome III',
}
const LED_COLORS:Record<WinType,string> = {
  EARLY_FIVE:'#f59e0b', TOP_LINE:'#0ea5e9', MIDDLE_LINE:'#22c55e', BOTTOM_LINE:'#a16207',
  FULL_HOUSE_1:'#f472b6', FULL_HOUSE_2:'#ec4899', FULL_HOUSE_3:'#db2777',
}
const WIN_VAULT:Record<WinType,number> = {
  EARLY_FIVE:50000, TOP_LINE:100000, MIDDLE_LINE:100000, BOTTOM_LINE:100000,
  FULL_HOUSE_1:250000, FULL_HOUSE_2:250000, FULL_HOUSE_3:150000,
}
const COL_HEADERS = ['1-10','11-20','21-30','31-40','41-50','51-60','61-70','71-80','81-90']
const COL_RANGES:[number,number][] = [[1,10],[11,20],[21,30],[31,40],[41,50],[51,60],[61,70],[71,80],[81,90]]
const CLAIM_WALLET = 'F6bbR6ro9W4nS6uBMmSLhsknhQ6NJR523DZXkRQnkFcx'
const HACK_CMDS = ['INIT PAYLOAD','BYPASS FIREWALL','SCAN PORT 8443','BRUTE SHA-256','DECRYPT TLS','EXPLOIT CVE-2024','INJECT SQL','PIVOT SUBNET','EXFIL VAULT','SPOOF MAC','ARP POISON','DUMP LSASS','ESCALATE PRIV','DEPLOY ROOTKIT','TUNNEL SSH','SNIFF ETH0','CRACK WPA2','OVERFLOW STACK','COVER TRACKS','FORGE JWT','EXFIL DB','PIVOT VPN','DEPLOY METERP','RCE SHELL','WIPE LOGS']
const HACK_STATUSES = ['[OK]','[ACK]','[ERR]','[WARN]','[DONE]','[LIVE]']

const BANKS = [
  {id:0, name:'Pacific Reserve',   city:'Auckland',       tz:12,  x:87,y:72, region:'APAC', vault:'$1.2B'},
  {id:1, name:'Sakura Central',    city:'Tokyo',          tz:9,   x:80,y:31, region:'APAC', vault:'$2.1B'},
  {id:2, name:'Dragon Vault',      city:'Shanghai',       tz:8,   x:76,y:35, region:'APAC', vault:'$3.8B'},
  {id:3, name:'Tiger Bank',        city:'Singapore',      tz:8,   x:74,y:54, region:'APAC', vault:'$1.9B'},
  {id:4, name:'Indus Capital',     city:'Mumbai',         tz:5.5, x:64,y:41, region:'ASIA', vault:'$2.4B'},
  {id:5, name:'Gulf Reserve',      city:'Dubai',          tz:4,   x:61,y:40, region:'MENA', vault:'$4.1B'},
  {id:6, name:'Nile Treasury',     city:'Cairo',          tz:2,   x:53,y:37, region:'MENA', vault:'$0.9B'},
  {id:7, name:'Savanna Vault',     city:'Nairobi',        tz:3,   x:56,y:58, region:'AFR',  vault:'$0.6B'},
  {id:8, name:'Cape Reserve',      city:'Cape Town',      tz:2,   x:52,y:75, region:'AFR',  vault:'$0.8B'},
  {id:9, name:'Colosseum Bank',    city:'Rome',           tz:1,   x:50,y:29, region:'EUR',  vault:'$1.7B'},
  {id:10,name:'Rhine Vault',       city:'Frankfurt',      tz:1,   x:50,y:23, region:'EUR',  vault:'$3.2B'},
  {id:11,name:'Thames Capital',    city:'London',         tz:0,   x:46,y:23, region:'EUR',  vault:'$5.1B'},
  {id:12,name:'Nordic Reserve',    city:'Oslo',           tz:1,   x:49,y:16, region:'EUR',  vault:'$1.1B'},
  {id:13,name:'Kremlin Bank',      city:'Moscow',         tz:3,   x:58,y:20, region:'EUR',  vault:'$2.8B'},
  {id:14,name:'Atlas Treasury',    city:'Casablanca',     tz:1,   x:44,y:35, region:'AFR',  vault:'$0.7B'},
  {id:15,name:'Amazon Reserve',    city:'São Paulo',      tz:-3,  x:32,y:67, region:'AMER', vault:'$1.6B'},
  {id:16,name:'Andes Vault',       city:'Bogotá',         tz:-5,  x:24,y:54, region:'AMER', vault:'$0.8B'},
  {id:17,name:'Manhattan Capital', city:'New York',       tz:-5,  x:21,y:28, region:'AMER', vault:'$6.7B'},
  {id:18,name:'Silicon Reserve',   city:'San Francisco',  tz:-8,  x:10,y:32, region:'AMER', vault:'$4.3B'},
  {id:19,name:'Maple Treasury',    city:'Toronto',        tz:-5,  x:20,y:24, region:'AMER', vault:'$2.2B'},
  {id:20,name:'Red Sea Bank',      city:'Riyadh',         tz:3,   x:59,y:40, region:'MENA', vault:'$3.5B'},
  {id:21,name:'Carnival Bank',     city:'Rio',            tz:-3,  x:33,y:68, region:'AMER', vault:'$1.0B'},
  {id:22,name:'Azores Vault',      city:'Lisbon',         tz:0,   x:43,y:29, region:'EUR',  vault:'$1.4B'},
]
const REGION_COLORS:{[k:string]:string}={APAC:'#0ea5e9',EUR:'#22c55e',AMER:'#f59e0b',MENA:'#f97316',AFR:'#a855f7',ASIA:'#ec4899'}

const defaultWinStates=():Record<WinType,WinState>=>({
  EARLY_FIVE:  {claimed:false,claimable:false,flickering:false,broken:false,claimers:[],expired:false,bursting:false},
  TOP_LINE:    {claimed:false,claimable:false,flickering:false,broken:false,claimers:[],expired:false,bursting:false},
  MIDDLE_LINE: {claimed:false,claimable:false,flickering:false,broken:false,claimers:[],expired:false,bursting:false},
  BOTTOM_LINE: {claimed:false,claimable:false,flickering:false,broken:false,claimers:[],expired:false,bursting:false},
  FULL_HOUSE_1:{claimed:false,claimable:false,flickering:false,broken:false,claimers:[],expired:false,bursting:false},
  FULL_HOUSE_2:{claimed:false,claimable:false,flickering:false,broken:false,claimers:[],expired:false,bursting:false},
  FULL_HOUSE_3:{claimed:false,claimable:false,flickering:false,broken:false,claimers:[],expired:false,bursting:false},
})

function getLiveBank(h:number){return h%23}

// ─── Ticket Generator ─────────────────────────────────────────────────────────
function generateDevice(id:number):Device{
  const nftId=`RNSM-${String(id).padStart(4,'0')}`
  const colCounts=Array(9).fill(1)
  Array.from({length:9},(_,i)=>i).sort(()=>Math.random()-0.5).slice(0,6).forEach(i=>colCounts[i]++)
  const colRows:number[][]=colCounts.map(cnt=>[0,1,2].sort(()=>Math.random()-0.5).slice(0,cnt))
  const rowCounts=[0,0,0];colRows.forEach(rows=>rows.forEach(r=>rowCounts[r]++))
  let att=0
  while((rowCounts[0]!==5||rowCounts[1]!==5||rowCounts[2]!==5)&&att<200){
    att++;colCounts.fill(1)
    Array.from({length:9},(_,i)=>i).sort(()=>Math.random()-0.5).slice(0,6).forEach(i=>colCounts[i]++)
    colRows.splice(0,9,...colCounts.map(cnt=>[0,1,2].sort(()=>Math.random()-0.5).slice(0,cnt)))
    rowCounts.fill(0);colRows.forEach(rows=>rows.forEach(r=>rowCounts[r]++))
  }
  const used=new Set<number>()
  const grid:Cell[][]=Array.from({length:3},()=>Array(9).fill(null).map(()=>({num:null,matched:false,clicked:false,missed:false})))
  for(let ci=0;ci<9;ci++){
    const[lo,hi]=COL_RANGES[ci];const rows=colRows[ci].sort((a,b)=>a-b)
    const avail:number[]=[];for(let n=lo;n<=hi;n++)if(!used.has(n))avail.push(n)
    const picked=avail.sort(()=>Math.random()-0.5).slice(0,rows.length).sort((a,b)=>a-b)
    picked.forEach(n=>used.add(n));rows.forEach((r,i)=>{grid[r][ci]={num:picked[i],matched:false,clicked:false,missed:false}})
  }
  return{id,nftId,walletAddr:null,grid,claimed:new Set(),active:false,corrupted:false}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function useHourCountdown(){
  const get=()=>{const now=new Date();const s=now.getUTCMinutes()*60+now.getUTCSeconds();const l=3600-s-300;return l>0?l:0}
  const[s,setS]=useState(get)
  useEffect(()=>{const t=setInterval(()=>setS(get()),1000);return()=>clearInterval(t)},[])
  return s
}
// 59-minute lobby cycle — resets every 59 minutes from UTC epoch
// Fill pct rises 0→1 as countdown falls 59min→0
const LOBBY_CYCLE=59*60
function useLobbyCountdown(){
  const get=()=>{
    const now=new Date()
    const elapsed=now.getUTCHours()*3600+now.getUTCMinutes()*60+now.getUTCSeconds()
    return LOBBY_CYCLE-(elapsed%LOBBY_CYCLE)
  }
  const[s,setS]=useState(get)
  useEffect(()=>{const t=setInterval(()=>setS(get()),1000);return()=>clearInterval(t)},[])
  return s
}
function fmtTime(s:number){const m=Math.floor(s/60),ss=s%60;return`${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`}


// ─── On-chain session polling ──────────────────────────────────────────────
// Polls /api/session-state every 2s during game to get live on-chain numbers
function useOnChainSession(active:boolean){
  const[onChain,setOnChain]=useState<{
    lastNumber:number;drawCount:number;drawn:number[];
    active:boolean;bankruptCount:number;winsClaimed:boolean[]
  }|null>(null)
  useEffect(()=>{
    if(!active)return
    const poll=async()=>{
      try{
        const r=await fetch('/api/session-state')
        if(r.ok){const d=await r.json();if(d.ok)setOnChain(d)}
      }catch{}
    }
    poll()
    const t=setInterval(poll,2000)
    return()=>clearInterval(t)
  },[active])
  return onChain
}

// ─── MiniStopwatch ────────────────────────────────────────────────────────────
function MiniStopwatch({seconds,total}:{seconds:number;total:number}){
  const danger=seconds<=10,r=12,circ=2*Math.PI*r,dash=circ*(seconds/Math.max(total,1))
  return(
    <div style={{position:'relative',width:34,height:34,flexShrink:0}}>
      <svg width="34" height="34" style={{transform:'rotate(-90deg)'}}>
        <circle cx="17" cy="17" r={r} fill="none" stroke="#0a1628" strokeWidth="2.5"/>
        <circle cx="17" cy="17" r={r} fill="none" stroke={danger?'#ef4444':'#00e5a0'} strokeWidth="2.5"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{transition:'stroke-dasharray 0.9s linear,stroke 0.3s'}}/>
      </svg>
      <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
        <span style={{fontFamily:'DM Mono,monospace',fontSize:8,fontWeight:700,color:danger?'#ef4444':'#00e5a0'}}>{String(seconds%60).padStart(2,'0')}</span>
      </div>
    </div>
  )
}

// ─── Outline World Map with bank sketches ────────────────────────────────────
function WorldMapSketch({currentHour,onSelectBank}:{currentHour:number;onSelectBank?:(id:number)=>void}){
  const live=getLiveBank(currentHour)
  const hourCd=useHourCountdown()
  const[hov,setHov]=useState<number|null>(null)
  return(
    <div style={{position:'relative',width:'100%',background:'#010c18',borderRadius:16,border:'1px solid #0a2535',overflow:'hidden'}}>
      <svg viewBox="0 0 200 105" style={{width:'100%',display:'block'}}>
        {/* Ocean grid */}
        {Array.from({length:21},(_,i)=><line key={`vg${i}`} x1={i*10} y1="0" x2={i*10} y2="105" stroke="#0a1830" strokeWidth="0.3"/>)}
        {Array.from({length:11},(_,i)=><line key={`hg${i}`} x1="0" y1={i*10} x2="200" y2={i*10} stroke="#0a1830" strokeWidth="0.3"/>)}

        {/* ── Continent outlines (sketch style) ── */}
        {/* North America */}
        <path d="M20,8 L38,8 L42,14 L40,20 L44,26 L42,34 L38,38 L34,42 L28,46 L22,50 L18,44 L16,36 L14,28 L16,20 L18,12 Z"
          fill="none" stroke="#1e3a5f" strokeWidth="0.6" strokeDasharray="2,1" strokeLinejoin="round"/>
        {/* Central America */}
        <path d="M28,46 L32,50 L30,56 L26,58 L24,54 L26,50 Z"
          fill="none" stroke="#1e3a5f" strokeWidth="0.5" strokeDasharray="2,1"/>
        {/* South America */}
        <path d="M30,58 L40,56 L46,60 L48,68 L46,78 L40,84 L34,82 L28,74 L26,66 L28,60 Z"
          fill="none" stroke="#1e3a5f" strokeWidth="0.6" strokeDasharray="2,1"/>
        {/* Europe */}
        <path d="M86,6 L96,6 L100,10 L100,16 L96,18 L92,22 L88,20 L84,16 L84,10 Z"
          fill="none" stroke="#1e3a5f" strokeWidth="0.6" strokeDasharray="2,1"/>
        {/* Scandinavia */}
        <path d="M90,4 L96,4 L98,8 L94,10 L90,8 Z"
          fill="none" stroke="#1e3a5f" strokeWidth="0.5" strokeDasharray="1.5,1"/>
        {/* Africa */}
        <path d="M88,28 L100,26 L108,30 L110,40 L108,52 L104,62 L98,70 L92,74 L86,70 L82,62 L80,50 L82,38 L86,30 Z"
          fill="none" stroke="#1e3a5f" strokeWidth="0.6" strokeDasharray="2,1"/>
        {/* Russia */}
        <path d="M100,4 L140,4 L148,8 L150,14 L142,16 L130,14 L118,16 L108,14 L100,10 Z"
          fill="none" stroke="#1e3a5f" strokeWidth="0.5" strokeDasharray="2,1"/>
        {/* Middle East */}
        <path d="M108,28 L122,26 L126,32 L124,38 L116,40 L110,38 L108,32 Z"
          fill="none" stroke="#1e3a5f" strokeWidth="0.5" strokeDasharray="1.5,1"/>
        {/* India */}
        <path d="M122,30 L132,28 L136,36 L134,44 L128,50 L122,44 L120,36 Z"
          fill="none" stroke="#1e3a5f" strokeWidth="0.5" strokeDasharray="2,1"/>
        {/* China/East Asia */}
        <path d="M136,8 L160,6 L168,12 L166,20 L158,24 L148,22 L138,18 L134,12 Z"
          fill="none" stroke="#1e3a5f" strokeWidth="0.5" strokeDasharray="2,1"/>
        {/* SE Asia */}
        <path d="M148,28 L158,26 L162,32 L160,38 L154,40 L148,36 Z"
          fill="none" stroke="#1e3a5f" strokeWidth="0.5" strokeDasharray="1.5,1"/>
        {/* Japan */}
        <path d="M164,16 L170,14 L172,18 L168,20 L164,18 Z"
          fill="none" stroke="#1e3a5f" strokeWidth="0.5" strokeDasharray="1,1"/>
        {/* Australia */}
        <path d="M158,62 L178,60 L184,66 L184,74 L178,80 L166,80 L158,74 L156,68 Z"
          fill="none" stroke="#1e3a5f" strokeWidth="0.6" strokeDasharray="2,1"/>

        {/* Equator & Tropics subtle lines */}
        <line x1="0" y1="52" x2="200" y2="52" stroke="#0a2030" strokeWidth="0.4" strokeDasharray="3,3"/>
        <text x="2" y="51" fontSize="2.2" fill="#0a2535">EQ</text>

        {/* Connection lines from live bank to others */}
        {BANKS.filter(b=>b.id!==live).map(b=>(
          <line key={`cl${b.id}`} x1={BANKS[live].x*2} y1={BANKS[live].y} x2={b.x*2} y2={b.y}
            stroke="#00e5a010" strokeWidth="0.3" strokeDasharray="1,3"/>
        ))}

        {/* Bank dots */}
        {BANKS.map(b=>{
          const isLive=b.id===live,isHov=b.id===hov
          const rc=REGION_COLORS[b.region]||'#1e3a5f'
          const bx=b.x*2,by=b.y
          return(
            <g key={b.id} onClick={()=>onSelectBank?.(b.id)}
              onMouseEnter={()=>setHov(b.id)} onMouseLeave={()=>setHov(null)}
              style={{cursor:'pointer'}}>
              {isLive&&<>
                <circle cx={bx} cy={by} r="5" fill={`${rc}15`}><animate attributeName="r" values="3;7;3" dur="2s" repeatCount="indefinite"/></circle>
                <circle cx={bx} cy={by} r="3" fill={`${rc}25`}><animate attributeName="r" values="2;4.5;2" dur="2s" begin="0.4s" repeatCount="indefinite"/></circle>
              </>}
              <circle cx={bx} cy={by} r={isLive?2.2:isHov?1.8:1.2}
                fill={isLive?rc:isHov?'#00e5a0':'#1e4a6a'}
                stroke={isLive?'rgba(255,255,255,0.8)':isHov?'#6ee7b7':'#2a5a7a'} strokeWidth="0.4"/>
              {/* Bank icon — small rectangle */}
              {(isHov||isLive)&&<>
                <rect x={bx-2.5} y={by-6.5} width="5" height="4" rx="0.5"
                  fill="none" stroke={isLive?rc:'#00e5a0'} strokeWidth="0.4"/>
                <line x1={bx-2} y1={by-3} x2={bx+2} y2={by-3} stroke={isLive?rc:'#00e5a0'} strokeWidth="0.3"/>
              </>}
              {(isHov||isLive)&&<text x={bx} y={by+5} textAnchor="middle" fontSize="2.6" fill={isLive?rc:'#00e5a0'} fontWeight="bold">{b.city}</text>}
              {isHov&&<text x={bx} y={by+8.5} textAnchor="middle" fontSize="2.0" fill="#2a5a7a">{b.vault}</text>}
              {isLive&&<text x={bx} y={by+8.5} textAnchor="middle" fontSize="2.2" fill={rc}>⏱ {fmtTime(hourCd)}</text>}
            </g>
          )
        })}
        {/* Legend */}
        <text x="2" y="100" fontSize="2.2" fill="#1e3a5f">◉ LIVE  ● SCHEDULED  — VAULT CONNECTION</text>
      </svg>
    </div>
  )
}

// ─── Device Skeleton (wraps mint panel) ──────────────────────────────────────
function DeviceSkeleton({children,title}:{children:React.ReactNode;title:string}){
  return(
    <div style={{background:'linear-gradient(180deg,#0d1a2e,#060e1a)',border:'2px solid #1e3a5f',borderRadius:16,overflow:'hidden',boxShadow:'0 8px 32px rgba(0,0,0,0.6)'}}>
      {/* Device top bar */}
      <div style={{background:'linear-gradient(90deg,#0a1628,#0d1f3a)',padding:'7px 10px',borderBottom:'1px solid #0d1f3a',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <div style={{width:14,height:14,background:'linear-gradient(135deg,#00e5a0,#00b8ff)',clipPath:'polygon(50% 0%,100% 50%,50% 100%,0% 50%)'}}/>
          <span style={{fontFamily:'DM Mono,monospace',fontSize:9,fontWeight:700,color:'#00e5a0',letterSpacing:'0.1em'}}>{title}</span>
        </div>
        <div style={{display:'flex',gap:4}}>
          {['#ef4444','#f97316','#22c55e'].map((c,i)=><div key={i} style={{width:7,height:7,borderRadius:'50%',background:c,boxShadow:`0 0 5px ${c}`}}/>)}
        </div>
      </div>
      {/* LED strip top */}
      <div style={{background:'#0a1628',height:5,display:'flex',gap:3,alignItems:'center',padding:'0 8px',borderBottom:'1px solid #060e1a'}}>
        {Array.from({length:18},(_,i)=><div key={i} style={{width:4,height:3,borderRadius:1,background:i%5===0?'#00e5a020':'#0a1a2a'}}/>)}
      </div>
      {/* Content */}
      <div style={{padding:'12px 10px 10px'}}>{children}</div>
      {/* LED strip bottom */}
      <div style={{background:'#0a1628',height:5,display:'flex',gap:3,alignItems:'center',padding:'0 8px',borderTop:'1px solid #060e1a'}}>
        {Array.from({length:18},(_,i)=><div key={i} style={{width:4,height:3,borderRadius:1,background:i%4===0?'#00e5a015':'#0a1a2a'}}/>)}
      </div>
      {/* Device bottom bar */}
      <div style={{background:'#080f1c',padding:'6px 10px',display:'flex',justifyContent:'space-between',alignItems:'center',borderTop:'1px solid #0d1f3a'}}>
        <div style={{display:'flex',gap:3}}>
          {[0,1,2].map(i=><div key={i} style={{width:8,height:6,borderRadius:1,background:'#0a1628',border:'1px solid #1e3a5f'}}/>)}
        </div>
        <div style={{fontFamily:'DM Mono,monospace',fontSize:6,color:'#1e3a5f',letterSpacing:'0.1em'}}>NFT HACKING DEVICE</div>
        <div style={{display:'flex',gap:3}}>
          {[0,1].map(i=><div key={i} style={{width:10,height:10,borderRadius:'50%',background:'radial-gradient(circle at 35% 30%,#1a2a3a,#050d17)',border:'1px solid #1e3a5f'}}/>)}
        </div>
      </div>
    </div>
  )
}

// ─── Demo Panel (inside DeviceSkeleton) ──────────────────────────────────────
function DemoPanel(){
  const[step,setStep]=useState(0)
  const[demoNum,setDemoNum]=useState<number|null>(null)
  const[localDev,setLocalDev]=useState(()=>{const d=generateDevice(999);d.active=true;return d})
  const[demoWinStates,setDemoWinStates]=useState<Record<WinType,WinState>>(defaultWinStates)
  const[msgs,setMsgs]=useState<string[]>(['▶ Demo starting...'])
  const[called,setCalled]=useState<number[]>([])
  const[running,setRunning]=useState(false)

  const startDemo=()=>{
    setStep(0);setDemoNum(null)
    setLocalDev(()=>{const d=generateDevice(999);d.active=true;return d})
    setDemoWinStates(defaultWinStates())
    setMsgs(['▶ Demo started — watching live hack...'])
    setCalled([]);setRunning(true)
  }

  useEffect(()=>{
    if(!running)return
    // Build a sequence that guarantees hitting each win: use fixed numbers that match the device grid
    // We'll just auto-draw random numbers slowly until wins trigger
    const iv=setInterval(()=>{
      setStep(s=>{
        if(s>=50){setRunning(false);clearInterval(iv);return s}
        const nextStep=s+1
        setLocalDev(prev=>{
          const allNums=prev.grid.flat().filter(c=>c.num).map(c=>c.num as number)
          // First 15 draws: use ticket numbers; after: random
          const pool=nextStep<=allNums.length?allNums:Array.from({length:90},(_,i)=>i+1)
          const notCalled=pool.filter(n=>!called.includes(n))
          if(!notCalled.length){setRunning(false);clearInterval(iv);return prev}
          const num=notCalled[Math.floor(Math.random()*notCalled.length)]
          setDemoNum(num);setCalled(c=>[...c,num])
          const nd={...prev,grid:prev.grid.map(row=>row.map(c=>c.num===num?{...c,matched:true,clicked:true}:c))}
          const flat=nd.grid.flat()
          const nc=flat.filter(c=>c.clicked).length
          setDemoWinStates(ws=>{
            const nw={...ws}
            if(nc>=5&&!nw.EARLY_FIVE.claimable){nw.EARLY_FIVE={...nw.EARLY_FIVE,claimable:true};setMsgs(m=>[...m,'⚡ EARLY FIVE READY!'])}
            if(nd.grid[0].filter(c=>c.num).every(c=>c.clicked)&&!nw.TOP_LINE.claimable){nw.TOP_LINE={...nw.TOP_LINE,claimable:true};setMsgs(m=>[...m,'🔵 TOP LINE READY!'])}
            if(nd.grid[1].filter(c=>c.num).every(c=>c.clicked)&&!nw.MIDDLE_LINE.claimable){nw.MIDDLE_LINE={...nw.MIDDLE_LINE,claimable:true};setMsgs(m=>[...m,'🟢 MIDDLE LINE READY!'])}
            if(nd.grid[2].filter(c=>c.num).every(c=>c.clicked)&&!nw.BOTTOM_LINE.claimable){nw.BOTTOM_LINE={...nw.BOTTOM_LINE,claimable:true};setMsgs(m=>[...m,'🟡 BOTTOM LINE READY!'])}
            if(flat.filter(c=>c.num).every(c=>c.clicked)){
              if(!nw.FULL_HOUSE_1.claimable){
                nw.FULL_HOUSE_1={...nw.FULL_HOUSE_1,claimable:true,claimed:false}
                setMsgs(m=>[...m,'🔥 FULL HOUSE! ALL 15 MATCHED!'])
              }
              // Simulate claim → flicker
              setTimeout(()=>{
                setDemoWinStates(wss=>({...wss,FULL_HOUSE_1:{...wss.FULL_HOUSE_1,claimed:true,flickering:true}}))
                setMsgs(m=>[...m,'✅ RANSOM CLAIMED! Others flickering...'])
                setTimeout(()=>{
                  setDemoWinStates(wss=>({...wss,FULL_HOUSE_1:{...wss.FULL_HOUSE_1,flickering:false,broken:true}}))
                  setMsgs(m=>[...m,'💀 LED BROKEN — win no longer claimable'])
                  setRunning(false)
                },3000)
              },1200)
            }
            return nw
          })
          return nd
        })
        return nextStep
      })
    },700)
    return()=>clearInterval(iv)
  },[running])

  const LED_TYPES:WinType[]=['EARLY_FIVE','TOP_LINE','MIDDLE_LINE','BOTTOM_LINE','FULL_HOUSE_1']

  return(
    <div>
      {/* Mini ticket */}
      <div style={{background:'#020a14',border:'1px solid #0d2035',borderRadius:6,overflow:'hidden',marginBottom:8}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(9,1fr)',borderBottom:'1px solid #0d2035'}}>
          {COL_HEADERS.map((h,i)=><div key={i} style={{padding:'1px 0',textAlign:'center',fontFamily:'DM Mono,monospace',fontSize:5,color:'#1e3a5f',borderRight:i<8?'1px solid #0d2035':'none',background:'#030a12'}}>{h}</div>)}
        </div>
        {localDev.grid.map((row,ri)=>(
          <div key={ri} style={{display:'grid',gridTemplateColumns:'repeat(9,1fr)',borderBottom:ri<2?'1px solid #0d2035':'none'}}>
            {row.map((cell,ci)=>(
              <div key={ci} style={{height:18,display:'flex',alignItems:'center',justifyContent:'center',borderRight:ci<8?'1px solid #0d2035':'none',
                background:cell.clicked?'rgba(255,255,255,0.1)':'transparent',
                fontFamily:'DM Mono,monospace',fontSize:8,fontWeight:700,
                color:!cell.num?'transparent':'#fff',
                textShadow:cell.clicked?'0 0 6px #fff,0 0 12px rgba(255,255,255,0.8)':'0 0 2px rgba(255,255,255,0.3)',
                opacity:!cell.num?0:cell.clicked?1:0.4,
                transition:'all 0.3s'}}>{cell.num??''}</div>
            ))}
          </div>
        ))}
      </div>

      {/* Current broadcast number + LEDs */}
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
        <div style={{background:'#030a12',border:'1px solid #0d2035',borderRadius:6,padding:'4px 10px',textAlign:'center',minWidth:50}}>
          <div style={{fontFamily:'DM Mono,monospace',fontSize:6,color:'#1e4a6a'}}>BROADCAST</div>
          <div style={{fontFamily:'Syne,sans-serif',fontSize:28,fontWeight:800,color:'#fff',lineHeight:1,
            textShadow:'0 0 12px #fff,0 0 24px rgba(255,255,255,0.6)'}}>{demoNum??'—'}</div>
        </div>
        <div style={{flex:1}}>
          <div style={{fontFamily:'DM Mono,monospace',fontSize:6.5,color:'#1e4a6a',marginBottom:4}}>WIN STATUS</div>
          {LED_TYPES.map((type,i)=>{
            const ws=demoWinStates[type]
            const color=LED_COLORS[type]
            return(
              <div key={type} style={{display:'flex',alignItems:'center',gap:5,marginBottom:3}}>
                <div style={{
                  width:8,height:6,borderRadius:1,flexShrink:0,
                  background:ws.broken?'transparent':ws.claimed||ws.claimable?color:'#0a1628',
                  border:`1px solid ${ws.broken?color+'40':ws.claimed||ws.claimable?color:'#162438'}`,
                  boxShadow:ws.broken?'none':ws.claimable||ws.claimed?`0 0 5px ${color}`:'none',
                  animation:ws.broken?'none':ws.flickering?'rapidFlicker 0.08s infinite':ws.claimable&&!ws.claimed?'ledBlink 0.5s infinite':'none',
                  position:'relative',overflow:'hidden'
                }}>
                  {ws.broken&&<div style={{position:'absolute',inset:0,background:`radial-gradient(circle,${color}50 20%,transparent 70%)`,animation:'filamentGlow 2s infinite'}}/>}
                </div>
                <div style={{fontFamily:'DM Mono,monospace',fontSize:6,color:ws.claimed?'#22c55e':ws.claimable?color:'#1e4a6a',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {WIN_LABELS[type]}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Messages */}
      <div style={{background:'#030a12',border:'1px solid #0d2035',borderRadius:5,padding:'5px 8px',maxHeight:60,overflowY:'auto',marginBottom:8}}>
        {msgs.slice(-5).map((m,i)=>(
          <div key={i} style={{fontFamily:'DM Mono,monospace',fontSize:6.5,color:'#00e5a0',marginBottom:1}}>{m}</div>
        ))}
      </div>

      <button onClick={startDemo} style={{width:'100%',background:running?'#0a1628':'linear-gradient(135deg,#00e5a0,#00b8ff)',color:running?'#2a5a7a':'#000',border:running?'1px solid #1e3a5f':'none',borderRadius:8,padding:'10px',fontFamily:'DM Mono,monospace',fontSize:10,fontWeight:700,cursor:running?'default':'pointer'}}>
        {running?'⏳ DEMO RUNNING...':'▶ RUN DEMO HACK'}
      </button>
    </div>
  )
}

// ─── Rules Panel ─────────────────────────────────────────────────────────────
function RulesPanel(){
  return(
    <div style={{background:'#030a12',border:'1px solid #0d2035',borderRadius:8,padding:'10px 12px'}}>
      <div style={{fontFamily:'DM Mono,monospace',fontSize:8,color:'#00e5a0',marginBottom:8,letterSpacing:'0.1em'}}>◉ HOW TO PLAY — RANSOME RULES</div>
      {[
        ['1','MINT','Buy NFT hacking devices (1 token each). Each device is a unique 3×9 housie ticket.'],
        ['2','ACTIVATE','Connect your devices to the live bank. Only active devices participate.'],
        ['3','HACK','Numbers are broadcast every 60-90s. Click matching numbers on your ticket during the open window.'],
        ['4','WIN','Hit 5 numbers for Early Five, complete a row for Line wins, all 15 for Full House.'],
        ['5','RANSOM','Press RANSOM when your win is ready. Multiple claimers in the same round split the prize equally.'],
        ['6','FLICKER','After a win is claimed, all other devices see rapid LED flicker for 60s, then a broken LED — win is gone.'],
        ['7','BANK HACK','When all 90 numbers are drawn, unclaimed winnings go to the treasury wallet. Game resets.'],
      ].map(([n,title,desc])=>(
        <div key={n} style={{display:'flex',gap:8,marginBottom:7,alignItems:'flex-start'}}>
          <div style={{width:16,height:16,borderRadius:'50%',background:'#0a1628',border:'1px solid #00e5a040',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:1}}>
            <span style={{fontFamily:'DM Mono,monospace',fontSize:7,color:'#00e5a0',fontWeight:700}}>{n}</span>
          </div>
          <div>
            <div style={{fontFamily:'DM Mono,monospace',fontSize:8,color:'#4a7fa5',fontWeight:700,marginBottom:1}}>{title}</div>
            <div style={{fontFamily:'DM Mono,monospace',fontSize:7,color:'#2a5a7a',lineHeight:1.5}}>{desc}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Mint Panel (inside device skeleton) ─────────────────────────────────────
function MintPanel({wallet,devices,mintCount,mintToken,setMintCount,setMintToken,onMint,onEnterGame,onConnectWallet}:{
  wallet:string|null;devices:Device[];mintCount:number;mintToken:string;
  setMintCount:(n:number)=>void;setMintToken:(t:string)=>void;
  onMint:()=>void;onEnterGame:()=>void;onConnectWallet:()=>void
}){
  const[tab,setTab]=useState<'mint'|'demo'|'rules'>('mint')
  const btnBase:React.CSSProperties={fontFamily:'DM Mono,monospace',fontSize:11,cursor:'pointer',borderRadius:8,padding:'8px 14px',fontWeight:600,border:'none'}
  return(
    <div>
      {/* Tab bar */}
      <div style={{display:'flex',gap:4,marginBottom:10}}>
        {([['mint','◈ MINT'],['demo','▶ DEMO'],['rules','ⓘ RULES']] as const).map(([k,label])=>(
          <button key={k} onClick={()=>setTab(k)} style={{...btnBase,flex:1,padding:'9px 6px',fontSize:9,
            background:tab===k?'#0a2a4a':'transparent',
            color:tab===k?'#00e5a0':'#2a5a7a',
            border:`1px solid ${tab===k?'#00e5a040':'#0a2535'}`}}>
            {label}
          </button>
        ))}
      </div>

      {tab==='demo'&&<DemoPanel/>}
      {tab==='rules'&&<RulesPanel/>}

      {tab==='mint'&&(
        <div>
          {!wallet?(
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:14,padding:'20px 0'}}>
              <div style={{fontFamily:'DM Mono,monospace',fontSize:8,color:'#1e4a6a',textAlign:'center',lineHeight:1.7}}>Connect your wallet to mint<br/>NFT hacking devices</div>
              <button onClick={onConnectWallet} style={{...btnBase,background:'linear-gradient(135deg,#00e5a0,#00b8ff)',color:'#000',padding:'14px 28px',fontSize:12,fontWeight:700,borderRadius:10,boxShadow:'0 4px 20px rgba(0,229,160,0.3)'}}>CONNECT WALLET →</button>
            </div>
          ):(
            <>
              <div style={{fontFamily:'DM Mono,monospace',fontSize:8,color:'#2a5a7a',marginBottom:6}}>SELECT TOKEN</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:6,marginBottom:12}}>
                {['USDT','USDC','SOL','RNSM'].map(t=>(
                  <button key={t} onClick={()=>setMintToken(t)} style={{...btnBase,padding:'10px 6px',fontSize:10,
                    background:mintToken===t?'#0a3a5a':'transparent',
                    color:mintToken===t?'#00e5a0':'#2a5a7a',
                    border:`1px solid ${mintToken===t?'#00e5a040':'#0a2535'}`}}>{t}</button>
                ))}
              </div>
              <div style={{fontFamily:'DM Mono,monospace',fontSize:8,color:'#2a5a7a',marginBottom:6}}>QUANTITY</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:6,marginBottom:8}}>
                {[1,3,5,10].map(n=>(
                  <button key={n} onClick={()=>setMintCount(n)} style={{...btnBase,padding:'10px 6px',fontSize:12,
                    background:mintCount===n?'#0a3a5a':'transparent',
                    color:mintCount===n?'#00e5a0':'#2a5a7a',
                    border:`1px solid ${mintCount===n?'#00e5a040':'#0a2535'}`}}>{n}</button>
                ))}
              </div>
              <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:12}}>
                <input type="number" value={mintCount} onChange={e=>setMintCount(Math.max(1,parseInt(e.target.value)||1))}
                  style={{flex:1,background:'#0a1628',border:'1px solid #0a2535',borderRadius:8,padding:'10px 12px',fontFamily:'DM Mono,monospace',fontSize:12,color:'#00e5a0',outline:'none'}}/>
                <button onClick={onMint} style={{...btnBase,background:'linear-gradient(135deg,#00e5a0,#00b8ff)',color:'#000',padding:'12px 20px',fontSize:12,fontWeight:700,borderRadius:10,boxShadow:'0 0 16px rgba(0,229,160,0.3)',whiteSpace:'nowrap'}}>MINT →</button>
              </div>
              {devices.length>0&&(
                <div style={{background:'rgba(0,229,160,0.04)',border:'1px solid rgba(0,229,160,0.12)',borderRadius:8,padding:'8px 10px',marginBottom:12}}>
                  <div style={{fontFamily:'DM Mono,monospace',fontSize:8,color:'#00e5a0',marginBottom:4}}>YOUR DEVICES ({devices.length})</div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                    {devices.slice(0,6).map(d=>(
                      <div key={d.id} style={{fontFamily:'DM Mono,monospace',fontSize:7,color:d.active?'#22c55e':'#1e4a6a',background:'#0a1628',border:`1px solid ${d.active?'#22c55e30':'#0a2535'}`,borderRadius:4,padding:'2px 6px'}}>{d.nftId}</div>
                    ))}
                    {devices.length>6&&<div style={{fontFamily:'DM Mono,monospace',fontSize:7,color:'#1e4a6a'}}>+{devices.length-6}</div>}
                  </div>
                </div>
              )}
              {/* Initiate hack button inside mint panel */}
              {devices.length>0&&(
                <button onClick={onEnterGame} style={{...btnBase,width:'100%',background:'linear-gradient(135deg,#ef4444,#dc2626)',color:'#fff',padding:'14px',fontSize:13,fontWeight:800,borderRadius:10,boxShadow:'0 4px 24px rgba(239,68,68,0.4)',letterSpacing:'0.05em'}}>
                  🔴 INITIATE HACK — {devices.length} DEVICE{devices.length>1?'S':''} READY
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── LED with progress bar ────────────────────────────────────────────────────
function LedProgress({type,ws,devices}:{type:WinType;ws:WinState;devices:Device[]}){
  const color=LED_COLORS[type]
  let prog=0
  devices.filter(d=>d.active).forEach(d=>{
    const flat=d.grid.flat(),nc=flat.filter(c=>c.clicked).length
    let p=0
    if(type==='EARLY_FIVE')p=Math.min(nc/5,1)
    else if(type==='TOP_LINE')p=d.grid[0].filter(c=>c.num&&c.clicked).length/Math.max(d.grid[0].filter(c=>c.num).length,1)
    else if(type==='MIDDLE_LINE')p=d.grid[1].filter(c=>c.num&&c.clicked).length/Math.max(d.grid[1].filter(c=>c.num).length,1)
    else if(type==='BOTTOM_LINE')p=d.grid[2].filter(c=>c.num&&c.clicked).length/Math.max(d.grid[2].filter(c=>c.num).length,1)
    else p=Math.min(nc/15,1)
    if(p>prog)prog=p
  })
  return(
    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}>
      <div style={{
        width:10,height:8,borderRadius:2,flexShrink:0,position:'relative',overflow:'hidden',
        background:ws.broken?'transparent':ws.claimed||ws.claimable?color:'#0a1628',
        border:`1px solid ${ws.broken?color+'30':ws.claimed||ws.claimable?color:'#162438'}`,
        boxShadow:ws.broken?'none':ws.claimable||ws.claimed?`0 0 5px ${color},0 0 10px ${color}60`:'none',
        animation:ws.broken?'none':ws.flickering?'rapidFlicker 0.08s infinite':ws.claimable&&!ws.claimed?'ledBlink 0.5s infinite':'none',
      }}>
        {ws.broken&&<div style={{position:'absolute',inset:0,background:`radial-gradient(circle,${color}50 20%,transparent 70%)`,animation:'filamentGlow 2s infinite'}}/>}
      </div>
      <div style={{flex:1}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:2}}>
          <span style={{fontFamily:'DM Mono,monospace',fontSize:7,color:ws.claimed?'#22c55e':ws.claimable?color:ws.broken?color+'60':'#2a5a7a',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:100}}>{WIN_LABELS[type]}</span>
          <span style={{fontFamily:'DM Mono,monospace',fontSize:6,color:'#1e4a6a'}}>{Math.round(prog*100)}%</span>
        </div>
        <div style={{height:3,background:'#0a1628',borderRadius:2,overflow:'hidden'}}>
          <div style={{height:'100%',width:`${prog*100}%`,background:prog>=1?color:`linear-gradient(90deg,${color}60,${color})`,borderRadius:2,boxShadow:prog>=1?`0 0 5px ${color}`:'none',transition:'width 0.4s ease'}}/>
        </div>
      </div>
    </div>
  )
}

// ─── Hacking Device ───────────────────────────────────────────────────────────
function HackingDevice({device,currentNum,clickWindowOpen,calledNums,onCellClick,onClaim,onActivate,winStates,bankruptCount,timer,totalTimer,liveBank}:{
  device:Device;currentNum:number|null;clickWindowOpen:boolean;calledNums:Set<number>;
  onCellClick:(id:number,r:number,c:number)=>void;onClaim:(id:number,w:WinType)=>void;
  onActivate:(id:number)=>void;winStates:Record<WinType,WinState>;bankruptCount:number;
  timer:number;totalTimer:number;liveBank:number
}){
  const flat=device.grid.flat()
  const nc=flat.filter(c=>c.clicked).length
  const r0=device.grid[0].filter(c=>c.num).every(c=>c.clicked)
  const r1=device.grid[1].filter(c=>c.num).every(c=>c.clicked)
  const r2=device.grid[2].filter(c=>c.num).every(c=>c.clicked)
  const all=flat.filter(c=>c.num).every(c=>c.clicked)
  const fhk=`FULL_HOUSE_${Math.min(bankruptCount+1,3)}` as WinType
  const canClaim=(
    (nc>=5&&!device.claimed.has('EARLY_FIVE')&&winStates.EARLY_FIVE.claimable&&!winStates.EARLY_FIVE.claimed)||
    (r0&&!device.claimed.has('TOP_LINE')&&winStates.TOP_LINE.claimable&&!winStates.TOP_LINE.claimed)||
    (r1&&!device.claimed.has('MIDDLE_LINE')&&winStates.MIDDLE_LINE.claimable&&!winStates.MIDDLE_LINE.claimed)||
    (r2&&!device.claimed.has('BOTTOM_LINE')&&winStates.BOTTOM_LINE.claimable&&!winStates.BOTTOM_LINE.claimed)||
    (all&&winStates[fhk]?.claimable&&!winStates[fhk]?.claimed&&!device.claimed.has(fhk))
  )
  const doClaim=()=>{
    if(nc>=5&&!device.claimed.has('EARLY_FIVE')&&winStates.EARLY_FIVE.claimable&&!winStates.EARLY_FIVE.claimed){onClaim(device.id,'EARLY_FIVE');return}
    if(r0&&!device.claimed.has('TOP_LINE')&&winStates.TOP_LINE.claimable&&!winStates.TOP_LINE.claimed){onClaim(device.id,'TOP_LINE');return}
    if(r1&&!device.claimed.has('MIDDLE_LINE')&&winStates.MIDDLE_LINE.claimable&&!winStates.MIDDLE_LINE.claimed){onClaim(device.id,'MIDDLE_LINE');return}
    if(r2&&!device.claimed.has('BOTTOM_LINE')&&winStates.BOTTOM_LINE.claimable&&!winStates.BOTTOM_LINE.claimed){onClaim(device.id,'BOTTOM_LINE');return}
    if(all&&winStates[fhk]?.claimable)onClaim(device.id,fhk)
  }
  const LED_TYPES:WinType[]=['EARLY_FIVE','TOP_LINE','MIDDLE_LINE','BOTTOM_LINE','FULL_HOUSE_1','FULL_HOUSE_2','FULL_HOUSE_3']
  // Proximity glow: compute best % toward each win condition for this device
  const ef5p=Math.min(nc/5,1)
  const t0p=device.grid[0].filter(c=>c.num&&c.clicked).length/Math.max(device.grid[0].filter(c=>c.num).length,1)
  const m1p=device.grid[1].filter(c=>c.num&&c.clicked).length/Math.max(device.grid[1].filter(c=>c.num).length,1)
  const b2p=device.grid[2].filter(c=>c.num&&c.clicked).length/Math.max(device.grid[2].filter(c=>c.num).length,1)
  const fhp=Math.min(nc/15,1)
  const bestPct=Math.max(ef5p,t0p,m1p,b2p,fhp)
  // Glow intensity proportional to proximity; pulses when >80%
  const glowR=Math.round(bestPct*255),glowG=Math.round((1-bestPct)*120)
  const proxColor=canClaim?'#ec4899':`rgb(${glowR},${glowG},${Math.round(40+bestPct*60)})`
  const proxGlow=bestPct>0.4?`0 0 ${Math.round(bestPct*18)}px ${proxColor}40,0 0 ${Math.round(bestPct*8)}px ${proxColor}20`:'none'
  return(
    <div style={{background:'linear-gradient(180deg,#0d1a2e,#060e1a)',border:`2px solid ${canClaim?'#ec4899':bestPct>0.5?proxColor:device.active?'#00e5a030':'#162438'}`,borderRadius:14,padding:0,
      boxShadow:canClaim?`0 0 0 2px rgba(236,72,153,0.3),0 6px 24px rgba(236,72,153,0.15)`:bestPct>0.4?proxGlow:device.active?'0 0 10px rgba(0,229,160,0.06)':'none',
      display:'flex',flexDirection:'column',overflow:'hidden',userSelect:'none'}}>
      {/* Header */}
      <div style={{background:'linear-gradient(90deg,#0a1628,#0d1f3a)',padding:'4px 7px',borderBottom:'1px solid #0d1f3a',display:'flex',justifyContent:'space-between',alignItems:'center',gap:4}}>
        <div style={{display:'flex',alignItems:'center',gap:4}}>
          <div style={{width:11,height:11,background:'linear-gradient(135deg,#00e5a0,#00b8ff)',clipPath:'polygon(50% 0%,100% 50%,50% 100%,0% 50%)',flexShrink:0}}/>
          <div style={{display:'flex',flexDirection:'column'}}>
            <span style={{fontFamily:'DM Mono,monospace',fontSize:7,fontWeight:700,color:'#00e5a0'}}>{device.nftId}</span>
            {device.walletAddr&&<span style={{fontFamily:'DM Mono,monospace',fontSize:5,color:'#0a2535',letterSpacing:'0.03em'}}>⛓ {device.walletAddr.slice(0,10)}…</span>}
          </div>
        </div>
        <div style={{flex:1,height:14,background:'rgba(0,229,160,0.03)',border:'1px dashed #0a2535',borderRadius:3,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 3px'}}>
          <span style={{fontFamily:'DM Mono,monospace',fontSize:5,color:'#0a2535'}}>AD</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:3}}>
          <span style={{fontFamily:'DM Mono,monospace',fontSize:6,color:'#1e4a6a'}}>{nc}/15</span>
          <div style={{width:5,height:5,borderRadius:'50%',background:device.active?'#22c55e':'#1e3a5f',animation:device.active?'dot 1.5s infinite':'none'}}/>
        </div>
      </div>
      {/* Mini bank / activate */}
      {device.active?(
        <div style={{background:'#030a12',margin:'3px 5px 0',borderRadius:5,border:'1px solid #0d2035',padding:'2px 5px',display:'flex',alignItems:'center',gap:4,position:'relative',overflow:'hidden'}}>
          <div style={{position:'absolute',inset:0,backgroundImage:'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.08) 2px,rgba(0,0,0,0.08) 4px)',pointerEvents:'none'}}/>
          <span style={{fontFamily:'DM Mono,monospace',fontSize:5,color:'#1e4a6a',zIndex:1}}>BANK</span>
          <span style={{fontFamily:'Syne,sans-serif',fontSize:16,fontWeight:800,color:'#fff',lineHeight:1,zIndex:1,textShadow:currentNum?'0 0 8px #fff':'none'}}>{currentNum??'—'}</span>
          <div style={{display:'flex',flexDirection:'column',gap:1,zIndex:1}}>
            <div style={{display:'flex',alignItems:'center',gap:2}}>
              <div style={{width:3,height:3,borderRadius:'50%',background:clickWindowOpen?'#22c55e':'#ef4444',animation:clickWindowOpen?'dot 1s infinite':'none'}}/>
              <span style={{fontFamily:'DM Mono,monospace',fontSize:5,color:clickWindowOpen?'#22c55e':'#ef4444'}}>{clickWindowOpen?'OPEN':'CLOSED'}</span>
            </div>
            <span style={{fontFamily:'DM Mono,monospace',fontSize:5,color:'#1e4a6a'}}>{BANKS[liveBank]?.name?.split(' ')[0]??''}</span>
          </div>
          <div style={{marginLeft:'auto',display:'flex',gap:2,zIndex:1}}>
            {Array.from(calledNums).slice(-3).reverse().map((n,i)=>(
              <div key={i} style={{width:12,height:12,borderRadius:2,display:'flex',alignItems:'center',justifyContent:'center',background:'#0a1628',border:'1px solid #1e3a5f',fontFamily:'DM Mono,monospace',fontSize:6,color:'#2a5a7a',opacity:1-i*0.25}}>{n}</div>
            ))}
          </div>
        </div>
      ):(
        <div style={{margin:'3px 5px 0',background:'#030a12',border:'1px solid #0d2035',borderRadius:5,padding:'4px 7px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:4}}>
          <span style={{fontFamily:'DM Mono,monospace',fontSize:6,color:'#1e4a6a'}}>Disconnected</span>
          <button onClick={()=>onActivate(device.id)} style={{background:'linear-gradient(135deg,#00e5a0,#00b8ff)',color:'#000',border:'none',borderRadius:4,padding:'3px 7px',fontFamily:'DM Mono,monospace',fontSize:7,fontWeight:700,cursor:'pointer'}}>ACTIVATE ⚡</button>
        </div>
      )}
      {/* Grid */}
      <div style={{margin:'3px 5px 0',background:'#020a14',border:'1px solid #0d2035',borderRadius:4,overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(9,1fr)',borderBottom:'1px solid #0d2035'}}>
          {COL_HEADERS.map((h,i)=><div key={i} style={{padding:'1px 0',textAlign:'center',fontFamily:'DM Mono,monospace',fontSize:4.5,color:'#1e3a5f',borderRight:i<8?'1px solid #0d2035':'none',background:'#030a12'}}>{h}</div>)}
        </div>
        {device.grid.map((row,ri)=>(
          <div key={ri} style={{display:'grid',gridTemplateColumns:'repeat(9,1fr)',borderBottom:ri<2?'1px solid #0d2035':'none'}}>
            {row.map((cell,ci)=>{
              const isMissed=cell.matched&&!cell.clicked&&cell.missed
              const isCur=cell.num!==null&&cell.num===currentNum
              const isClick=isCur&&clickWindowOpen&&!cell.clicked&&device.active
              const isEmpty=cell.num===null
              const glitch=`gx${(ri*9+ci)%3} ${2+((ri*9+ci)%2)}s ${(ri*9+ci)*0.08}s infinite`
              return(
                <button key={ci} onClick={()=>isClick&&onCellClick(device.id,ri,ci)} style={{
                  height:20,padding:0,cursor:isClick?'pointer':'default',border:'none',
                  borderRight:ci<8?'1px solid #0d2035':'none',
                  background:isEmpty?'#020a14':cell.clicked?'rgba(255,255,255,0.08)':isClick?'rgba(255,255,255,0.05)':'transparent',
                  boxShadow:isClick?'inset 0 0 0 1.5px rgba(255,255,255,0.9)':'none',
                  color:'#ffffff',fontFamily:'DM Mono,monospace',fontSize:9,fontWeight:700,
                  textShadow:isEmpty?'none':cell.clicked?'0 0 6px #fff,0 0 12px rgba(255,255,255,0.8)':isClick?'0 0 10px #fff':'0 0 2px rgba(255,255,255,0.35)',
                  opacity:isEmpty?0:cell.clicked?1:isClick?1:0.45,
                  animation:(!isEmpty&&!isClick&&!cell.clicked)?glitch:'none',
                  transition:'opacity 0.2s',
                }}>{cell.num??''}</button>
              )
            })}
          </div>
        ))}
      </div>
      {/* LED strip */}
      <div style={{display:'flex',justifyContent:'center',gap:3,padding:'3px 5px 1px',alignItems:'center'}}>
        <div style={{display:'flex',gap:2}}>{[0,1].map(i=><div key={i} style={{width:6,height:5,borderRadius:1,background:'#0a1628',border:'1px solid #162438'}}/>)}</div>
        {LED_TYPES.map((type,i)=>{
          const ws=winStates[type],won=device.claimed.has(type),lit=ws.claimable&&!ws.claimed
          // dead = win claimed by others and filament phase started — NOT during flicker window
          const dead=ws.claimed&&!won&&ws.broken
          // Compute this LED's individual proximity
          let ledPct=0
          if(type==='EARLY_FIVE')ledPct=ef5p
          else if(type==='TOP_LINE')ledPct=t0p
          else if(type==='MIDDLE_LINE')ledPct=m1p
          else if(type==='BOTTOM_LINE')ledPct=b2p
          else ledPct=fhp
          const proximityGlow=!ws.claimed&&!ws.broken&&!lit&&ledPct>0.3?`0 0 ${Math.round(ledPct*8)}px ${LED_COLORS[type]}${Math.round(ledPct*80).toString(16).padStart(2,'0')}`:'none'
          const dimOpacity=(!lit&&!won&&!ws.broken)?(0.1+ledPct*0.5):1
          return(
            <div key={type} title={WIN_LABELS[type]} style={{
              width:9,height:7,borderRadius:2,position:'relative',overflow:'hidden',
              background:ws.broken?'transparent':won&&ws.bursting?LED_COLORS[type]:(won||lit)?LED_COLORS[type]:dead?'#050d17':ledPct>0.3?`${LED_COLORS[type]}${Math.round(ledPct*60).toString(16).padStart(2,'0')}`:'#0a1628',
              border:`1px solid ${ws.broken?LED_COLORS[type]+'90':(won||lit)||ws.bursting?LED_COLORS[type]:ledPct>0.3?LED_COLORS[type]+'60':'#162438'}`,
              boxShadow:ws.broken?`0 0 8px ${LED_COLORS[type]},0 0 20px ${LED_COLORS[type]}80,0 0 40px ${LED_COLORS[type]}40`:won&&ws.bursting?`0 0 12px ${LED_COLORS[type]},0 0 30px ${LED_COLORS[type]}80`:(won||lit)&&!ws.broken?`0 0 4px ${LED_COLORS[type]},0 0 8px ${LED_COLORS[type]}60`:proximityGlow,
              opacity:dead?0.15:dimOpacity,
              animation:ws.broken?'filamentGlow 1.5s ease-in-out infinite':won&&ws.bursting?'ledBurst 0.4s ease-out forwards':ws.expired?'ledExpire 0.4s ease forwards':ws.flickering?'rapidFlicker 0.08s infinite':lit&&!won?`ledBlink 0.6s ${i*0.07}s infinite`:'none',
            }}>
              {ws.broken&&!type.startsWith('FULL_HOUSE')&&(
                <div style={{position:'absolute',inset:0,background:`radial-gradient(circle,${LED_COLORS[type]}ff 0%,${LED_COLORS[type]}99 30%,transparent 75%)`,animation:'filamentGlow 1.5s ease-in-out infinite'}}/>
              )}
              {ws.broken&&type==='FULL_HOUSE_1'&&<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'DM Mono,monospace',fontSize:6,fontWeight:700,color:LED_COLORS[type],textShadow:`0 0 4px ${LED_COLORS[type]}`}}>1</div>}
              {ws.broken&&type==='FULL_HOUSE_2'&&<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'DM Mono,monospace',fontSize:6,fontWeight:700,color:LED_COLORS[type],textShadow:`0 0 4px ${LED_COLORS[type]}`}}>2</div>}
              {ws.broken&&type==='FULL_HOUSE_3'&&<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'DM Mono,monospace',fontSize:6,fontWeight:700,color:LED_COLORS[type],textShadow:`0 0 4px ${LED_COLORS[type]}`}}>3</div>}
              {won&&ws.bursting&&<div style={{position:'absolute',inset:-8,borderRadius:'50%',background:`radial-gradient(circle,${LED_COLORS[type]}99 0%,transparent 70%)`,animation:'burstRing 0.5s ease-out forwards',pointerEvents:'none'}}/>}
            </div>
          )
        })}
        <div style={{display:'flex',gap:2}}>{[0,1,2].map(i=><div key={i} style={{width:6,height:5,borderRadius:1,background:'#0a1628',border:'1px solid #162438'}}/>)}</div>
      </div>
      {/* Bottom bar */}
      <div style={{display:'flex',gap:3,alignItems:'center',padding:'2px 5px 5px'}}>
        <div style={{display:'flex',flexDirection:'column',gap:2}}>
          <div style={{width:7,height:7,borderRadius:2,background:'#ef4444',boxShadow:'0 0 4px #ef4444'}}/>
          <div style={{width:7,height:7,borderRadius:2,background:'#f97316',boxShadow:'0 0 4px #f97316'}}/>
          <div style={{width:7,height:7,borderRadius:2,background:device.active?'#22c55e':'#0a1628',border:device.active?'none':'1px solid #162438'}}/>
        </div>
        <MiniStopwatch seconds={timer} total={totalTimer}/>
        <button onClick={doClaim} disabled={!canClaim} style={{
          flex:1,
          background:canClaim?'linear-gradient(180deg,#1a0000,#0d0000)':bestPct>0.5?`linear-gradient(180deg,rgba(${glowR},${glowG},20,0.15),rgba(${glowR},${glowG},20,0.05))`:'linear-gradient(180deg,#080f18,#040a10)',
          border:`2px solid ${canClaim?'#ff2020':bestPct>0.5?proxColor:'#162438'}`,borderRadius:7,
          padding:'8px 4px',cursor:canClaim?'pointer':'default',
          display:'flex',alignItems:'center',justifyContent:'center',
          animation:canClaim?'ransomPulse 1s infinite':bestPct>0.8?'ransomPulse 2s infinite':'none',
          boxShadow:canClaim?'inset 0 0 10px rgba(255,32,32,0.3),0 0 10px rgba(255,32,32,0.4)':bestPct>0.5?`inset 0 0 ${Math.round(bestPct*8)}px ${proxColor}30,0 0 ${Math.round(bestPct*10)}px ${proxColor}30`:'none',
          margin:'0 2px',
        }}>
          <span style={{fontFamily:'Syne,sans-serif',fontSize:11,fontWeight:800,letterSpacing:'0.1em',
            color:canClaim?'#ff4040':bestPct>0.6?proxColor:'#1e3a5f',
            textShadow:canClaim?'0 0 8px #ff2020,0 0 20px #ff202080':bestPct>0.6?`0 0 6px ${proxColor}`:'none'}}>RANSOM</span>
        </button>
        <div style={{display:'flex',flexDirection:'column',gap:3}}>
          {[0,1].map(i=><div key={i} style={{width:12,height:12,borderRadius:'50%',background:'radial-gradient(circle at 35% 30%,#2a4a6a,#050d17)',border:'1.5px solid #1e3a5f'}}/>)}
        </div>
      </div>
    </div>
  )
}

// ─── Vault SVG Sketch ────────────────────────────────────────────────────────
// ─── Vault SVG — proper bank vault with door, money stacks, fill level ────────
function VaultSketch({pct,paid}:{pct:number;paid:number}){
  const maxStack=7
  const stacks=Math.floor(pct*maxStack)
  const fillY=Math.max(78-Math.round(pct*52),26) // liquid rises from y=78 up to y=26
  return(
    <svg viewBox="0 0 120 110" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      {/* ── Vault room walls ── */}
      <rect x="6" y="18" width="108" height="80" rx="3" fill="#010c16" stroke="#0d2a40" strokeWidth="1.5"/>
      {/* Floor */}
      <line x1="6" y1="96" x2="114" y2="96" stroke="#0d2a40" strokeWidth="1"/>

      {/* ── Money fill liquid ── */}
      <clipPath id="roomClip"><rect x="7" y="19" width="106" height="76" rx="2"/></clipPath>
      <rect x="7" y={fillY} width="106" height={98-fillY} fill="rgba(0,229,160,0.07)" clipPath="url(#roomClip)" style={{transition:'all 1.4s cubic-bezier(.4,0,.2,1)'}}/>
      {pct>0&&<ellipse cx="60" cy={fillY} rx="53" ry="2.5" fill="rgba(0,229,160,0.25)" style={{transition:'cy 1.4s cubic-bezier(.4,0,.2,1)'}}/>}

      {/* ── Money stacks on floor ── */}
      {Array.from({length:stacks},(_,i)=>{
        const sx=14+i*14, sy=88
        const col=i%3===0?'#22c55e':i%3===1?'#16a34a':'#15803d'
        return(
          <g key={i}>
            <rect x={sx} y={sy-10} width="10" height="10" rx="1" fill={col} opacity="0.85"/>
            <line x1={sx} y1={sy-7} x2={sx+10} y2={sy-7} stroke="#010c16" strokeWidth="0.7" opacity="0.6"/>
            <line x1={sx} y1={sy-4} x2={sx+10} y2={sy-4} stroke="#010c16" strokeWidth="0.7" opacity="0.6"/>
            <text x={sx+5} y={sy-2} textAnchor="middle" fontSize="3.5" fill="#010c16" fontWeight="bold">$</text>
          </g>
        )
      })}

      {/* ── Vault door frame ── */}
      <rect x="30" y="20" width="60" height="74" rx="4" fill="#071220" stroke="#1e4a6a" strokeWidth="2"/>
      {/* Door inner bevel */}
      <rect x="34" y="24" width="52" height="66" rx="3" fill="none" stroke="#0a2a45" strokeWidth="1"/>

      {/* ── Door fill (claimed portion = door cracking open) ── */}
      {pct>0&&(
        <rect x="30" y="20" width={Math.round(pct*60)} height="74" rx="4"
          fill="rgba(0,229,160,0.04)" style={{transition:'width 1.4s ease'}}/>
      )}

      {/* ── Locking bolts — 3 right side ── */}
      {[30,52,74].map((y,i)=>(
        <g key={i}>
          <rect x="82" y={y} width="10" height="8" rx="2" fill="#0a1e30" stroke="#1e4a6a" strokeWidth="1"/>
          <rect x="86" y={y+2} width="6" height="4" rx="1" fill={pct>0.3?'#00e5a060':'#071220'}
            style={{transition:'fill 0.5s ease'}}/>
        </g>
      ))}

      {/* ── Central dial ── */}
      <circle cx="60" cy="57" r="18" fill="#060f1c" stroke="#1e4a6a" strokeWidth="1.5"/>
      <circle cx="60" cy="57" r="13" fill="none" stroke="#0a2535" strokeWidth="1"/>
      {/* Dial notches */}
      {Array.from({length:12},(_,i)=>{
        const a=i*30*Math.PI/180, r1=13, r2=16
        return<line key={i} x1={60+r1*Math.sin(a)} y1={57-r1*Math.cos(a)} x2={60+r2*Math.sin(a)} y2={57-r2*Math.cos(a)} stroke="#1e4a6a" strokeWidth="0.8"/>
      })}
      {/* Dial pointer — rotates with pct */}
      <line x1="60" y1="57"
        x2={60+10*Math.sin(pct*6.28)} y2={57-10*Math.cos(pct*6.28)}
        stroke="#00e5a0" strokeWidth="1.5" strokeLinecap="round"
        style={{transition:'all 1.4s ease'}}/>
      <circle cx="60" cy="57" r="2.5" fill="#1e4a6a"/>
      {/* Center jewel */}
      <circle cx="60" cy="57" r="1.2" fill={pct>0?'#00e5a0':'#0a2535'} style={{transition:'fill 0.5s ease'}}/>

      {/* ── Handle ── */}
      <rect x="74" y="54" width="12" height="6" rx="3" fill="#0a1e30" stroke="#1e4a6a" strokeWidth="1"/>
      <circle cx="86" cy="57" r="3" fill="#0a1e30" stroke="#1e4a6a" strokeWidth="1"/>

      {/* ── Hinges left side ── */}
      {[28,68].map((y,i)=>(
        <g key={i}>
          <rect x="26" y={y} width="6" height="12" rx="2" fill="#071220" stroke="#1e4a6a" strokeWidth="1"/>
          <line x1="26" y1={y+6} x2="32" y2={y+6} stroke="#1e4a6a" strokeWidth="0.5"/>
        </g>
      ))}

      {/* ── Amount label ── */}
      <text x="60" y="105" textAnchor="middle" fontSize="7" fill="#00e5a0" fontWeight="700"
        fontFamily='DM Mono,monospace'>${(paid/1000).toFixed(0)}K CLAIMED</text>
    </svg>
  )
}

// ─── RNSM Sparkline Chart ─────────────────────────────────────────────────────
function RnsmChart({prices,trend,live,contractAddr}:{prices:number[];trend:boolean;live:number;contractAddr:string}){
  const W=140,H=54
  const min=Math.min(...prices),max=Math.max(...prices),range=Math.max(max-min,0.001)
  const pts=prices.map((p,i)=>`${(i/Math.max(prices.length-1,1))*W},${H-4-(((p-min)/range)*(H-10))}`).join(' ')
  const lx=(prices.length-1)/Math.max(prices.length-1,1)*W
  const ly=H-4-(((prices[prices.length-1]-min)/range)*(H-10))
  const col=trend?'#22c55e':'#ef4444'
  if(!contractAddr) return(
    <div style={{height:60,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
      background:'#010a10',border:'1px dashed #0a2535',borderRadius:6,gap:4}}>
      <div style={{fontSize:16}}>📈</div>
      <span style={{fontFamily:'DM Mono,monospace',fontSize:6,color:'#0a2535',textAlign:'center',lineHeight:1.4}}>enter contract addr{'\n'}to show live chart</span>
    </div>
  )
  return(
    <div style={{background:'#010a10',border:'1px solid #0a2535',borderRadius:6,padding:'4px 6px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:2}}>
        <span style={{fontFamily:'DM Mono,monospace',fontSize:6,color:'#1e4a6a'}}>RNSM/USDT</span>
        <span style={{fontFamily:'DM Mono,monospace',fontSize:7.5,fontWeight:700,color:col}}>{trend?'▲':'▼'} ${live.toFixed(4)}</span>
      </div>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={col} stopOpacity="0.25"/>
            <stop offset="100%" stopColor={col} stopOpacity="0"/>
          </linearGradient>
        </defs>
        {[0.25,0.5,0.75].map(f=>(
          <line key={f} x1="0" y1={H*f} x2={W} y2={H*f} stroke="#0a1628" strokeWidth="0.5"/>
        ))}
        {prices.length>1&&<polygon points={`0,${H} ${pts} ${W},${H}`} fill="url(#cg)"/>}
        {prices.length>1&&<polyline points={pts} fill="none" stroke={col} strokeWidth="1.5" strokeLinejoin="round"/>}
        <circle cx={lx} cy={ly} r="2.5" fill={col}/>
        <circle cx={lx} cy={ly} r="4" fill="none" stroke={col} strokeWidth="0.8" opacity="0.5">
          <animate attributeName="r" values="3;6;3" dur="2s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.5;0;0.5" dur="2s" repeatCount="indefinite"/>
        </circle>
      </svg>
    </div>
  )
}

// ─── Winners Typewriter Terminal ───────────────────────────────────────────────
function WinnersTerminal({winRecords}:{winRecords:WinRecord[]}){
  const[lines,setLines]=useState<{text:string;col:string}[]>([])
  const[cursor,setCursor]=useState(true)
  const scrollRef=useRef<HTMLDivElement>(null)
  const prevLen=useRef(0)

  useEffect(()=>{
    if(winRecords.length<=prevLen.current)return
    const rec=winRecords[winRecords.length-1]
    prevLen.current=winRecords.length
    const cols=['#00e5a0','#f59e0b','#00b8ff','#a855f7','#ec4899']
    const col=cols[(winRecords.length-1)%cols.length]
    const full=`> ${WIN_LABELS[rec.wt]} · ${rec.claimers.join('+')} · $${(rec.split/1000).toFixed(0)}K + ${rec.rnsmEach??0} RNSM each`
    let i=0
    setLines(p=>[...p,{text:'',col}])
    const iv=setInterval(()=>{
      i++
      setLines(p=>{const n=[...p];n[n.length-1]={text:full.slice(0,i),col};return n})
      if(i>=full.length)clearInterval(iv)
    },14)
    return()=>clearInterval(iv)
  },[winRecords])

  useEffect(()=>{const t=setInterval(()=>setCursor(b=>!b),530);return()=>clearInterval(t)},[])
  useEffect(()=>{const el=scrollRef.current;if(el)el.scrollTop=el.scrollHeight},[lines])

  return(
    <div ref={scrollRef} style={{overflowY:'auto',maxHeight:72,fontFamily:'DM Mono,monospace',fontSize:6.5,lineHeight:1.7}}>
      {lines.length===0?(
        <span style={{color:'#0a2535'}}>awaiting claim<span style={{opacity:cursor?1:0,color:'#1e4a6a'}}>_</span></span>
      ):lines.map((l,i)=>(
        <div key={i} style={{color:l.col,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
          {l.text}{i===lines.length-1&&<span style={{opacity:cursor?1:0}}>_</span>}
        </div>
      ))}
    </div>
  )
}

// ─── Hack Matrix Display (bisected vertically) ────────────────────────────────
function HackMatrixDisplay({calledNums,calledOrder,clickWindowOpen,preGameSecs,winRecords,liveBank,contractAddr,timer,totalTimer}:{
  calledNums:Set<number>;calledOrder:number[];clickWindowOpen:boolean;preGameSecs:number;winRecords:WinRecord[];liveBank:number;contractAddr:string;timer:number;totalTimer:number
}){
  const[glitching,setGlitching]=useState(false)
  const[bgCmds,setBgCmds]=useState<{cmd:string;x:number;y:number;op:number;st:string;col:string}[]>([])
  const[prices,setPrices]=useState<number[]>([0.12,0.14,0.11,0.16,0.18,0.15,0.20,0.22,0.19,0.24,0.21,0.26])
  const[live,setLive]=useState(0.26)
  const lastNum=calledOrder[calledOrder.length-1]??null
  const prev5=calledOrder.slice(-6,-1).reverse()
  const prevRef=useRef<number|null>(null)
  const neonCols=['#00e5a0','#00b8ff','#ef4444','#f59e0b','#a855f7']
  const drawn=calledNums.size
  const pct=Math.round((drawn/90)*100)
  const paid=winRecords.reduce((s,r)=>s+r.split*r.claimers.length,0)
  const vaultPct=Math.min(paid/1000000,1)
  const trend=prices[prices.length-1]>=prices[0]

  useEffect(()=>{
    if(lastNum!==null&&lastNum!==prevRef.current){
      prevRef.current=lastNum
      setGlitching(true)
      setTimeout(()=>setGlitching(false),600)
    }
  },[lastNum])

  useEffect(()=>{
    const t=setInterval(()=>{
      setBgCmds(p=>[...p.slice(-16),{
        cmd:HACK_CMDS[Math.floor(Math.random()*HACK_CMDS.length)],
        x:3+Math.random()*90,y:5+Math.random()*85,
        op:0.04+Math.random()*0.07,
        st:HACK_STATUSES[Math.floor(Math.random()*HACK_STATUSES.length)],
        col:neonCols[Math.floor(Math.random()*neonCols.length)],
      }])
    },260)
    return()=>clearInterval(t)
  },[])

  useEffect(()=>{
    if(!contractAddr)return
    const t=setInterval(()=>{
      const delta=(Math.random()-0.47)*0.012
      setLive(p=>{const n=Math.max(0.001,+(p+delta).toFixed(4));setPrices(pp=>[...pp.slice(-28),n]);return n})
    },1800)
    return()=>clearInterval(t)
  },[contractAddr])

  return(
    <div style={{background:'#020d1a',border:'2px solid #0a3a5a',borderRadius:14,overflow:'hidden',display:'flex',position:'relative',minHeight:360}}>
      {/* Scanlines */}
      <div style={{position:'absolute',inset:0,backgroundImage:'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.1) 2px,rgba(0,0,0,0.1) 4px)',pointerEvents:'none',zIndex:1}}/>

      {/* ════ LEFT — numbers + progress + winners ════ */}
      <div style={{flex:1,minWidth:0,padding:'10px 12px',position:'relative',zIndex:2,display:'flex',flexDirection:'column'}}>
        {/* floating bg commands */}
        <div style={{position:'absolute',inset:0,overflow:'hidden',pointerEvents:'none',zIndex:0}}>
          {bgCmds.map((cmd,i)=>(
            <div key={i} style={{position:'absolute',left:`${cmd.x}%`,top:`${cmd.y}%`,
              fontFamily:'DM Mono,monospace',fontSize:6,color:cmd.col,opacity:cmd.op,
              whiteSpace:'nowrap',transform:'translateX(-50%)',
              animation:`gx${i%3} ${3+i%2}s ${i*0.1}s infinite`}}>
              {cmd.cmd}... {cmd.st}
            </div>
          ))}
        </div>

        <div style={{position:'relative',zIndex:1,flex:1,display:'flex',flexDirection:'column'}}>
          {/* Header */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <span style={{fontFamily:'DM Mono,monospace',fontSize:8,color:'#2a5a7a',letterSpacing:'0.15em'}}>◉ HACK MATRIX</span>
            <div style={{display:'flex',alignItems:'center',gap:4}}>
              <div style={{width:5,height:5,borderRadius:'50%',background:'#22c55e',animation:'dot 1.5s infinite'}}/>
              <span style={{fontFamily:'DM Mono,monospace',fontSize:7,color:'#22c55e'}}>LIVE</span>
            </div>
          </div>

          {preGameSecs>0&&calledOrder.length===0?(
            <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8}}>
              <div style={{fontFamily:'DM Mono,monospace',fontSize:8,color:'#2a5a7a',letterSpacing:'0.2em'}}>HACK INITIATES IN</div>
              <div style={{fontFamily:'Syne,sans-serif',fontSize:56,fontWeight:800,color:'#fff',lineHeight:1,
                textShadow:'0 0 30px #fff,0 0 60px rgba(255,255,255,0.4)'}}>{fmtTime(preGameSecs)}</div>
              <div style={{fontFamily:'DM Mono,monospace',fontSize:7,color:'#1e4a6a'}}>ACTIVATE YOUR DEVICES NOW</div>
            </div>
          ):(
            <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-start',gap:8,paddingTop:4}}>
              {/* ── Big number ── */}
              <div style={{textAlign:'center',position:'relative'}}>
                {lastNum!==null?(
                  <>
                    <div style={{fontFamily:'Syne,sans-serif',fontSize:72,fontWeight:800,lineHeight:1,color:'#fff',
                      textShadow:'0 0 20px #fff,0 0 40px rgba(255,255,255,0.6)',
                      animation:glitching?'matrixGlitch 0.6s ease':'numAppear 0.4s cubic-bezier(.34,1.56,.64,1)'}}>
                      {lastNum}
                    </div>
                    {glitching&&(<>
                      <div style={{position:'absolute',inset:0,fontFamily:'Syne,sans-serif',fontSize:72,fontWeight:800,
                        color:'#ff0040',opacity:0.5,animation:'glitchR 0.6s ease',pointerEvents:'none'}}>{lastNum}</div>
                      <div style={{position:'absolute',inset:0,fontFamily:'Syne,sans-serif',fontSize:72,fontWeight:800,
                        color:'#00b8ff',opacity:0.5,animation:'glitchB 0.6s ease',pointerEvents:'none'}}>{lastNum}</div>
                    </>)}
                  </>
                ):(
                  <div style={{fontFamily:'DM Mono,monospace',fontSize:32,fontWeight:400,color:'#1e4a6a',lineHeight:2.2,letterSpacing:'0.2em'}}>
                    STANDBY
                  </div>
                )}
              </div>

              {/* Click window pill + round timer arc — synced with device clocks */}
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <div style={{display:'inline-flex',alignItems:'center',gap:4,padding:'3px 10px',
                  background:clickWindowOpen?'rgba(34,197,94,0.1)':'rgba(239,68,68,0.06)',
                  border:`1px solid ${clickWindowOpen?'rgba(34,197,94,0.4)':'rgba(239,68,68,0.2)'}`,borderRadius:20}}>
                  <div style={{width:4,height:4,borderRadius:'50%',background:clickWindowOpen?'#22c55e':'#ef4444',
                    animation:clickWindowOpen?'dot 1s infinite':'none'}}/>
                  <span style={{fontFamily:'DM Mono,monospace',fontSize:7,color:clickWindowOpen?'#22c55e':'#ef4444'}}>
                    {clickWindowOpen?'CLICK WINDOW OPEN':'WINDOW CLOSED'}
                  </span>
                </div>
                {/* Round timer arc — identical to device MiniStopwatch */}
                {(()=>{const danger=timer<=10,r=10,circ=2*Math.PI*r,dash=circ*(timer/Math.max(totalTimer,1));return(
                  <div style={{position:'relative',width:26,height:26,flexShrink:0}}>
                    <svg width="26" height="26" style={{transform:'rotate(-90deg)'}}>
                      <circle cx="13" cy="13" r={r} fill="none" stroke="#0a1628" strokeWidth="2"/>
                      <circle cx="13" cy="13" r={r} fill="none" stroke={danger?'#ef4444':'#00e5a0'} strokeWidth="2"
                        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{transition:'stroke-dasharray 0.9s linear,stroke 0.3s'}}/>
                    </svg>
                    <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                      <span style={{fontFamily:'DM Mono,monospace',fontSize:6,fontWeight:700,color:danger?'#ef4444':'#00e5a0'}}>{String(timer%60).padStart(2,'0')}</span>
                    </div>
                  </div>
                )})()}
              </div>

              {/* Prev 5 */}
              {prev5.length>0&&(
                <div style={{display:'flex',gap:4,justifyContent:'center'}}>
                  {prev5.map((n,i)=>(
                    <div key={i} style={{width:22,height:22,borderRadius:4,display:'flex',alignItems:'center',
                      justifyContent:'center',background:'#0a1628',border:'1px solid #1e3a5f',
                      fontFamily:'DM Mono,monospace',fontSize:9,color:'#fff',
                      opacity:0.72-i*0.12,textShadow:'0 0 4px rgba(255,255,255,0.4)'}}>{n}</div>
                  ))}
                </div>
              )}

              {/* Progress bar */}
              <div style={{width:'100%'}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                  <span style={{fontFamily:'DM Mono,monospace',fontSize:6.5,color:'#1e4a6a'}}>NUMBERS DRAWN</span>
                  <span style={{fontFamily:'DM Mono,monospace',fontSize:6.5,color:'#2a5a7a'}}>{drawn}/90 · {100-pct}% left</span>
                </div>
                <div style={{height:5,background:'#0a1628',borderRadius:3,overflow:'hidden',border:'1px solid #0d2035',position:'relative'}}>
                  <div style={{height:'100%',width:`${pct}%`,borderRadius:3,transition:'width 0.6s ease',
                    background:'linear-gradient(90deg,#00e5a0,#00b8ff,#f59e0b)',
                    boxShadow:'0 0 6px rgba(0,229,160,0.5)'}}/>
                  {Array.from({length:9},(_,i)=>(
                    <div key={i} style={{position:'absolute',left:`${(i+1)*100/9}%`,top:0,bottom:0,width:1,background:'#ffffff0a'}}/>
                  ))}
                </div>
              </div>

              {/* Winner feed */}
              <div style={{width:'100%',background:'#010a10',border:'1px solid #0a2535',borderRadius:6,padding:'5px 8px'}}>
                <div style={{fontFamily:'DM Mono,monospace',fontSize:6,color:'#1e4a6a',letterSpacing:'0.1em',marginBottom:3}}>
                  🏆 WINNER FEED
                </div>
                <WinnersTerminal winRecords={winRecords}/>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ════ Divider ════ */}
      <div className="matrix-right-divider" style={{width:1,background:'linear-gradient(180deg,transparent,#0a3a5a60,#0a3a5a60,transparent)',flexShrink:0,zIndex:2,alignSelf:'stretch'}}/>

      {/* ════ RIGHT — Vault + Chart + Stats (hidden on mobile) ════ */}
      <div className="matrix-right-panel" style={{width:170,flexShrink:0,padding:'10px 10px',zIndex:2,display:'flex',flexDirection:'column',gap:6}}>

        {/* Bank name */}
        <div style={{fontFamily:'DM Mono,monospace',fontSize:6.5,color:'#2a5a7a',letterSpacing:'0.1em',fontWeight:700}}>
          🏦 {BANKS[liveBank].name.toUpperCase()}
        </div>

        {/* ── 1. Vault illustration ── */}
        <div style={{flex:'0 0 130px'}}>
          <VaultSketch pct={vaultPct} paid={paid}/>
        </div>

        {/* Vault progress bar */}
        <div style={{height:4,background:'#0a1628',borderRadius:2,overflow:'hidden',border:'1px solid #0d2035'}}>
          <div style={{height:'100%',width:`${vaultPct*100}%`,background:'linear-gradient(90deg,#00e5a0,#22c55e)',
            borderRadius:2,transition:'width 1.2s ease',boxShadow:'0 0 4px rgba(0,229,160,0.5)'}}/>
        </div>

        {/* ── 2. RNSM chart ── */}
        <div>
          <div style={{fontFamily:'DM Mono,monospace',fontSize:6,color:'#1e4a6a',letterSpacing:'0.08em',marginBottom:3}}>
            📈 RNSM PRICE
          </div>
          <RnsmChart prices={prices} trend={trend} live={live} contractAddr={contractAddr}/>
        </div>

        {/* ── 3. Mini stats ── */}
        <div style={{marginTop:'auto',borderTop:'1px solid #0a2535',paddingTop:5}}>
          {[
            ['CLAIMED',`$${(paid/1000).toFixed(0)}K`,'#00e5a0'],
            ['REMAINING',`$${((1000000-paid)/1000).toFixed(0)}K`,'#f59e0b'],
            ['DRAWN',`${drawn}/90`,'#4a7fa5'],
            ['WINS',String(winRecords.length),'#a855f7'],
          ].map(([k,v,col])=>(
            <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'1.5px 0',borderBottom:'1px solid #070f1a'}}>
              <span style={{fontFamily:'DM Mono,monospace',fontSize:6,color:'#1e4a6a'}}>{k}</span>
              <span style={{fontFamily:'DM Mono,monospace',fontSize:6.5,color:col,fontWeight:700}}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}



// ─── Chat Terminal (media queue, text + media only) ──────────────────────────
function ChatTerminal({nickname}:{nickname:string}){
  const[lines,setLines]=useState<ChatLine[]>([
    {t:'sys',m:'HACKING MATRIX v3.7.1 INITIALIZED'},
    {t:'sys',m:`AGENT ${nickname.toUpperCase()} CONNECTED`},
  ])
  const[input,setInput]=useState('')
  const[mediaQueue,setMediaQueue]=useState<MediaItem[]>([])
  const[playIdx,setPlayIdx]=useState(0)
  const[playing,setPlaying]=useState(false)
  const scrollRef=useRef<HTMLDivElement>(null)
  const fileRef=useRef<HTMLInputElement>(null)
  const videoRef=useRef<HTMLVideoElement>(null)

  useEffect(()=>{const b=scrollRef.current;if(b)b.scrollTop=b.scrollHeight},[lines])

  // Sequential media player: when queue grows or playback ends, play next
  useEffect(()=>{
    if(mediaQueue.length===0||playing)return
    setPlaying(true)
  },[mediaQueue,playing])

  const handleMediaEnd=()=>{
    const next=playIdx+1
    if(next<mediaQueue.length){setPlayIdx(next)}
    else{setPlaying(false);setPlayIdx(0);setMediaQueue([])}
  }

  const send=()=>{
    if(!input.trim())return
    setLines(p=>[...p,{t:'user',m:`${nickname}: ${input}`}])
    setInput('')
  }

  const handleFile=(e:React.ChangeEvent<HTMLInputElement>)=>{
    const files=Array.from(e.target.files??[])
    files.forEach(f=>{
      if(!f.type.startsWith('image/')&&!f.type.startsWith('video/'))return
      const r=new FileReader()
      r.onload=ev=>{
        const src=ev.target?.result as string
        const type:'image'|'video'=f.type.startsWith('video/')?'video':'image'
        setMediaQueue(q=>[...q,{src,type,name:f.name}])
        setLines(p=>[...p,{t:'img',m:`${nickname}: ${f.name}`,src:type==='image'?src:undefined,vSrc:type==='video'?src:undefined}])
      }
      r.readAsDataURL(f)
    })
    e.target.value=''
  }

  const currentMedia=playing&&mediaQueue[playIdx]?mediaQueue[playIdx]:null

  return(
    <div style={{display:'flex',flexDirection:'column',background:'#020d1a',border:'1px solid #0a2535',borderRadius:12,overflow:'hidden'}}>
      <div style={{padding:'5px 10px',borderBottom:'1px solid #0a2535',fontFamily:'DM Mono,monospace',fontSize:7.5,color:'#00e5a0',display:'flex',alignItems:'center',gap:5,flexShrink:0}}>
        <div style={{width:5,height:5,borderRadius:'50%',background:'#22c55e',animation:'dot 1.5s infinite'}}/>
        SECURE CHAT
        {mediaQueue.length>0&&<span style={{marginLeft:'auto',fontFamily:'DM Mono,monospace',fontSize:6,color:'#f59e0b'}}>▶ {playIdx+1}/{mediaQueue.length} queued</span>}
      </div>
      {/* Media player — sequential queue */}
      {currentMedia&&(
        <div style={{background:'#030a12',borderBottom:'1px solid #0a2535',padding:4}}>
          {currentMedia.type==='image'?(
            <img src={currentMedia.src} alt="" onLoad={()=>setTimeout(handleMediaEnd,2000)}
              style={{width:'100%',maxHeight:120,objectFit:'contain',borderRadius:4,display:'block'}}/>
          ):(
            <video ref={videoRef} src={currentMedia.src} autoPlay controls onEnded={handleMediaEnd}
              style={{width:'100%',maxHeight:120,borderRadius:4,display:'block'}}/>
          )}
          <div style={{fontFamily:'DM Mono,monospace',fontSize:6,color:'#f59e0b',padding:'2px 4px'}}>{currentMedia.name} · {playIdx+1}/{mediaQueue.length}</div>
        </div>
      )}
      <div ref={scrollRef} style={{height:200,overflowY:'auto',padding:'6px 8px',display:'flex',flexDirection:'column',gap:3}}>
        {lines.map((l,i)=>(
          <div key={i}>
            <div style={{fontFamily:'DM Mono,monospace',fontSize:7.5,
              color:l.t==='sys'?'#00e5a0':l.t==='user'?'#00b8ff':l.t==='img'?'#f59e0b':'#2a5a7a',
              fontWeight:l.t==='user'?600:400}}>{l.m}</div>
          </div>
        ))}
      </div>
      <div style={{display:'flex',borderTop:'1px solid #0a2535'}}>
        <input ref={fileRef} type="file" accept="image/*,video/*" multiple onChange={handleFile} style={{display:'none'}}/>
        <button onClick={()=>fileRef.current?.click()} style={{background:'#0a1628',border:'none',borderRight:'1px solid #0a2535',padding:'6px 9px',color:'#f59e0b',cursor:'pointer',fontSize:12}}>📎</button>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder="TYPE MESSAGE..."
          style={{flex:1,background:'transparent',border:'none',padding:'6px 7px',fontFamily:'DM Mono,monospace',fontSize:8,color:'#00b8ff',outline:'none'}}/>
        <button onClick={send} style={{background:'#0a1628',border:'none',borderLeft:'1px solid #0a2535',padding:'6px 9px',color:'#2a5a7a',cursor:'pointer',fontFamily:'DM Mono,monospace',fontSize:8}}>TX</button>
      </div>
    </div>
  )
}

// ─── Game Stats ───────────────────────────────────────────────────────────────
function GameStats({devices,calledNums,bankruptCount,liveBank,nickname,winStates,contractAddr,setContractAddr}:{
  devices:Device[];calledNums:Set<number>;bankruptCount:number;liveBank:number;nickname:string;
  winStates:Record<WinType,WinState>;contractAddr:string;setContractAddr:(v:string)=>void
}){
  const LED_TYPES:WinType[]=['EARLY_FIVE','TOP_LINE','MIDDLE_LINE','BOTTOM_LINE','FULL_HOUSE_1','FULL_HOUSE_2','FULL_HOUSE_3']
  return(
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      <div style={{background:'#020d1a',border:'1px solid #0a2535',borderRadius:12,padding:10}}>
        <div style={{fontFamily:'DM Mono,monospace',fontSize:7.5,color:'#2a5a7a',marginBottom:7}}>GAME STATS</div>
        {[['AGENT',nickname],['TARGET',BANKS[liveBank].name.split(' ')[0]],['DRAWN',`${calledNums.size}/90`],['DEVICES',`${devices.filter(d=>d.active).length}/${devices.length}`],['BANKRUPT',`${bankruptCount}/3`]].map(([k,v])=>(
          <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'2px 0',borderBottom:'1px solid #0a1628'}}>
            <span style={{fontFamily:'DM Mono,monospace',fontSize:6.5,color:'#1e4a6a'}}>{k}</span>
            <span style={{fontFamily:'DM Mono,monospace',fontSize:7,color:'#4a7fa5',fontWeight:600}}>{v}</span>
          </div>
        ))}
        {/* Contract address input for RNSM price feed */}
        <div style={{marginTop:7,paddingTop:6,borderTop:'1px solid #0a1628'}}>
          <div style={{fontFamily:'DM Mono,monospace',fontSize:6,color:'#1e4a6a',marginBottom:3}}>RNSM CONTRACT</div>
          <input value={contractAddr} onChange={e=>setContractAddr(e.target.value)}
            placeholder="0x... or token addr"
            style={{width:'100%',background:'#0a1628',border:`1px solid ${contractAddr?'#00e5a040':'#0a2535'}`,borderRadius:5,padding:'4px 6px',
              fontFamily:'DM Mono,monospace',fontSize:6.5,color:'#00e5a0',outline:'none',boxSizing:'border-box'}}/>
        </div>
      </div>
      <div style={{background:'#020d1a',border:'1px solid #0a2535',borderRadius:10,padding:10}}>
        <div style={{fontFamily:'DM Mono,monospace',fontSize:7.5,color:'#1e4a6a',marginBottom:7}}>WIN STATUS</div>
        {LED_TYPES.map(type=><LedProgress key={type} type={type} ws={winStates[type]} devices={devices}/>)}
      </div>
    </div>
  )
}

// ─── Nickname Modal ───────────────────────────────────────────────────────────
function NicknameModal({onConfirm}:{onConfirm:(name:string)=>void}){
  const[name,setName]=useState(''),[err,setErr]=useState('')
  const go=()=>{if(name.trim().length<3){setErr('Min 3 chars');return}if(name.trim().length>16){setErr('Max 16 chars');return}onConfirm(name.trim())}
  return(
    <div style={{position:'fixed',inset:0,background:'linear-gradient(135deg,#010810,#020d1a)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}>
      <div style={{background:'#020d1a',border:'1px solid #0a3a5a',borderRadius:20,padding:32,maxWidth:340,width:'100%',boxShadow:'0 0 60px rgba(0,229,160,0.08)'}}>
        <div style={{fontFamily:'Syne,sans-serif',fontSize:28,fontWeight:800,color:'#00e5a0',textShadow:'0 0 20px #00e5a060',marginBottom:4}}>RANSOME</div>
        <div style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#2a5a7a',letterSpacing:'0.15em',marginBottom:24}}>HACK THE BANKS — CLAIM THE VAULT</div>
        <div style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#4a7fa5',marginBottom:8}}>CHOOSE YOUR AGENT NAME</div>
        <input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&go()} placeholder="e.g. GHOST_ZERO" maxLength={16}
          style={{width:'100%',background:'#0a1628',border:'1px solid #1e3a5f',borderRadius:10,padding:'12px 14px',fontFamily:'DM Mono,monospace',fontSize:14,color:'#00e5a0',outline:'none',boxSizing:'border-box',marginBottom:6,caretColor:'#00e5a0'}}/>
        {err&&<div style={{fontFamily:'DM Mono,monospace',fontSize:8,color:'#ef4444',marginBottom:8}}>{err}</div>}
        <button onClick={go} style={{width:'100%',background:'linear-gradient(135deg,#00e5a0,#00b8ff)',color:'#000',border:'none',borderRadius:10,padding:'14px',fontFamily:'Syne,sans-serif',fontSize:15,fontWeight:700,cursor:'pointer',marginTop:6}}>ENTER THE MATRIX →</button>
      </div>
    </div>
  )
}

// ─── Maximized Device Grid (fullscreen overlay) ───────────────────────────────
// ─── Maximized Device Grid (fullscreen overlay, 2-col, 6 per page) ──────────
function MaximizedDevices({devices,currentNum,clickWindowOpen,calledNums,onCellClick,onClaim,onActivate,winStates,bankruptCount,timer,totalTimer,liveBank,onClose}:{
  devices:Device[];currentNum:number|null;clickWindowOpen:boolean;calledNums:Set<number>;
  onCellClick:(id:number,r:number,c:number)=>void;onClaim:(id:number,w:WinType)=>void;
  onActivate:(id:number)=>void;winStates:Record<WinType,WinState>;bankruptCount:number;
  timer:number;totalTimer:number;liveBank:number;onClose:()=>void
}){
  const[page,setPage]=useState(0)
  const total=Math.max(1,Math.ceil(devices.length/6))
  const pageDevs=devices.slice(page*6,page*6+6)
  const txRef=useRef<number|null>(null)
  const tyRef=useRef<number|null>(null)
  const onTouchStart=(e:React.TouchEvent)=>{txRef.current=e.touches[0].clientX;tyRef.current=e.touches[0].clientY}
  const onTouchEnd=(e:React.TouchEvent)=>{
    if(txRef.current===null||tyRef.current===null)return
    const dx=e.changedTouches[0].clientX-txRef.current
    const dy=e.changedTouches[0].clientY-tyRef.current
    if(Math.abs(dx)>Math.abs(dy)*1.4&&Math.abs(dx)>40){
      if(dx<0&&page<total-1)setPage(p=>p+1)
      if(dx>0&&page>0)setPage(p=>p-1)
    }
    txRef.current=null;tyRef.current=null
  }
  return(
    <div style={{position:'fixed',inset:0,background:'linear-gradient(180deg,#010810,#020d1a)',zIndex:100,display:'flex',flexDirection:'column',overflow:'hidden'}}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 12px',borderBottom:'1px solid #0a1f3a',background:'rgba(2,13,26,0.98)',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontFamily:'DM Mono,monospace',fontSize:8,color:'#1e4a6a'}}>◈ DEVICES</span>
          <span style={{fontFamily:'DM Mono,monospace',fontSize:8,color:'#2a5a7a'}}>{devices.filter(d=>d.active).length}/{devices.length} active</span>
          {total>1&&<span style={{fontFamily:'DM Mono,monospace',fontSize:7.5,color:'#1e3a5f'}}>pg {page+1}/{total}</span>}
        </div>
        <div style={{display:'flex',gap:4,alignItems:'center'}}>
          {total>1&&Array.from({length:total},(_,i)=>(
            <button key={i} onClick={()=>setPage(i)} style={{width:7,height:7,borderRadius:'50%',border:'none',cursor:'pointer',padding:0,
              background:i===page?'#00e5a0':'#1e3a5f',boxShadow:i===page?'0 0 5px #00e5a0':'none'}}/>
          ))}
          <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0}
            style={{width:24,height:24,borderRadius:6,background:'#0a1628',border:'1px solid #1e3a5f',color:page===0?'#1e3a5f':'#4a7fa5',cursor:page===0?'default':'pointer',fontFamily:'DM Mono,monospace',fontSize:13,display:'flex',alignItems:'center',justifyContent:'center'}}>‹</button>
          <button onClick={()=>setPage(p=>Math.min(total-1,p+1))} disabled={page>=total-1}
            style={{width:24,height:24,borderRadius:6,background:'#0a1628',border:'1px solid #1e3a5f',color:page>=total-1?'#1e3a5f':'#4a7fa5',cursor:page>=total-1?'default':'pointer',fontFamily:'DM Mono,monospace',fontSize:13,display:'flex',alignItems:'center',justifyContent:'center'}}>›</button>
          <button onClick={onClose} style={{background:'#0a1628',border:'1px solid #1e3a5f',color:'#4a7fa5',borderRadius:7,padding:'4px 10px',fontFamily:'DM Mono,monospace',fontSize:8,cursor:'pointer'}}>⊟ EXIT</button>
        </div>
      </div>
      {/* 2-col grid, 6 devices per page, scrollable */}
      <div style={{flex:1,overflowY:'auto',padding:'10px 12px'}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:10}}>
          {pageDevs.map(d=>(
            <HackingDevice key={d.id} device={d} currentNum={currentNum} clickWindowOpen={clickWindowOpen}
              calledNums={calledNums} onCellClick={onCellClick} onClaim={onClaim} onActivate={onActivate}
              winStates={winStates} bankruptCount={bankruptCount} timer={timer} totalTimer={totalTimer} liveBank={liveBank}/>
          ))}
        </div>
      </div>
      {total>1&&(
        <div style={{textAlign:'center',padding:'5px',fontFamily:'DM Mono,monospace',fontSize:6.5,color:'rgba(30,58,95,0.7)',flexShrink:0}}>
          ← SWIPE OR USE ARROWS TO NAVIGATE ·  6 DEVICES PER PAGE →
        </div>
      )}
    </div>
  )
}


// ─── Main (wrapped with wallet providers) ─────────────────────────────────────
export default function RansomeApp(){
  const network = WalletAdapterNetwork.Devnet
  const endpoint = 'https://api.devnet.solana.com'
  const wallets = useMemo(()=>[new PhantomWalletAdapter(), new SolflareWalletAdapter()],[])
  return(
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <Ransome/>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}

function Ransome(){
  const { publicKey, disconnect, connected } = useWallet()
  const[phase,setPhase]=useState<string>('setup')
  const[nickname,setNickname]=useState('')
  // wallet derived from real Phantom/Solflare connection
  const wallet = connected && publicKey ? publicKey.toBase58() : null
  const[devices,setDevices]=useState<Device[]>([])
  const[calledNums,setCalledNums]=useState<Set<number>>(new Set())
  const[calledOrder,setCalledOrder]=useState<number[]>([])
  const[timer,setTimer]=useState(60)
  const[totalTimer,setTotalTimer]=useState(60)
  const[clickWindowOpen,setClickWindowOpen]=useState(false)
  const[announcement,setAnnouncement]=useState<string|null>(null)
  const[bankruptCount,setBankruptCount]=useState(0)
  const[mintCount,setMintCount]=useState(1)
  const[mintToken,setMintToken]=useState('USDT')
  const[selectedBank,setSelectedBank]=useState<number|null>(null)
  const[devicesExpanded,setDevicesExpanded]=useState(false)
  const[showTerminate,setShowTerminate]=useState(false)
  const[preGameSecs,setPreGameSecs]=useState(0)
  const[bankHacked,setBankHacked]=useState(false)
  const[winRecords,setWinRecords]=useState<WinRecord[]>([])
  const[roundNum,setRoundNum]=useState(0)
  const[contractAddr,setContractAddr]=useState('')
  // claimers accumulating per round per winType
  const pendingClaimers=useRef<Record<WinType,string[]>>({EARLY_FIVE:[],TOP_LINE:[],MIDDLE_LINE:[],BOTTOM_LINE:[],FULL_HOUSE_1:[],FULL_HOUSE_2:[],FULL_HOUSE_3:[]})
  const roundTimers=useRef<Record<string,ReturnType<typeof setTimeout>>>({})
  const[winStates,setWinStates]=useState<Record<WinType,WinState>>(defaultWinStates())
  const timerRef=useRef<ReturnType<typeof setInterval>|null>(null)
  const preTimerRef=useRef<ReturnType<typeof setInterval>|null>(null)
  const flickerTimers=useRef<Record<string,ReturnType<typeof setTimeout>>>({})
  const sessionStartRef=useRef<number>(0)       // Date.now() when game started
  const sessionTimerRef=useRef<ReturnType<typeof setInterval>|null>(null)
  const[sessionSecs,setSessionSecs]=useState(0) // elapsed seconds this session
  const[showEndScreen,setShowEndScreen]=useState(false) // all bankrupts done
  const currentHour=new Date().getUTCHours()
  const liveBank=getLiveBank(currentHour)
  const lobbyCountdown=useLobbyCountdown()           // 59-min cycle countdown
  const lobbyFill=Math.min(1-(lobbyCountdown/LOBBY_CYCLE),1)  // 0→1 as vault fills
  const onChainSession=useOnChainSession(phase==='game')  // poll on-chain state during game

  // ── Persist & restore state ──────────────────────────────────────────────
  const resumeRef=useRef(false)
  const restoredNumsRef=useRef<number[]>([])  // holds saved calledNums for resume sync
  const restoredPreGameSecsRef=useRef<number>(0)  // >0 means reload happened during pre-game
  const restoredTimerRef=useRef<number>(60)            // saved round timer for mid-game resume
  const pendingAnnounce=useRef<string[]>([])              // win announcements queued for next round
  const startRoundRef=useRef<()=>void>(()=>{})               // stable ref to startRound
  const masterRef=useRef<ReturnType<typeof setInterval>|null>(null)  // ONE master clock
  const clockPhaseRef=useRef<'idle'|'pregame'|'round'>('idle')       // master clock state

  useEffect(()=>{
    const s=loadState()
    if(!s)return
    if(s.nickname)setNickname(s.nickname)
    // wallet restored from adapter, not localStorage
    if(s.mintToken)setMintToken(s.mintToken)
    if(s.contractAddr)setContractAddr(s.contractAddr)
    // Restore devices with claimed Sets
    if(s.devices&&s.devices.length>0){
      const rehydrated=s.devices.map((d:any)=>({...d,claimed:new Set(d.claimed??[]),missed:d.missed??false}))
      setDevices(rehydrated)
    }
    // Restore game progress
    if(s.calledNums&&s.calledNums.length>0){
      setCalledNums(new Set(s.calledNums as number[]))
      setCalledOrder(s.calledOrder??[])
      restoredNumsRef.current=s.calledNums as number[]  // for resume drawnRef sync
    }
    if(s.winStates){
      // Rehydrate winStates — ensure all fields exist with defaults
      const ws=s.winStates as Record<WinType,any>
      const fixed:Record<string,WinState>={}
      ;(Object.keys(defaultWinStates()) as WinType[]).forEach(k=>{
        fixed[k]={
          claimed:ws[k]?.claimed??false,
          claimable:ws[k]?.claimable??false,
          flickering:false,  // never restore flickering — start clean
          broken:ws[k]?.broken??false,
          expired:ws[k]?.expired??false,
          claimers:ws[k]?.claimers??[],
        }
      })
      setWinStates(fixed as Record<WinType,WinState>)
    }
    if(s.winRecords)setWinRecords(s.winRecords)
    if(typeof s.bankruptCount==='number')setBankruptCount(s.bankruptCount)
    if(typeof s.roundNum==='number')setRoundNum(s.roundNum)
    if(s.phase==='game'){
      setPhase('game')
      const elapsed=s.savedAt?Math.floor((Date.now()-s.savedAt)/1000):0
      const hasDrawn=(s.calledNums&&s.calledNums.length>0)
      if(!hasDrawn){
        // PRE-GAME: no numbers drawn — resume countdown (60s fresh start, elapsed accounted)
        const remaining=Math.max(60-elapsed,3)
        restoredPreGameSecsRef.current=remaining
      } else {
        // MID-GAME: resume round timer from saved position
        const savedTimer=typeof s.timer==='number'?s.timer:60
        const resumeTimer=Math.max(savedTimer-elapsed,1)
        if(typeof s.totalTimer==='number')setTotalTimer(s.totalTimer)
        setTimer(resumeTimer)
        restoredTimerRef.current=resumeTimer
        restoredPreGameSecsRef.current=0
      }
      resumeRef.current=true
    } else if(s.phase&&s.phase!=='setup'){
      setPhase(s.phase)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])

  // Save ALL game state on every meaningful change
  useEffect(()=>{
    if(phase==='setup')return
    saveState({
      nickname,phase,mintToken,contractAddr,
      devices:devices.map(d=>({...d,claimed:Array.from(d.claimed)})),
      calledNums:Array.from(calledNums),
      calledOrder,
      winStates,
      winRecords,
      bankruptCount,
      roundNum,
      timer,
      totalTimer,
      savedAt:Date.now(),
    })
  },[nickname,phase,mintToken,contractAddr,devices,calledNums,calledOrder,winStates,winRecords,bankruptCount,roundNum,timer,totalTimer])
  const currentNum=calledOrder[calledOrder.length-1]??null
  const hourCd=useHourCountdown()

  const announce=(msg:string)=>{setAnnouncement(msg);setTimeout(()=>setAnnouncement(null),6000)}

  const drawnRef=useRef<Set<number>>(new Set())  // source-of-truth to prevent duplicates
  const drawLockRef=useRef(false)               // prevent concurrent draws

  const drawNumber=useCallback(()=>{    if(drawLockRef.current)return
    drawLockRef.current=true
    setRoundNum(r=>r+1)
    setClickWindowOpen(false)
    const already=drawnRef.current
    if(already.size>=90){setBankHacked(true);drawLockRef.current=false;return}
    const remaining=Array.from({length:90},(_,i)=>i+1).filter(n=>!already.has(n))
    if(!remaining.length){setBankHacked(true);drawLockRef.current=false;return}
    const num=remaining[Math.floor(Math.random()*remaining.length)]
    drawnRef.current=new Set(Array.from(already).concat([num]))
    setCalledOrder(o=>[...o,num])
    setCalledNums(new Set(Array.from(drawnRef.current)))
    setDevices(ds=>ds.map(d=>{
      if(!d.active||d.corrupted)return d
      return{...d,grid:d.grid.map(row=>row.map(cell=>cell.num===num?{...cell,matched:true}:cell))}
    }))
    // On new round: process claimed→filament, announce winners, expire unclaimed wins
    setWinStates(prev=>{
      const next={...prev}
      ;(Object.keys(next) as WinType[]).forEach(wt=>{
        if(next[wt].claimed&&next[wt].bursting){
          // Claiming devices: burst→filament. Flicker stops for all, broken goes bright
          next[wt]={...next[wt],flickering:false,bursting:false,broken:true}
        } else if(next[wt].claimable&&!next[wt].claimed&&!next[wt].expired){
          // Unclaimed claimable: lightning blink then expire
          next[wt]={...next[wt],claimable:false,flickering:true,expired:false}
          setTimeout(()=>{
            setWinStates(p=>({...p,[wt]:{...p[wt],flickering:false,expired:true}}))
          },400)
        }
      })
      return next
    })
    // Announce queued winners now (start of new round)
    if(pendingAnnounce.current.length>0){
      pendingAnnounce.current.forEach(msg=>announce(msg))
      pendingAnnounce.current=[]
    }
    setTimeout(()=>{setClickWindowOpen(true);drawLockRef.current=false},150)
  },[])

  useEffect(()=>{
    if(!bankHacked)return
    stopMaster()
    setClickWindowOpen(false)
    announce(`🏦 BANK HACKED! ALL 90 DRAWN!\n💸 Unclaimed → ${CLAIM_WALLET.slice(0,8)}...${CLAIM_WALLET.slice(-6)}\n🗑 NFT devices unlinked — session ended\nReturning to lobby...`)
    setTimeout(()=>{
      pendingAnnounce.current=[]
      setDevices([])  // trash NFT devices — session ended
      setPhase('lobby');setBankHacked(false);setCalledNums(new Set());setCalledOrder([])
      setWinStates(defaultWinStates());setWinRecords([]);setRoundNum(0);setBankruptCount(0)
    },8000)
  },[bankHacked])

  const stopSessionClock=useCallback(()=>{
    if(sessionTimerRef.current){clearInterval(sessionTimerRef.current);sessionTimerRef.current=null}
  },[])

  const startSessionClock=useCallback(()=>{
    sessionStartRef.current=Date.now()
    setSessionSecs(0)
    stopSessionClock()
    sessionTimerRef.current=setInterval(()=>{
      setSessionSecs(Math.floor((Date.now()-sessionStartRef.current)/1000))
    },1000)
  },[stopSessionClock])

  // ── MASTER CLOCK ──────────────────────────────────────────────────────────
  // One interval drives pre-game countdown AND round countdown.
  // Switching phases is atomic — no drift between two separate setIntervals.
  const stopMaster=useCallback(()=>{
    if(masterRef.current){clearInterval(masterRef.current);masterRef.current=null}
    clockPhaseRef.current='idle'
  },[])

  const beginRound=useCallback(()=>{
    // Called when it's time to draw a number and run a 60s round
    drawNumber()        // draw first
    setTimer(60)        // clock reset in same render batch — guaranteed sync
    setTotalTimer(60)
    clockPhaseRef.current='round'
  },[drawNumber])

  // Keep startRoundRef pointing at beginRound for legacy resume paths
  useEffect(()=>{startRoundRef.current=beginRound},[beginRound])

  const startPreGame=useCallback((secs:number)=>{
    stopMaster()
    clockPhaseRef.current='pregame'
    setPreGameSecs(secs)
    setTimer(60);setTotalTimer(60)
    masterRef.current=setInterval(()=>{
      if(clockPhaseRef.current==='pregame'){
        setPreGameSecs(p=>{
          if(p<=1){
            // Pre-game done — switch to first round atomically in this same tick
            clockPhaseRef.current='round'
            startSessionClock()
            drawNumber()       // draw number NOW
            setTimer(60)       // clock resets NOW — same JS tick, same React batch
            setTotalTimer(60)
            return 0
          }
          return p-1
        })
      } else if(clockPhaseRef.current==='round'){
        setTimer(prev=>{
          if(prev<=1){
            // Round done — draw next number, reset clock atomically
            setClickWindowOpen(false)
            drawNumber()
            setTimer(60)
            setTotalTimer(60)
            return 60
          }
          return prev-1
        })
      }
    },1000)
  },[stopMaster,startSessionClock,drawNumber])

  // Resume game after page reload — fires whenever devices state settles with resumeRef flagged
  useEffect(()=>{
    if(!resumeRef.current)return
    if(phase!=='game')return
    resumeRef.current=false
    // Clear any stale timers
    stopMaster()
    // Short delay so React fully commits restored device state
    const t=setTimeout(()=>{
      if(restoredPreGameSecsRef.current>0){
        // PRE-GAME RESUME: countdown was running, pick up where it left off
        const remaining=restoredPreGameSecsRef.current
        restoredPreGameSecsRef.current=0
        drawnRef.current=new Set()
        setClickWindowOpen(false)
        // Resume via master clock — same atomic pre-game flow
        startPreGame(remaining)
      } else {
        // MID-GAME RESUME: numbers already drawn, resume draw interval
        drawnRef.current=new Set(restoredNumsRef.current.length>0?restoredNumsRef.current:Array.from(calledNums))
        setDevices(ds=>ds.map(d=>({...d,
          grid:d.grid.map(row=>row.map(cell=>
            cell.matched&&!cell.clicked?{...cell,missed:true}:cell
          ))
        })))
        const rt=restoredTimerRef.current>0?restoredTimerRef.current:60
        drawLockRef.current=false
        startSessionClock()
        setPreGameSecs(0);setTotalTimer(60);setTimer(rt)
        setClickWindowOpen(restoredNumsRef.current.length>0)
        // Resume mid-game via master clock at remaining seconds
        stopMaster()
        clockPhaseRef.current='round'
        masterRef.current=setInterval(()=>{
          if(clockPhaseRef.current==='round'){
            setTimer(prev=>{
              if(prev<=1){
                setClickWindowOpen(false)
                drawNumber()
                setTimer(60);setTotalTimer(60)
                return 60
              }
              return prev-1
            })
          }
        },1000)
      }
    },300)
    return()=>clearTimeout(t)
  },[phase,drawNumber])


  const warnedRef=useRef(false)  // tracks 57-min warning fired

  // ── 57/58 minute session enforcement ──────────────────────────────────────
  useEffect(()=>{
    if(phase!=='game'||showEndScreen)return
    if(sessionSecs>=(3420)&&!warnedRef.current){
      warnedRef.current=true
      announce(`⚠️ SECURITY BREACH TRACKER DETECTED\n🚨 HACK SESSION ENDING IN 60 SECONDS\nAll active ransoms will be auto-liquidated`)
    }
    if(sessionSecs>=3480){
      // Hard stop — end session now
      stopMaster();stopSessionClock()
      setClickWindowOpen(false)
      setShowEndScreen(true)
      // Deactivate all devices
      setDevices(ds=>ds.map(d=>({...d,active:false})))
      // Build final payout: split remaining vault equally among all winners
      // If no winners, full vault to CLAIM_WALLET
      setWinRecords(wr=>{
        const allWinners=Array.from(new Set(wr.flatMap(r=>r.claimers)))
        const totalPaid=wr.reduce((s,r)=>s+r.split*r.claimers.length,0)
        const remaining=Math.max(1000000-totalPaid,0)
        if(remaining>0){
          const dest=allWinners.length>0?allWinners:[CLAIM_WALLET.slice(0,8)+'…']
          const cut=Math.floor(remaining/dest.length)
          announce(`🚨 VAULT HIJACKED BY TOP HACKERS\n💸 ${(remaining/1000).toFixed(0)}K split:\n${dest.map(w=>`  ${w} → $${(cut/1000).toFixed(0)}K`).join('\n')}`)
        }
        return wr
      })
      // Return to lobby after 60s
      setTimeout(()=>{
        stopSessionClock()
        warnedRef.current=false
        setShowEndScreen(false)
        setDevices([])
        setCalledNums(new Set())
        setCalledOrder([])
        setWinStates(defaultWinStates())
        setWinRecords([])
        setRoundNum(0)
        setBankruptCount(0)
        setPhase('lobby')
        try{localStorage.removeItem('ransome_state_v1')}catch{}
      },60000)
    }
  },[phase,sessionSecs,showEndScreen,stopSessionClock])


  // ── All bankrupts claimed → show end screen ───────────────────────────────
  useEffect(()=>{
    if(phase!=='game'||bankruptCount<3||showEndScreen)return
    stopMaster();stopSessionClock()
    setClickWindowOpen(false)
    setShowEndScreen(true)
    setDevices(ds=>ds.map(d=>({...d,active:false})))
    announce(`🏆 ALL RANSOMS CLAIMED!\n💰 Final vault summary broadcasting...\nSession ending in 60 seconds`)
    setTimeout(()=>{
      stopSessionClock()
      warnedRef.current=false
      setShowEndScreen(false)
      setDevices([])
      setCalledNums(new Set())
      setCalledOrder([])
      setWinStates(defaultWinStates())
      setWinRecords([])
      setRoundNum(0)
      setBankruptCount(0)
      setPhase('lobby')
      try{localStorage.removeItem('ransome_state_v1')}catch{}
    },60000)
  },[phase,bankruptCount,showEndScreen,stopSessionClock])


  // ── Auto-launch: when lobby countdown hits 0, enter game if devices minted ──
  const autoLaunchedRef=useRef(false)
  useEffect(()=>{
    if(phase!=='lobby')return
    if(lobbyCountdown<=1&&!autoLaunchedRef.current&&devices.length>0){
      autoLaunchedRef.current=true
      announce('🚀 BATCH LAUNCHING — TRANSFERRING TO HACK MATRIX')
      setTimeout(()=>enterGame(),1200)
    }
    if(lobbyCountdown>5)autoLaunchedRef.current=false  // reset for next cycle
  },[phase,lobbyCountdown,devices.length])


  // ── Sync on-chain numbers to frontend ─────────────────────────────────────
  // When the cron draws a new number on-chain, push it to the local game state
  const lastOnChainNumRef=useRef<number>(0)
  useEffect(()=>{
    if(!onChainSession||phase!=='game'||preGameSecs>0)return
    const newNum=onChainSession.lastNumber
    if(newNum>0&&newNum!==lastOnChainNumRef.current){
      lastOnChainNumRef.current=newNum
      // If this number isn't already in our local state, add it
      if(!drawnRef.current.has(newNum)){
        drawLockRef.current=false  // allow the draw
        // Directly update state with on-chain number (bypass Math.random)
        drawnRef.current=new Set(Array.from(drawnRef.current).concat([newNum]))
        setCalledOrder(o=>[...o,newNum])
        setCalledNums(new Set(Array.from(drawnRef.current)))
        setRoundNum(r=>r+1)
        setDevices(ds=>ds.map(d=>{
          if(!d.active||d.corrupted)return d
          return{...d,grid:d.grid.map(row=>row.map(cell=>cell.num===newNum?{...cell,matched:true}:cell))}
        }))
        // Reset timer to 60 and open click window
        setTimer(60);setTotalTimer(60)
        setTimeout(()=>setClickWindowOpen(true),150)
      }
    }
    // Sync draw count — if on-chain shows all 90 drawn
    if(onChainSession.drawCount>=90&&!bankHacked){
      setBankHacked(true)
    }
  },[onChainSession,phase,preGameSecs,bankHacked])

  // Win detection
  useEffect(()=>{
    if(phase!=='game')return
    setWinStates(prev=>{
      const next={...prev};let ann=false
      devices.forEach(d=>{
        if(!d.active||d.corrupted)return
        const all=d.grid.flat(),nc=all.filter(c=>c.clicked)
        const triggerWin=(wt:WinType,msg:string)=>{
          if(next[wt].claimable||next[wt].claimed||next[wt].expired)return
          // Win achieved: flicker ALL active device LEDs for this win type this round
          // Expiry happens automatically when next number is drawn (in drawNumber)
          next[wt]={...next[wt],claimable:true,flickering:true}
          if(!ann){announce(msg);ann=true}
        }
        if(nc.length>=5)triggerWin('EARLY_FIVE',`⚡ ${d.nftId} — EARLY FIVE! CLAIM NOW`)
        if(d.grid[0].filter(cl=>cl.num).every(cl=>cl.clicked))triggerWin('TOP_LINE',`⚡ ${d.nftId} — TOP LINE! CLAIM NOW`)
        if(d.grid[1].filter(cl=>cl.num).every(cl=>cl.clicked))triggerWin('MIDDLE_LINE',`⚡ ${d.nftId} — MIDDLE LINE! CLAIM NOW`)
        if(d.grid[2].filter(cl=>cl.num).every(cl=>cl.clicked))triggerWin('BOTTOM_LINE',`⚡ ${d.nftId} — BOTTOM LINE! CLAIM NOW`)
        if(all.filter(cl=>cl.num).every(cl=>cl.clicked)){const fk=`FULL_HOUSE_${Math.min(bankruptCount+1,3)}` as WinType;triggerWin(fk,`🔥 ${d.nftId} — FULL HOUSE! CLAIM NOW`)}
      })
      return next
    })
  },[devices,phase])

  const handleCellClick=(devId:number,r:number,c:number)=>{
    if(!clickWindowOpen||!currentNum)return
    setDevices(ds=>ds.map(d=>{
      if(d.id!==devId||!d.active)return d
      const cell=d.grid[r][c]
      if(!cell.num||cell.num!==currentNum||cell.clicked||cell.missed)return d
      return{...d,grid:d.grid.map((row,ri)=>row.map((cl,ci)=>ri===r&&ci===c?{...cl,clicked:true}:cl))}
    }))
  }

  // Claim: accumulate claimers within same round, split prize, then flicker ALL devices
  const handleClaim=async(devId:number,wt:WinType)=>{
    if(winStates[wt].claimed)return
    // ── On-chain claim if real wallet connected ──────────────────────────────
    if(connected&&publicKey&&sendTransaction&&solanaConnection){
      try{
        const{PublicKey,Transaction,TransactionInstruction,SystemProgram}=await import('@solana/web3.js')
        const programId=new PublicKey(PROGRAM_ID_STR)
        const sessionAuth=new PublicKey(SESSION_AUTH_STR)
        const winner=publicKey
        const[sessionKey]=PublicKey.findProgramAddressSync([Buffer.from('session'),sessionAuth.toBuffer()],programId)
        const[vaultKey]=PublicKey.findProgramAddressSync([Buffer.from('vault'),sessionKey.toBuffer()],programId)
        const[deviceKey]=PublicKey.findProgramAddressSync(
          [Buffer.from('device'),sessionKey.toBuffer(),winner.toBuffer(),Buffer.from([devId])],programId
        )
        const disc=Buffer.from([163,215,101,246,25,134,110,194])
        const data=Buffer.concat([disc,Buffer.from([WIN_TYPE_INDEX[wt]??0])])
        const ix=new TransactionInstruction({
          programId,
          keys:[
            {pubkey:winner,isSigner:true,isWritable:true},
            {pubkey:sessionKey,isSigner:false,isWritable:true},
            {pubkey:vaultKey,isSigner:false,isWritable:true},
            {pubkey:deviceKey,isSigner:false,isWritable:false},
            {pubkey:winner,isSigner:false,isWritable:false},
            {pubkey:SystemProgram.programId,isSigner:false,isWritable:false},
          ],
          data
        })
        const{blockhash,lastValidBlockHeight}=await solanaConnection.getLatestBlockhash('confirmed')
        const tx=new Transaction({blockhash,lastValidBlockHeight,feePayer:winner})
        tx.add(ix)
        const sig=await sendTransaction(tx,solanaConnection)
        await solanaConnection.confirmTransaction({signature:sig,blockhash,lastValidBlockHeight},'confirmed')
        announce(`✅ ON-CHAIN CLAIM!\n${WIN_LABELS[wt]}\nSig: ${sig.slice(0,16)}...`)
      }catch(e:any){
        console.error('On-chain claim error:',e.message)
      }
    }
    const dev=devices.find(d=>d.id===devId)
    if(!dev)return
    // Add to pending claimers for this win type
    const claimers=pendingClaimers.current[wt]
    if(!claimers.includes(dev.nftId)){
      claimers.push(dev.nftId)
      setDevices(ds=>ds.map(d=>d.id!==devId?d:{...d,claimed:new Set(Array.from(d.claimed).concat([wt]))}))
    }
    if(wt.startsWith('FULL_HOUSE'))setBankruptCount(b=>Math.min(b+1,3))

    // Debounce: wait 500ms for other same-round claimers
    const key=`claim_${wt}`
    if(roundTimers.current[key])clearTimeout(roundTimers.current[key])
    roundTimers.current[key]=setTimeout(()=>{
      const final=[...pendingClaimers.current[wt]]
      pendingClaimers.current[wt]=[]
      const vault=WIN_VAULT[wt]
      const split=Math.floor(vault/final.length)
      const rnsmEach=Math.floor(RNSM_ALLOC[wt]/Math.max(final.length,1))
      setWinRecords(r=>[...r,{wt,claimers:final,round:roundNum,split,rnsmEach}])
      // Queue winner announcement for the START of next round (when next number draws)
      const walletSnip=(addr:string|null)=>addr?`${addr.slice(0,6)}…${addr.slice(-4)}`:'?'
      const claimerLines=final.map(nftId=>{
        const dev2=devices.find(d=>d.nftId===nftId)
        return `  ${nftId} (${walletSnip(dev2?.walletAddr??null)}) → $${(split/1000).toFixed(0)}K + ${rnsmEach} RNSM`
      }).join('\n')
      pendingAnnounce.current.push(`🏆 ${WIN_LABELS[wt]} — ROUND ${roundNum}\n${claimerLines}\n💸 Vault → wallets`)
      // Keep flickering:true so ALL unclaimed devices keep flickering this round
      // bursting:true marks the claiming devices for burst effect
      // broken:false — filament fires at next round start via drawNumber
      setWinStates(prev=>({...prev,[wt]:{...prev[wt],claimed:true,claimers:final,flickering:true,broken:false,bursting:true}}))
    },500)
  }

  const handleActivate=(devId:number)=>{
    setDevices(ds=>ds.map(d=>d.id!==devId?d:{...d,active:true}))
    const dev=devices.find(d=>d.id===devId)
    announce(`⚡ ${dev?.nftId} CONNECTED`)
  }

  const handleActivateAll=()=>{
    setDevices(ds=>ds.map(d=>({...d,active:true})))
    announce(`⚡ ALL ${devices.length} DEVICES CONNECTED`)
  }

  const mintDevices=()=>{
    const nd=Array.from({length:mintCount},(_,i)=>({...generateDevice(devices.length+i),walletAddr:wallet||'UNCONNECTED'}))
    setDevices(p=>[...p,...nd])
    announce(`⚡ ${mintCount} DEVICE${mintCount>1?'S':''} MINTED — BOUND TO ${(wallet||'WALLET').slice(0,8)}`)
  }

  const enterGame=()=>{
    // Clear all previous game state — fresh session
    setCalledNums(new Set());setCalledOrder([])
    setWinStates(defaultWinStates());setWinRecords([]);setRoundNum(0);setBankruptCount(0)
    setBankHacked(false);setClickWindowOpen(false);setShowEndScreen(false)
    drawnRef.current=new Set();drawLockRef.current=false
    pendingAnnounce.current=[];warnedRef.current=false
    stopSessionClock();setSessionSecs(0)
    setPhase('game');startPreGame(60);announce('🔴 HACK IN 60 SECONDS')
  }
  const terminateGame=()=>{
    stopMaster();stopSessionClock()
    try{localStorage.removeItem('ransome_state_v1')}catch{}
    setDevices([]);setCalledNums(new Set());setCalledOrder([]);setWinStates(defaultWinStates());setWinRecords([]);setBankHacked(false);setPreGameSecs(0)
    setShowTerminate(false);setPhase('lobby')
  }

  if(phase==='setup')return(
    <div style={{minHeight:'100vh',background:'#010810'}}>
      <NicknameModal onConfirm={name=>{setNickname(name);setPhase('lobby')}}/>
    </div>
  )

  // ── LOBBY ─────────────────────────────────────────────────────────────────
  if(phase==='lobby')return(
    <div style={{minHeight:'100vh',background:'#050f17',color:'#dce6f3',overflow:'hidden'}}>
      <div style={{position:'fixed',top:0,left:0,width:'100%',zIndex:50,height:56,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 24px',background:'rgba(5,10,23,0.9)',borderBottom:'1px solid rgba(0,229,160,0.1)',boxSizing:'border-box'}}>
        <div style={{display:'flex',alignItems:'center',gap:20}}>
          <span style={{fontSize:20,fontWeight:800,color:'#00e5a0'}}>RANSOME</span>
          <span style={{fontSize:10,color:'#00e5a0',borderBottom:'2px solid #00e5a0',paddingBottom:2}}>NETWORK: ONLINE</span>
          <span style={{fontSize:10,color:'rgba(0,229,160,0.35)'}}>ENCRYPTION: AES-256</span>
        </div>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          <div style={{background:'rgba(24,39,51,0.5)',padding:'4px 10px',border:'1px solid rgba(47,243,173,0.2)',fontSize:12,color:'#00e5a0',fontWeight:700}}>{fmtTime(lobbyCountdown)}</div>
          <div style={{fontSize:10,color:'#4a7fa5',background:'#0a1628',border:'1px solid #1e3a5f',borderRadius:6,padding:'4px 8px'}}>👤 {nickname}</div>
          {wallet?(<div style={{display:'flex',gap:6}}><div style={{background:'#0a1628',border:'1px solid rgba(0,229,160,0.25)',borderRadius:6,padding:'4px 8px',fontSize:9,color:'#00e5a0'}}>{wallet.slice(0,6)}…{wallet.slice(-4)}</div><button onClick={()=>disconnect()} style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.25)',borderRadius:6,padding:'4px 8px',fontSize:9,color:'#ef4444',cursor:'pointer'}}>✕</button></div>):(<WalletMultiButton style={{background:'linear-gradient(135deg,#00e5a0,#00b8ff)',color:'#000',borderRadius:6,fontSize:10,fontWeight:700,height:'auto',padding:'6px 12px'}}/>)}
        </div>
      </div>
      <div style={{display:'flex',paddingTop:56}}>
        <div style={{width:200,minHeight:'calc(100vh - 56px)',background:'#09141e',borderRight:'1px solid rgba(0,229,160,0.08)',display:'flex',flexDirection:'column',padding:'16px 0',flexShrink:0}}>
          <div style={{padding:'0 16px 16px',display:'flex',gap:8,alignItems:'center'}}>
            <div style={{width:32,height:32,background:'#13212c',border:'1px solid rgba(0,229,160,0.2)',display:'flex',alignItems:'center',justifyContent:'center'}}>🎭</div>
            <div><div style={{color:'#00e5a0',fontWeight:700,fontSize:10}}>OPERATIVE</div><div style={{color:'#4a6a7a',fontSize:9}}>{nickname.slice(0,10).toUpperCase()}</div></div>
          </div>
          {(['OPERATIVE','MISSIONS','NETWORK'] as const).map((item,i)=>(<div key={item} style={{padding:'10px 16px',cursor:'pointer',color:i===0?'#00e5a0':'#4a6a7a',fontWeight:i===0?700:400,fontSize:11,borderRight:i===0?'2px solid #00e5a0':'none',background:i===0?'rgba(0,229,160,0.06)':'transparent'}}>{['🎯 ','📋 ','🌐 '][i]}{item}</div>))}
          <div style={{marginTop:'auto',padding:'0 12px 16px'}}>
            {lobbyCountdown<=60&&devices.length>0?(<button onClick={enterGame} style={{width:'100%',padding:'8px 0',background:'linear-gradient(135deg,#ef4444,#dc2626)',color:'#fff',border:'none',fontSize:10,fontWeight:700,cursor:'pointer',animation:'ledBlink 0.6s infinite'}}>ENTER MATRIX</button>):(<div style={{padding:'8px',background:'rgba(0,229,160,0.06)',border:'1px solid rgba(0,229,160,0.2)',color:'#00e5a0',fontSize:9,textAlign:'center'}}>INITIALIZE_HEIST</div>)}
          </div>
        </div>
        <div style={{flex:1,padding:20,display:'grid',gridTemplateColumns:'1fr 300px',gap:16,alignItems:'start'}}>
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <div style={{background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.2)',padding:'10px 14px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div><div style={{fontSize:8,color:'#ef4444',marginBottom:2}}>🔴 LIVE NOW</div><div style={{fontSize:20,fontWeight:800,color:'#fff'}}>{BANKS[liveBank].name}</div><div style={{fontSize:8,color:'#2a5a7a'}}>{BANKS[liveBank].city} · {BANKS[liveBank].vault}</div></div>
              <div style={{textAlign:'right'}}><div style={{fontSize:22,fontWeight:800,color:'#00e5a0'}}>$1,000,000</div><div style={{fontSize:9,color:lobbyCountdown<=60?'#ef4444':'#2a5a7a',fontWeight:700}}>{lobbyCountdown<=60?'🚀 LAUNCHING':'NEXT: '+fmtTime(lobbyCountdown)}</div></div>
            </div>
            <div style={{position:'relative',background:'#09141e',border:'1px solid rgba(63,73,83,0.3)'}}>
              <div style={{position:'absolute',top:0,left:0,width:12,height:12,borderTop:'2px solid rgba(0,229,160,0.5)',borderLeft:'2px solid rgba(0,229,160,0.5)',zIndex:3}}/>
              <div style={{position:'absolute',top:0,right:0,width:12,height:12,borderTop:'2px solid rgba(0,229,160,0.5)',borderRight:'2px solid rgba(0,229,160,0.5)',zIndex:3}}/>
              <div style={{position:'absolute',bottom:0,left:0,width:12,height:12,borderBottom:'2px solid rgba(0,229,160,0.5)',borderLeft:'2px solid rgba(0,229,160,0.5)',zIndex:3}}/>
              <div style={{position:'absolute',bottom:0,right:0,width:12,height:12,borderBottom:'2px solid rgba(0,229,160,0.5)',borderRight:'2px solid rgba(0,229,160,0.5)',zIndex:3}}/>
              <WorldMapSketch currentHour={currentHour} onSelectBank={setSelectedBank}/>
              {selectedBank!==null&&(<div style={{padding:'8px 12px',display:'flex',justifyContent:'space-between',borderTop:'1px solid #0a2535'}}><div style={{fontSize:10,color:'#00e5a0',fontWeight:700}}>{BANKS[selectedBank].name}</div><div style={{fontSize:9,color:selectedBank===liveBank?'#22c55e':'#1e4a6a'}}>{selectedBank===liveBank?'🟢 LIVE':'SCHEDULED'}</div></div>)}
            </div>
            <div style={{background:'#0e1b25',border:'1px solid rgba(63,73,83,0.2)',padding:16}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}><span style={{fontSize:14,fontWeight:700,color:'#dce6f3'}}>💻 MINT_TERMINAL</span><span style={{fontSize:9,color:'#4a6a7a'}}>READY</span></div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,alignItems:'end'}}>
                <div><div style={{fontSize:9,color:'#4a6a7a',marginBottom:4}}>QTY</div><div style={{display:'flex',gap:3}}>{[1,3,5,10].map(n=>(<button key={n} onClick={()=>setMintCount(n)} style={{flex:1,padding:'7px 0',background:mintCount===n?'rgba(0,229,160,0.15)':'rgba(0,0,0,0.3)',border:'1px solid '+(mintCount===n?'rgba(0,229,160,0.5)':'rgba(63,73,83,0.3)'),color:mintCount===n?'#00e5a0':'#4a6a7a',fontSize:10,fontWeight:700,cursor:'pointer'}}>{n}</button>))}</div></div>
                <div><div style={{fontSize:9,color:'#4a6a7a',marginBottom:4}}>TOKEN</div><div style={{display:'flex',gap:3}}>{['SOL','USDT','RNSM'].map(t=>(<button key={t} onClick={()=>setMintToken(t)} style={{flex:1,padding:'7px 3px',background:mintToken===t?'rgba(0,229,160,0.15)':'rgba(0,0,0,0.3)',border:'1px solid '+(mintToken===t?'rgba(0,229,160,0.5)':'rgba(63,73,83,0.3)'),color:mintToken===t?'#00e5a0':'#4a6a7a',fontSize:9,fontWeight:700,cursor:'pointer'}}>{t}</button>))}</div></div>
                <div>{wallet?(<button onClick={mintDevices} style={{width:'100%',padding:'9px 0',background:'linear-gradient(135deg,#00e5a0,#00b8ff)',color:'#000',border:'none',fontSize:11,fontWeight:700,cursor:'pointer'}}>MINT →</button>):(<WalletMultiButton style={{width:'100%',background:'linear-gradient(135deg,#00e5a0,#00b8ff)',color:'#000',borderRadius:0,fontSize:10,fontWeight:700,height:'auto',padding:'9px 0'}}/>)}</div>
              </div>
            </div>
            <div><div style={{fontSize:8,color:'#1e4a6a',marginBottom:6}}>💬 LOBBY CHAT</div><ChatTerminal nickname={nickname}/></div>
          </div>
          <div style={{background:'#09141e',border:'1px solid rgba(63,73,83,0.2)',padding:16,display:'flex',flexDirection:'column',gap:12}}>
            <div style={{display:'flex',gap:8,alignItems:'center'}}><span style={{fontSize:14}}>💎</span><span style={{fontSize:14,fontWeight:700,color:'#dce6f3'}}>VAULT_STATUS</span></div>
            <div style={{position:'relative',background:'#050f17',border:'1px solid rgba(63,73,83,0.15)',minHeight:180}}>
              <div style={{position:'absolute',bottom:0,left:0,width:'100%',height:(lobbyFill*100)+'%',background:'linear-gradient(180deg,#2ff3ad,#00658e)',opacity:0.2,transition:'height 1s linear'}}/>
              <VaultSketch pct={lobbyFill} paid={Math.round(lobbyFill*1000000)}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
              <div style={{textAlign:'center'}}><div style={{fontSize:8,color:'#4a6a7a'}}>Operatives</div><div style={{fontSize:18,fontWeight:700,color:'#00e5a0'}}>2,104</div></div>
              <div style={{textAlign:'center'}}><div style={{fontSize:8,color:'#4a6a7a'}}>Success</div><div style={{fontSize:18,fontWeight:700,color:'#00b6fd'}}>92.4%</div></div>
            </div>
            {[{l:'LAST BREACH',v:'+450 SOL',c:'#00e5a0'},{l:'STABILITY',v:'OPTIMAL',c:'#00b6fd'},{l:'THREAT',v:'LOW',c:'#ff6daf'}].map(r=>(<div key={r.l} style={{display:'flex',justifyContent:'space-between',padding:'6px 8px',background:'#13212c',borderLeft:'2px solid '+r.c}}><span style={{fontSize:8,color:'#4a6a7a'}}>{r.l}</span><span style={{fontSize:9,color:r.c,fontWeight:700}}>{r.v}</span></div>))}
            <div style={{textAlign:'center',padding:'8px',background:'rgba(0,0,0,0.3)',border:'1px solid '+(lobbyCountdown<=60?'rgba(239,68,68,0.4)':'rgba(10,58,90,0.6)'),animation:lobbyCountdown<=60?'ledBlink 0.8s infinite':'none'}}>
              <div style={{fontSize:8,color:lobbyCountdown<=60?'#ef4444':'#2a5a7a',marginBottom:2}}>{lobbyCountdown<=60?'🚀 LAUNCHING':'⏳ NEXT BATCH'}</div>
              <div style={{fontSize:26,fontWeight:800,color:lobbyCountdown<=60?'#ef4444':'#fff'}}>{fmtTime(lobbyCountdown)}</div>
            </div>
            <div style={{textAlign:'center',fontSize:8,color:'#1e4a6a'}}>{devices.length>0?(<span style={{color:'#00e5a0'}}>⚡ {devices.length} DEVICE{devices.length>1?'S':''} READY</span>):(<span>MINT TO JOIN</span>)}</div>
            {lobbyCountdown<=60&&devices.length>0&&(<button onClick={enterGame} style={{width:'100%',padding:'9px 0',background:'linear-gradient(135deg,#ef4444,#dc2626)',color:'#fff',border:'none',fontSize:10,fontWeight:700,cursor:'pointer',animation:'ledBlink 0.6s infinite'}}>🚀 ENTER HACK MATRIX</button>)}
            {lobbyCountdown>60&&devices.length>0&&(<div style={{textAlign:'center',fontSize:8,color:'#1e4a6a'}}>Entry in {fmtTime(lobbyCountdown-60)}</div>)}
          </div>
        </div>
      </div>
      <div style={{position:'fixed',bottom:0,left:0,width:'100%',zIndex:50,height:28,display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0 16px',background:'#000',borderTop:'1px solid rgba(0,229,160,0.15)',boxSizing:'border-box'}}>
        <span style={{fontSize:9,color:'rgba(0,229,160,0.6)'}}>SYSTEM_BREACH_LOGS v2.4.0 · ACCESSING_NODE_01...</span>
        <div style={{display:'flex',gap:6,alignItems:'center'}}><div style={{width:6,height:6,borderRadius:'50%',background:'#00e5a0',animation:'ledBlink 2s infinite'}}/><span style={{fontSize:9,color:'#00e5a0'}}>SECURE_TUNNEL_ACTIVE</span></div>
      </div>
            {showEndScreen&&(
        <div style={{position:'fixed',inset:0,background:'rgba(1,8,16,0.96)',zIndex:200,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:16,padding:20}}>
          <div style={{fontFamily:'Syne,sans-serif',fontSize:28,fontWeight:800,color:'#00e5a0',textShadow:'0 0 30px #00e5a080',textAlign:'center'}}>
            {bankruptCount>=3?'🏆 ALL RANSOMS CLAIMED':'🚨 VAULT HIJACKED'}
          </div>
          <div style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#2a5a7a',letterSpacing:'0.1em'}}>
            SESSION SUMMARY — RETURNING TO LOBBY
          </div>
          <div style={{width:'100%',maxWidth:480,background:'#020d1a',border:'1px solid #0a3a5a',borderRadius:14,padding:16,display:'flex',flexDirection:'column',gap:8}}>
            {winRecords.length>0?(
              winRecords.map((r,i)=>(
                <div key={i} style={{borderBottom:'1px solid #0a2535',paddingBottom:6,marginBottom:2}}>
                  <div style={{fontFamily:'DM Mono,monospace',fontSize:8,color:LED_COLORS[r.wt],marginBottom:3}}>
                    {WIN_LABELS[r.wt]} — Round {r.round}
                  </div>
                  {r.claimers.map((cl,j)=>(
                    <div key={j} style={{display:'flex',justifyContent:'space-between',padding:'1px 8px'}}>
                      <span style={{fontFamily:'DM Mono,monospace',fontSize:7,color:'#4a7fa5'}}>{cl}</span>
                      <span style={{fontFamily:'DM Mono,monospace',fontSize:7,color:'#f59e0b'}}>${(r.split/1000).toFixed(0)}K + {r.rnsmEach} RNSM</span>
                    </div>
                  ))}
                </div>
              ))
            ):(
              <div style={{fontFamily:'DM Mono,monospace',fontSize:8,color:'#1e4a6a',textAlign:'center',padding:12}}>
                No ransoms claimed — vault transferred to treasury
              </div>
            )}
            <div style={{display:'flex',justifyContent:'space-between',paddingTop:4,borderTop:'1px solid #0a3a5a'}}>
              <span style={{fontFamily:'DM Mono,monospace',fontSize:7,color:'#1e4a6a'}}>TOTAL CLAIMED</span>
              <span style={{fontFamily:'DM Mono,monospace',fontSize:8,color:'#00e5a0',fontWeight:700}}>${(winRecords.reduce((s,r)=>s+r.split*r.claimers.length,0)/1000).toFixed(0)}K</span>
            </div>
          </div>
          <div style={{fontFamily:'DM Mono,monospace',fontSize:7,color:'#1e4a6a',animation:'ledBlink 1s infinite'}}>
            ⬡ ALL DEVICES DEACTIVATED — WIPING SESSION DATA…
          </div>
        </div>
      )}

      {announcement&&(
        <div style={{position:'fixed',bottom:20,left:'50%',transform:'translateX(-50%)',background:'#020d1a',border:'1px solid #00e5a040',borderRadius:10,padding:'10px 18px',fontFamily:'DM Mono,monospace',fontSize:10,color:'#00e5a0',zIndex:999,whiteSpace:'pre',boxShadow:'0 8px 24px rgba(0,0,0,0.5)',maxWidth:'90vw'}}>
          {announcement}
        </div>
      )}
    </div>
  )

  // ── GAME SCREEN ──────────────────────────────────────────────────────────
  if(devicesExpanded)return(
    <MaximizedDevices devices={devices} currentNum={currentNum} clickWindowOpen={clickWindowOpen}
      calledNums={calledNums} onCellClick={handleCellClick} onClaim={handleClaim} onActivate={handleActivate}
      winStates={winStates} bankruptCount={bankruptCount} timer={timer} totalTimer={totalTimer}
      liveBank={liveBank} onClose={()=>setDevicesExpanded(false)}/>
  )

  return(
    <div style={{background:'linear-gradient(180deg,#010810,#020d1a)',color:'#c8d8e8',minHeight:'100vh'}}>
      {/* Header */}
      <div style={{padding:'7px 12px',borderBottom:'1px solid #0a1f3a',display:'flex',alignItems:'center',background:'rgba(2,13,26,0.96)',backdropFilter:'blur(12px)',WebkitBackdropFilter:'blur(12px)',position:'sticky',top:0,zIndex:50}}>
        <div style={{fontFamily:'Syne,sans-serif',fontSize:17,fontWeight:800,color:'#00e5a0',flexShrink:0}}>RANSOME</div>
        <div style={{flex:1,margin:'0 10px',height:26,background:'rgba(0,229,160,0.02)',border:'1px dashed #0a2535',borderRadius:5,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <span style={{fontFamily:'DM Mono,monospace',fontSize:7,color:'#0a2535'}}>AD</span>
        </div>
        <div style={{display:'flex',gap:6,alignItems:'center',flexShrink:0,flexWrap:'wrap'}}>
          {preGameSecs>0&&<div style={{fontFamily:'DM Mono,monospace',fontSize:8,color:'#f59e0b',background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.25)',borderRadius:6,padding:'3px 7px'}}>⏱ {fmtTime(preGameSecs)}</div>}
          {onChainSession&&phase==='game'&&<div style={{fontFamily:'DM Mono,monospace',fontSize:7,color:'#00e5a0',background:'rgba(0,229,160,0.06)',border:'1px solid rgba(0,229,160,0.2)',borderRadius:6,padding:'3px 6px'}}>
            ⛓ {onChainSession.drawCount}/90 on-chain
          </div>}
          {phase==='game'&&preGameSecs===0&&<div style={{fontFamily:'DM Mono,monospace',fontSize:7,color:sessionSecs>=(57*60)?'#ef4444':'#2a5a7a',background:sessionSecs>=(57*60)?'rgba(239,68,68,0.08)':'transparent',border:sessionSecs>=(57*60)?'1px solid rgba(239,68,68,0.25)':'none',borderRadius:6,padding:'3px 6px',transition:'all 0.5s'}}>
            {sessionSecs>=(57*60)?'🚨':'⏱'} {String(Math.floor(sessionSecs/60)).padStart(2,'0')}:{String(sessionSecs%60).padStart(2,'0')}
          </div>}
          <div style={{fontFamily:'DM Mono,monospace',fontSize:8,color:'#ef4444',background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:6,padding:'3px 7px'}}>🔴 {BANKS[liveBank].name}</div>
          <div style={{fontFamily:'DM Mono,monospace',fontSize:8,color:'#4a7fa5',background:'#0a1628',borderRadius:6,padding:'3px 7px'}}>👤 {nickname}</div>
          {wallet?(
            <div style={{display:'flex',alignItems:'center',gap:3}}>
              <div style={{fontFamily:'DM Mono,monospace',fontSize:7,color:'#00e5a0',background:'#0a1628',border:'1px solid #00e5a030',borderRadius:6,padding:'3px 7px',display:'flex',alignItems:'center',gap:4}}>
                <div style={{width:4,height:4,borderRadius:'50%',background:'#22c55e'}}/>
                {wallet.slice(0,6)}…{wallet.slice(-4)}
              </div>
              <button onClick={()=>disconnect()} style={{background:'transparent',border:'1px solid rgba(239,68,68,0.2)',borderRadius:6,padding:'3px 6px',color:'#ef4444',cursor:'pointer',fontSize:9,lineHeight:1}}>✕</button>
            </div>
          ):(
            <WalletMultiButton style={{background:'linear-gradient(135deg,#00e5a0,#00b8ff)',color:'#000',borderRadius:6,fontFamily:'DM Mono,monospace',fontSize:7.5,fontWeight:700,height:'auto',padding:'4px 8px'}}/>
          )}
        </div>
      </div>

      {/* Responsive layout: 3-col on wide, stacked on mobile */}
      <div style={{padding:'10px 12px 0',display:'grid',
        gridTemplateColumns:'minmax(0,1fr) minmax(0,200px) minmax(0,220px)',
        gridTemplateAreas:'"matrix stats chat"',
        gap:10,alignItems:'start'}}
        className="game-grid">
        <div style={{gridArea:'matrix',minWidth:0}}>
          <HackMatrixDisplay calledNums={calledNums} calledOrder={calledOrder} clickWindowOpen={clickWindowOpen} preGameSecs={preGameSecs} winRecords={winRecords} liveBank={liveBank} contractAddr={contractAddr} timer={timer} totalTimer={totalTimer}/>
        </div>
        <div style={{gridArea:'stats',minWidth:0}}>
          <GameStats devices={devices} calledNums={calledNums} bankruptCount={bankruptCount} liveBank={liveBank} nickname={nickname} winStates={winStates} contractAddr={contractAddr} setContractAddr={setContractAddr}/>
        </div>
        <div style={{gridArea:'chat',minWidth:0}}>
          <ChatTerminal nickname={nickname}/>
        </div>
      </div>

      {/* Win strip */}
      <div style={{margin:'8px 12px 0',padding:'4px 8px',display:'flex',gap:4,overflowX:'auto',borderRadius:10,background:'rgba(2,13,26,0.7)',border:'1px solid #0a1f3a'}}>
        {(Object.entries(WIN_LABELS) as [WinType,string][]).map(([type,label])=>{
          const st=winStates[type]
          return(
            <div key={type} style={{display:'flex',gap:3,alignItems:'center',padding:'3px 6px',borderRadius:6,flexShrink:0,
              background:st.claimed?'rgba(34,197,94,0.08)':st.claimable?'rgba(236,72,153,0.08)':'transparent',
              border:st.claimed?'1px solid rgba(34,197,94,0.25)':st.expired?'1px solid rgba(127,0,0,0.3)':st.claimable?'1px solid rgba(236,72,153,0.35)':'1px solid transparent'}}>
              <div style={{width:7,height:5,borderRadius:1,background:st.expired?'#3f1010':LED_COLORS[type],opacity:st.claimed?0.3:st.expired?0.4:1,
                animation:st.broken?'none':st.expired?'ledExpire 0.4s ease forwards':st.flickering?'rapidFlicker 0.08s infinite':st.claimable&&!st.claimed?'ledBlink 0.6s infinite':'none',
                boxShadow:st.claimable&&!st.claimed&&!st.expired?`0 0 4px ${LED_COLORS[type]}`:'none'}}/>
              <span style={{fontFamily:'DM Mono,monospace',fontSize:6.5,color:st.claimed?'#22c55e':st.claimable?'#ec4899':'#1e4a6a',whiteSpace:'nowrap'}}>
                {st.claimed?'✓ ':st.claimable?'⚡ ':'○ '}{label}
              </span>
            </div>
          )
        })}
      </div>

      {/* Devices section: 2 cols normal, maximize opens full screen */}
      <div style={{padding:'10px 12px 20px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <div style={{fontFamily:'DM Mono,monospace',fontSize:8,color:'#1e4a6a'}}>
            ◈ NFT DEVICES &nbsp;<span style={{color:'#2a5a7a'}}>{devices.length} total · {devices.filter(d=>d.active).length} active</span>
          </div>
          <div style={{display:'flex',gap:5,alignItems:'center'}}>
            <button onClick={handleActivateAll} style={{background:'#0a1628',border:'1px solid #00e5a030',color:'#00e5a0',borderRadius:7,padding:'4px 9px',fontFamily:'DM Mono,monospace',fontSize:7.5,cursor:'pointer'}}>
              ⚡ ALL ON
            </button>
            <button onClick={()=>setDevicesExpanded(true)} style={{background:'#0a1628',border:'1px solid #1e3a5f',color:'#2a5a7a',borderRadius:7,padding:'4px 10px',fontFamily:'DM Mono,monospace',fontSize:7.5,cursor:'pointer'}}>
              ⊞ MAXIMIZE
            </button>
            <button onClick={()=>setShowTerminate(true)} style={{background:'rgba(127,0,0,0.25)',border:'1px solid #7f0000',color:'#ef4444',borderRadius:7,padding:'4px 9px',fontFamily:'DM Mono,monospace',fontSize:7.5,cursor:'pointer',letterSpacing:'0.05em'}}>
              ⏻ TERMINATE
            </button>
          </div>
        </div>
        {/* 2 columns, ALL devices scroll down */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:10}}>
          {devices.map(d=>(
            <HackingDevice key={d.id} device={d} currentNum={currentNum} clickWindowOpen={clickWindowOpen}
              calledNums={calledNums} onCellClick={handleCellClick} onClaim={handleClaim} onActivate={handleActivate}
              winStates={winStates} bankruptCount={bankruptCount} timer={timer} totalTimer={totalTimer} liveBank={liveBank}/>
          ))}
        </div>
      </div>

      {announcement&&(
        <div style={{position:'fixed',top:52,left:'50%',transform:'translateX(-50%)',background:'#020d1a',border:'1px solid #00e5a040',borderRadius:10,padding:'9px 16px',fontFamily:'DM Mono,monospace',fontSize:10,color:'#00e5a0',zIndex:999,whiteSpace:'pre',boxShadow:'0 8px 24px rgba(0,0,0,0.5)',animation:'slideDown 0.3s ease',maxWidth:'90vw'}}>
          {announcement}
        </div>
      )}

      {/* ── TERMINATE WARNING MODAL ── */}
      {showTerminate&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}
          onClick={e=>{if(e.target===e.currentTarget)setShowTerminate(false)}}>
          <div style={{background:'#0a0505',border:'2px solid #7f0000',borderRadius:16,padding:28,maxWidth:360,width:'100%',
            boxShadow:'0 0 60px rgba(239,68,68,0.2),inset 0 0 40px rgba(127,0,0,0.08)'}}>
            {/* Header */}
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
              <div style={{width:36,height:36,borderRadius:'50%',background:'rgba(239,68,68,0.12)',border:'2px solid #ef4444',
                display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>⚠</div>
              <div>
                <div style={{fontFamily:'Syne,sans-serif',fontSize:16,fontWeight:800,color:'#ef4444',letterSpacing:'0.05em'}}>TERMINATE SESSION</div>
                <div style={{fontFamily:'DM Mono,monospace',fontSize:7.5,color:'#7f2020',marginTop:2}}>WALLET · {wallet||nickname}</div>
              </div>
            </div>
            {/* Warning body */}
            <div style={{background:'rgba(127,0,0,0.12)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:8,padding:'12px 14px',marginBottom:18}}>
              <div style={{fontFamily:'DM Mono,monospace',fontSize:8,color:'#ef4444',marginBottom:8,letterSpacing:'0.1em'}}>⚠ WARNING — IRREVERSIBLE ACTION</div>
              {[
                'All minted NFT devices will be deactivated',
                'Current game session & progress will be wiped',
                'Unclaimed prizes for this wallet are forfeited',
                'Saved state will be cleared from this browser',
                'You will return to the lobby screen',
              ].map((line,i)=>(
                <div key={i} style={{display:'flex',gap:7,alignItems:'flex-start',marginBottom:4}}>
                  <span style={{color:'#7f2020',flexShrink:0,marginTop:1}}>›</span>
                  <span style={{fontFamily:'DM Mono,monospace',fontSize:7.5,color:'#a05050',lineHeight:1.5}}>{line}</span>
                </div>
              ))}
            </div>
            {/* Buttons */}
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>setShowTerminate(false)}
                style={{flex:1,background:'#0a1628',border:'1px solid #1e3a5f',color:'#4a7fa5',borderRadius:8,
                  padding:'10px',fontFamily:'DM Mono,monospace',fontSize:8,cursor:'pointer',letterSpacing:'0.05em'}}>
                ABORT
              </button>
              <button onClick={terminateGame}
                style={{flex:1,background:'linear-gradient(135deg,#3f0000,#200000)',border:'2px solid #ef4444',color:'#ef4444',
                  borderRadius:8,padding:'10px',fontFamily:'Syne,sans-serif',fontSize:11,fontWeight:800,cursor:'pointer',
                  letterSpacing:'0.1em',boxShadow:'0 0 16px rgba(239,68,68,0.25)',animation:'ransomPulse 2s infinite'}}>
                ⏻ CONFIRM TERMINATE
              </button>
            </div>
            <div style={{fontFamily:'DM Mono,monospace',fontSize:6.5,color:'#3f1010',textAlign:'center',marginTop:10}}>
              click outside to dismiss · this action cannot be undone
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// tiny clamp helper (returns px string)
function clamp(min:number,val:number,unit:string){return`clamp(${min}px,${val}${unit},${min+8}px)`}
// RNSM tokens allocated per win type (split equally among winning devices for that round)
const RNSM_ALLOC:Record<WinType,number>={EARLY_FIVE:500,TOP_LINE:1000,MIDDLE_LINE:1000,BOTTOM_LINE:1000,FULL_HOUSE_1:2500,FULL_HOUSE_2:2500,FULL_HOUSE_3:1500}
