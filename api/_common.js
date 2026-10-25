const JSON_HEADERS={
  "content-type":"application/json; charset=utf-8",
  "cache-control":"no-store",
  "x-content-type-options":"nosniff"
};

function send(res,status,payload){
  res.statusCode=status;
  for(const[k,v]of Object.entries(JSON_HEADERS))res.setHeader(k,v);
  res.end(JSON.stringify(payload));
}

async function fetchJson(url,init={}){
  const started=Date.now();
  const response=await fetch(url,{
    ...init,
    signal:AbortSignal.timeout(8000),
    headers:{"user-agent":"Red-Dagger-Cockpit/3.0",...(init.headers||{})}
  });
  const text=await response.text();
  let data=null;
  try{data=text?JSON.parse(text):null}catch{data={raw_text:text.slice(0,4000)}}
  return{ok:response.ok,status:response.status,elapsed_ms:Date.now()-started,data};
}

function safeIso(value){
  if(value===null||value===undefined||value==="")return null;
  try{
    if(typeof value==="number"||/^\d{10,16}$/.test(String(value))){
      let n=Number(value);
      if(!Number.isFinite(n))return null;
      if(n<1e12)n*=1000;
      if(n>1e15)n=Math.floor(n/1e6);
      const d=new Date(n);
      return Number.isNaN(d.getTime())?null:d.toISOString();
    }
    const d=new Date(value);
    return Number.isNaN(d.getTime())?null:d.toISOString();
  }catch{return null}
}

function freshnessSeconds(value,nowMs=Date.now()){
  const iso=safeIso(value);
  if(!iso)return null;
  const ms=Date.parse(iso);
  if(!Number.isFinite(ms))return null;
  return Math.max(0,Math.floor((nowMs-ms)/1000));
}

function meta(provider,state,extra={}){
  const retrievedAt=new Date().toISOString();
  const observedAt=safeIso(extra.observed_at);
  const publishedAt=safeIso(extra.published_at);
  const freshness=extra.freshness_seconds??freshnessSeconds(observedAt||publishedAt,Date.parse(retrievedAt));
  return{
    provider,
    source_type:extra.source_type||null,
    retrieval_state:state,
    retrieved_at:retrievedAt,
    delay_state:extra.delay_state||"UNKNOWN",
    freshness_seconds:freshness,
    observed_at:observedAt,
    published_at:publishedAt,
    source_url:extra.source_url||null,
    elapsed_ms:extra.elapsed_ms??null
  };
}

function cleanSymbol(value){
  const symbol=String(value||"").trim().toUpperCase();
  return/^[A-Z0-9.\-]{1,15}$/.test(symbol)?symbol:null;
}

function queryParams(req){
  try{return new URL(String(req.url||"/"),"https://red-dagger.local").searchParams}
  catch{return new URLSearchParams()}
}

function normalizeSecret(raw,names=[]){
  let value=String(raw||"").trim();
  if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1).trim();
  for(const name of names){
    const p=name+"=";
    if(value.startsWith(p)){value=value.slice(p.length).trim();break}
  }
  value=value.replace(/^(Bearer|token)\s+/i,"").trim();
  return value;
}

function envFirst(...names){
  for(const name of names){
    const raw=process.env[name];
    if(!raw)continue;
    const value=normalizeSecret(raw,names);
    if(value)return value;
  }
  return null;
}

module.exports={send,fetchJson,meta,cleanSymbol,queryParams,envFirst,normalizeSecret,safeIso,freshnessSeconds};
