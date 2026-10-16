(()=>{
  const $=s=>document.querySelector(s);
  let activeSymbol="SPY";
  let refreshSeq=0;

  function esc(value){
    return String(value??"")
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#39;");
  }

  function safeUrl(value){
    try{
      const u=new URL(String(value||""));
      return(u.protocol==="https:"||u.protocol==="http:")?u.href:null;
    }catch{return null}
  }

  function fmtTime(iso){
    if(!iso)return"—";
    try{
      return new Intl.DateTimeFormat("en-US",{
        timeZone:"America/New_York",
        hour:"numeric",
        minute:"2-digit",
        second:"2-digit"
      }).format(new Date(iso))+" ET";
    }catch{return"—"}
  }

  function fmtDate(iso){
    if(!iso)return"—";
    try{
      return new Intl.DateTimeFormat("en-US",{
        timeZone:"America/New_York",
        month:"short",
        day:"numeric",
        year:"numeric"
      }).format(new Date(iso));
    }catch{return"—"}
  }

  function fmtAgeSeconds(seconds){
    const n=Number(seconds);
    if(!Number.isFinite(n))return"UNKNOWN";
    if(n<60)return Math.max(0,Math.floor(n))+"s";
    if(n<3600)return Math.floor(n/60)+"m";
    if(n<86400)return Math.floor(n/3600)+"h";
    return Math.floor(n/86400)+"d";
  }

  function computedAge(meta){
    if(Number.isFinite(Number(meta?.freshness_seconds)))return fmtAgeSeconds(meta.freshness_seconds);
    const basis=meta?.observed_at||meta?.published_at;
    if(!basis)return"UNKNOWN";
    const ms=Date.now()-Date.parse(basis);
    return Number.isFinite(ms)?fmtAgeSeconds(Math.max(0,ms/1000)):"UNKNOWN";
  }

  function stateClass(state){
    if(state==="VALID"||state==="PUBLIC_WIDGETS")return"rd-state-good";
    if(["NOT_CONFIGURED","NOT_ENTITLED","SOURCE_ERROR","STALE","MISSING"].includes(state))return"rd-state-bad";
    return"rd-state-warn";
  }

  async function getJSON(url){
    const r=await fetch(url,{cache:"no-store"});
    let j=null;
    try{j=await r.json()}catch{}
    if(!j)throw new Error("HTTP "+r.status);
    return j;
  }

  function metaLine(meta,label){
    const basis=meta?.observed_at||meta?.published_at;
    const basisName=label||(meta?.observed_at?"Observed":"Published");
    const elapsed=Number.isFinite(Number(meta?.elapsed_ms))?Number(meta.elapsed_ms)+"ms":"—";
    return '<div class="rd-meta-line">'+
      '<span>'+esc(basisName)+': '+esc(fmtTime(basis))+'</span>'+
      '<span>Retrieved: '+esc(fmtTime(meta?.retrieved_at))+'</span>'+
      '<span>Age: '+esc(computedAge(meta))+'</span>'+
      '<span>RTT: '+esc(elapsed)+'</span>'+
      '<span>Delay: '+esc(meta?.delay_state||"UNKNOWN")+'</span>'+
    '</div>';
  }

  function endpointSnapshot(label,settled){
    if(settled?.status==="fulfilled"){
      const m=settled.value?.meta||{};
      return{
        label,
        state:m.retrieval_state||"UNKNOWN",
        delay:m.delay_state||"UNKNOWN",
        retrieved:m.retrieved_at||null,
        elapsed:m.elapsed_ms
      };
    }
    return{label,state:"SOURCE_ERROR",delay:"UNKNOWN",retrieved:null,elapsed:null};
  }

  function renderProviderStatus(statusSettled,quote,massive,news,halts){
    const mount=$("#rdProviderHealth");
    if(!mount)return;
    const rows=[
      endpointSnapshot("Finnhub Quote",quote),
      endpointSnapshot("Massive Prev-Day",massive),
      endpointSnapshot("Benzinga News",news),
      endpointSnapshot("Benzinga Halts",halts)
    ];
    const tv=statusSettled?.status==="fulfilled"?statusSettled.value?.providers?.tradingview:null;
    rows.push({
      label:"TradingView Widgets",
      state:tv?.state||"PUBLIC_WIDGETS",
      delay:tv?.delay_state||"EXCHANGE_DEPENDENT",
      retrieved:statusSettled?.value?.retrieved_at||null,
      elapsed:null
    });
    mount.innerHTML=rows.map(row=>{
      const tail=[
        row.delay,
        row.retrieved?"checked "+fmtTime(row.retrieved):null,
        Number.isFinite(Number(row.elapsed))?Number(row.elapsed)+"ms":null
      ].filter(Boolean).join(" · ");
      return '<div class="rd-health-row">'+
        '<strong>'+esc(row.label)+'</strong>'+
        '<span class="'+stateClass(row.state)+'">'+esc(row.state)+'</span>'+
        '<small>'+esc(tail)+'</small>'+
      '</div>';
    }).join("");
  }

  function renderFinnhub(payload,symbol){
    const mount=$("#rdQuoteIntel");
    if(!mount)return;
    const m=payload?.meta||{};
    if(m.retrieval_state!=="VALID"){
      mount.innerHTML='<div class="rd-empty"><strong>'+esc(symbol)+'</strong> · Finnhub '+esc(m.retrieval_state||"UNAVAILABLE")+'</div>'+metaLine(m);
      return;
    }
    const q=payload.data||{};
    const price=Number.isFinite(Number(q.c))?Number(q.c).toFixed(4):"—";
    const pct=Number.isFinite(Number(q.dp))?Number(q.dp).toFixed(2)+"%":"—";
    mount.innerHTML=
      '<div class="rd-kpi"><span>Symbol</span><strong>'+esc(symbol)+'</strong></div>'+
      '<div class="rd-kpi"><span>Last</span><strong>'+esc(price)+'</strong></div>'+
      '<div class="rd-kpi"><span>Change</span><strong>'+esc(pct)+'</strong></div>'+
      '<div class="rd-kpi"><span>Observed</span><strong>'+esc(fmtTime(m.observed_at))+'</strong></div>'+
      '<div class="rd-kpi"><span>Freshness</span><strong>'+esc(computedAge(m))+'</strong></div>'+
      '<div class="rd-kpi"><span>Delay</span><strong class="'+stateClass(m.retrieval_state)+'">'+esc(m.delay_state||"UNKNOWN")+'</strong></div>'+
      metaLine(m,"Observed");
  }

  function renderMassive(payload,symbol){
    const mount=$("#rdMassiveIntel");
    if(!mount)return;
    const m=payload?.meta||{};
    if(m.retrieval_state!=="VALID"){
      mount.innerHTML='<div class="rd-empty"><strong>'+esc(symbol)+'</strong> · Massive '+esc(m.retrieval_state||"UNAVAILABLE")+'</div>'+metaLine(m);
      return;
    }
    const r=Array.isArray(payload.data?.results)?payload.data.results[0]:null;
    if(!r){
      mount.innerHTML='<div class="rd-empty">Massive returned a valid response with no previous-day bar.</div>'+metaLine(m);
      return;
    }
    const fmt=n=>Number.isFinite(Number(n))?Number(n).toFixed(4):"—";
    const vol=Number.isFinite(Number(r.v))?Number(r.v).toLocaleString():"—";
    mount.innerHTML=
      '<div class="rd-kpi"><span>Symbol</span><strong>'+esc(symbol)+'</strong></div>'+
      '<div class="rd-kpi"><span>Prev Close</span><strong>'+esc(fmt(r.c))+'</strong></div>'+
      '<div class="rd-kpi"><span>Prev High / Low</span><strong>'+esc(fmt(r.h)+" / "+fmt(r.l))+'</strong></div>'+
      '<div class="rd-kpi"><span>Prev Volume</span><strong>'+esc(vol)+'</strong></div>'+
      '<div class="rd-kpi"><span>Session</span><strong>'+esc(fmtDate(m.observed_at))+'</strong></div>'+
      '<div class="rd-kpi"><span>Lane</span><strong>Previous Day</strong></div>'+
      metaLine(m,"Session");
  }

  function rowsFrom(data){
    if(Array.isArray(data))return data;
    if(Array.isArray(data?.data))return data.data;
    if(Array.isArray(data?.results))return data.results;
    return[];
  }

  function newsType(row){
    const tags=Array.isArray(row?.tags)?row.tags.map(x=>String(x?.name||x).toLowerCase()):[];
    const channels=Array.isArray(row?.channels)?row.channels.map(x=>String(x?.name||x).toLowerCase()):[];
    if(tags.some(x=>x.includes("why it")||x.includes("wiim")))return"WIIM";
    if(channels.some(x=>x.includes("press release")))return"PR";
    return"NEWS";
  }

  function renderNews(payload,symbol){
    const mount=$("#rdCatalystIntel");
    if(!mount)return;
    const m=payload?.meta||{};
    if(m.retrieval_state!=="VALID"){
      mount.innerHTML='<div class="rd-empty"><strong>'+esc(symbol)+'</strong> · Benzinga '+esc(m.retrieval_state||"UNAVAILABLE")+'</div>'+metaLine(m);
      return;
    }
    const rows=rowsFrom(payload.data).slice(0,6);
    if(!rows.length){
      mount.innerHTML='<div class="rd-empty">No returned Benzinga headlines for <strong>'+esc(symbol)+'</strong>. This is not equivalent to “no catalyst.”</div>'+metaLine(m,"Latest item");
      return;
    }
    mount.innerHTML=metaLine(m,"Latest item")+rows.map(row=>{
      const when=row.created||row.updated||row.published||row.published_at||null;
      const title=row.title||row.headline||"Untitled item";
      const href=safeUrl(row.url);
      const rank=Number.isFinite(Number(row.importance_rank))?" · importance "+Number(row.importance_rank):"";
      return '<article class="rd-news-row">'+
        '<div><span class="rd-event-chip">'+esc(newsType(row))+'</span><strong>'+esc(title)+'</strong>'+
        '<small>'+esc(when?fmtTime(when):"time unavailable")+' · Benzinga'+esc(rank)+'</small></div>'+
        (href?'<a href="'+esc(href)+'" target="_blank" rel="noopener">SOURCE</a>':"")+
      '</article>';
    }).join("");
  }

  function haltLabel(row){
    return row?.status||row?.type||row?.signal||row?.action||row?.event||"HALT / RESUME";
  }

  function haltWhen(row){
    return row?.halt_time||row?.resume_time||row?.created||row?.updated||row?.date||row?.time||row?.timestamp||null;
  }

  function renderHalts(payload,symbol){
    const mount=$("#rdHaltIntel");
    if(!mount)return;
    const m=payload?.meta||{};
    if(m.retrieval_state!=="VALID"){
      mount.innerHTML='<div class="rd-empty"><strong>'+esc(symbol)+'</strong> · Halt feed '+esc(m.retrieval_state||"UNAVAILABLE")+'</div>'+metaLine(m,"Event");
      return;
    }
    const rows=rowsFrom(payload.data).slice(0,4);
    if(!rows.length){
      mount.innerHTML='<div class="rd-halt-clear"><strong>'+esc(symbol)+'</strong><span>No halt/resume record returned on this request.</span><small>Valid empty response; do not treat it as a guarantee against a future halt.</small></div>'+metaLine(m,"Event");
      return;
    }
    mount.innerHTML=metaLine(m,"Event")+rows.map(row=>{
      const reason=row?.reason||row?.halt_reason||row?.description||row?.code||"";
      return '<div class="rd-halt-row">'+
        '<strong>'+esc(haltLabel(row))+'</strong>'+
        '<span>'+esc(haltWhen(row)?fmtTime(haltWhen(row)):"time unavailable")+'</span>'+
        (reason?'<small>'+esc(reason)+'</small>':"")+
      '</div>';
    }).join("");
  }

  function setRefreshState(loading,symbol){
    const button=$("#rdRefreshBtn");
    const stamp=$("#rdRefreshStamp");
    if(button){
      button.disabled=loading;
      button.textContent=loading?"Refreshing "+symbol+"…":"Refresh intelligence";
    }
    if(stamp&&loading)stamp.textContent="Fetching server-backed evidence…";
  }

  async function refresh(symbol){
    activeSymbol=String(symbol||"SPY").toUpperCase();
    const seq=++refreshSeq;
    setRefreshState(true,activeSymbol);

    const settled=await Promise.allSettled([
      getJSON("/api/status"),
      getJSON("/api/finnhub?action=quote&symbol="+encodeURIComponent(activeSymbol)),
      getJSON("/api/massive?action=prev&symbol="+encodeURIComponent(activeSymbol)),
      getJSON("/api/benzinga?action=news&symbol="+encodeURIComponent(activeSymbol)+"&limit=8"),
      getJSON("/api/benzinga?action=halts&symbol="+encodeURIComponent(activeSymbol))
    ]);

    if(seq!==refreshSeq)return;
    const[status,quote,massive,news,halts]=settled;

    renderProviderStatus(status,quote,massive,news,halts);
    if(quote.status==="fulfilled")renderFinnhub(quote.value,activeSymbol);
    if(massive.status==="fulfilled")renderMassive(massive.value,activeSymbol);
    if(news.status==="fulfilled")renderNews(news.value,activeSymbol);
    if(halts.status==="fulfilled")renderHalts(halts.value,activeSymbol);

    const button=$("#rdRefreshBtn");
    const stamp=$("#rdRefreshStamp");
    if(button){
      button.disabled=false;
      button.textContent="Refresh intelligence";
    }
    if(stamp)stamp.textContent="Last refresh: "+fmtTime(new Date().toISOString())+" · "+activeSymbol+" · manual/symbol-change refresh";
  }

  function init(){
    const button=$("#rdRefreshBtn");
    if(button)button.addEventListener("click",()=>refresh(activeSymbol));
  }

  init();
  window.RedDaggerProviderCockpit={refresh};
})();
