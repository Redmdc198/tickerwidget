const{send,fetchJson,meta,cleanSymbol,queryParams,envFirst,safeIso}=require("./_common");
const BASE="https://api.massive.com";

module.exports=async function handler(req,res){
  if(req.method!=="GET")return send(res,405,{error:"METHOD_NOT_ALLOWED"});
  const params=queryParams(req);
  const token=envFirst("MASSIVE_API_KEY","MASSIVE_API","MASSIVE_TOKEN","MASSIVE_KEY");
  if(!token)return send(res,503,{data:null,meta:meta("Massive","NOT_CONFIGURED")});

  const action=String(params.get("action")||"snapshot").toLowerCase();
  const rawSymbol=params.get("symbol");
  const symbol=rawSymbol?cleanSymbol(rawSymbol):null;
  if(rawSymbol&&!symbol)return send(res,400,{error:"INVALID_SYMBOL"});

  let path;
  if(action==="snapshot"){
    if(!symbol)return send(res,400,{error:"SYMBOL_REQUIRED"});
    path="/v2/snapshot/locale/us/markets/stocks/tickers/"+encodeURIComponent(symbol);
  }else if(action==="prev"){
    if(!symbol)return send(res,400,{error:"SYMBOL_REQUIRED"});
    path="/v2/aggs/ticker/"+encodeURIComponent(symbol)+"/prev";
  }else if(action==="gainers"||action==="losers"){
    path="/v2/snapshot/locale/us/markets/stocks/"+action;
  }else if(action==="news"){
    const p=new URLSearchParams({
      limit:String(Math.max(1,Math.min(20,Number(params.get("limit")||8)))),
      order:"desc",
      sort:"published_utc"
    });
    if(symbol)p.set("ticker",symbol);
    path="/v2/reference/news?"+p.toString();
  }else{
    return send(res,400,{error:"UNSUPPORTED_ACTION",supported:["snapshot","prev","gainers","losers","news"]});
  }

  const sourceUrl=BASE+path;
  let result=await fetchJson(sourceUrl,{headers:{Authorization:"Bearer "+token}});
  let auth_mode="bearer";

  if(result.status===401){
    const join=sourceUrl.includes("?")?"&":"?";
    result=await fetchJson(sourceUrl+join+"apiKey="+encodeURIComponent(token));
    auth_mode="query_fallback";
  }

  if(!result.ok){
    const state=result.status===403?"NOT_ENTITLED":"SOURCE_ERROR";
    return send(res,result.status===403?403:502,{
      data:null,
      meta:meta("Massive",state,{source_type:action.toUpperCase(),source_url:sourceUrl,elapsed_ms:result.elapsed_ms}),
      upstream_status:result.status,
      auth_mode
    });
  }

  let observedAt=null;
  if(action==="prev")observedAt=safeIso(result.data?.results?.[0]?.t||null);
  else{
    const stamp=result.data?.ticker?.updated||result.data?.results?.[0]?.last_trade?.last_updated||result.data?.results?.[0]?.t||null;
    observedAt=safeIso(stamp);
  }

  return send(res,200,{
    symbol,
    action,
    data:result.data,
    meta:meta("Massive","VALID",{
      source_type:action.toUpperCase(),
      source_url:sourceUrl,
      observed_at:observedAt,
      elapsed_ms:result.elapsed_ms,
      delay_state:"UNKNOWN"
    }),
    auth_mode
  });
};
