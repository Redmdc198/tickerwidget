const{send,fetchJson,meta,cleanSymbol,queryParams,envFirst,safeIso}=require("./_common");
const BASE="https://api.benzinga.com";

function endpoint(action,symbol,params){
  const size=Math.max(1,Math.min(50,Number(params.get("limit")||20)));
  if(action==="news"){
    const p=new URLSearchParams({pageSize:String(size)});
    if(symbol)p.set("tickers",symbol);
    return"/api/v2/news?"+p.toString();
  }
  if(action==="halts"){
    const p=new URLSearchParams();
    if(symbol)p.set("tickers",symbol);
    return"/api/v1/signal/halt_resume?"+p.toString();
  }
  if(action==="movers"){
    const p=new URLSearchParams();
    const session=params.get("session");
    if(session)p.set("session",String(session));
    return"/api/v1/market/movers?"+p.toString();
  }
  return null;
}

function listRows(data){
  if(Array.isArray(data))return data;
  if(Array.isArray(data?.data))return data.data;
  if(Array.isArray(data?.results))return data.results;
  return[];
}

function latestPublished(action,data){
  if(action!=="news")return null;
  let latest=0;
  for(const row of listRows(data)){
    const iso=safeIso(row?.created||row?.updated||row?.published||row?.published_at||null);
    if(!iso)continue;
    latest=Math.max(latest,Date.parse(iso)||0);
  }
  return latest?new Date(latest).toISOString():null;
}

module.exports=async function handler(req,res){
  if(req.method!=="GET")return send(res,405,{error:"METHOD_NOT_ALLOWED"});
  const params=queryParams(req);
  const token=envFirst("BENZINGA_API_KEY","BENZINGA_API","BAZINGA_API_KEY","BAZINGA_API");
  if(!token)return send(res,503,{data:null,meta:meta("Benzinga","NOT_CONFIGURED")});

  const action=String(params.get("action")||"news").toLowerCase();
  const rawSymbol=params.get("symbol");
  const symbol=rawSymbol?cleanSymbol(rawSymbol):null;
  if(rawSymbol&&!symbol)return send(res,400,{error:"INVALID_SYMBOL"});

  const path=endpoint(action,symbol,params);
  if(!path)return send(res,400,{error:"UNSUPPORTED_ACTION",supported:["news","halts","movers"]});

  const sourceUrl=BASE+path;
  let result=await fetchJson(sourceUrl,{headers:{Authorization:"token "+token,Accept:"application/json"}});
  let auth_mode="header";

  if(result.status===401){
    const join=sourceUrl.includes("?")?"&":"?";
    result=await fetchJson(sourceUrl+join+"token="+encodeURIComponent(token),{headers:{Accept:"application/json"}});
    auth_mode="query_fallback";
  }

  if(!result.ok){
    const state=result.status===403?"NOT_ENTITLED":"SOURCE_ERROR";
    return send(res,result.status===403?403:502,{
      data:null,
      meta:meta("Benzinga",state,{source_type:action.toUpperCase(),source_url:sourceUrl,elapsed_ms:result.elapsed_ms}),
      upstream_status:result.status,
      auth_mode
    });
  }

  return send(res,200,{
    symbol,
    action,
    data:result.data,
    meta:meta("Benzinga","VALID",{
      source_type:action.toUpperCase(),
      source_url:sourceUrl,
      published_at:latestPublished(action,result.data),
      elapsed_ms:result.elapsed_ms,
      delay_state:"UNKNOWN"
    }),
    auth_mode
  });
};
