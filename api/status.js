const{send,envFirst}=require("./_common");
module.exports=async function handler(req,res){if(req.method!=="GET")return send(res,405,{error:"METHOD_NOT_ALLOWED"});
const benzinga=envFirst("BENZINGA_API_KEY","BENZINGA_API","BAZINGA_API_KEY","BAZINGA_API");
const finnhub=envFirst("FINNHUB_API_KEY","FINNHUB_API","FINNHUB_TOKEN","FINHUB_API_KEY");
const finnhubWidgets=envFirst("FINNHUB_WIDGETS","FINNHUB_WIDGET_KEY","FINNHUB_WIDGETS_KEY","FINNHUB_WIDGET_TOKEN");
const massive=envFirst("MASSIVE_API_KEY","MASSIVE_API","MASSIVE_TOKEN","MASSIVE_KEY");
return send(res,200,{service:"red-dagger-cockpit-v2",retrieved_at:new Date().toISOString(),providers:{
benzinga:{configured:Boolean(benzinga),state:benzinga?"CONFIGURED_UNVERIFIED_RUNTIME":"NOT_CONFIGURED",delay_state:"UNKNOWN"},
finnhub:{configured:Boolean(finnhub),widgets_configured:Boolean(finnhubWidgets),state:finnhub?"CONFIGURED_UNVERIFIED_RUNTIME":"NOT_CONFIGURED",delay_state:"UNKNOWN"},
massive:{configured:Boolean(massive),state:massive?"CONFIGURED_UNVERIFIED_RUNTIME":"NOT_CONFIGURED",delay_state:"UNKNOWN"},
tradingview:{configured:true,state:"PUBLIC_WIDGETS",delay_state:"EXCHANGE_DEPENDENT"}}})};