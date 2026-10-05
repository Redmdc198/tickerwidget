"use strict";
const { reconstruct } = require("../lib/red-dagger-ftft-core");

const base = {
  source:"BP-3 safety fixture", importBatch:"FTFT-SAFETY", startingPosition:0,
  positionAnchor:"Proven flat anchor",
  executions:[
    {ticker:"FTFT",timestamp:"2026-09-14T14:49:47-04:00",action:"BUY",shares:20,price:8.1045,fees:0,brokerExecutionId:"safe-1"},
    {ticker:"FTFT",timestamp:"2026-09-14T16:08:32-04:00",action:"SELL",shares:20,price:8.20,fees:0,brokerExecutionId:"safe-2"}
  ]
};

const miExecutions = [
  ["2026-10-05T11:26:25-04:00","BUY",1,4.36],
  ["2026-10-05T11:27:03-04:00","SELL",1,4.56],
  ["2026-10-05T11:33:58-04:00","BUY",1,5.19],
  ["2026-10-05T11:36:07-04:00","BUY",1,5.03],
  ["2026-10-05T11:38:18-04:00","SELL",2,5.60],
  ["2026-10-05T11:52:16-04:00","BUY",1,5.69],
  ["2026-10-05T11:52:25-04:00","SELL",1,6.16],
  ["2026-10-05T11:54:36-04:00","BUY",1,6.13],
  ["2026-10-05T11:58:09-04:00","BUY",1,5.78],
  ["2026-10-05T12:01:31-04:00","SELL",1,6.35],
  ["2026-10-05T12:03:07-04:00","SELL",1,6.34]
].map((x,i)=>({
  ticker:"MI",timestamp:x[0],action:x[1],shares:x[2],price:x[3],fees:0,
  brokerExecutionId:`mi-filled-${String(i+1).padStart(2,"0")}`
}));

const clone=x=>JSON.parse(JSON.stringify(x));

module.exports=function handler(req,res){
  res.setHeader("Cache-Control","no-store");

  const duplicate=clone(base); duplicate.executions.push({...duplicate.executions[0]});
  const badAnchor=clone(base); badAnchor.startingPosition=10;
  const oversell=clone(base); oversell.executions.push({ticker:"FTFT",timestamp:"2026-09-14T16:09:00-04:00",action:"SELL",shares:10,price:7.40,fees:0,brokerExecutionId:"safe-3"});

  const miUnknown = {
    source:"Schwab Account Trade History",
    importBatch:"MI-2026-10-05",
    startingPosition:0,
    positionAnchor:"Broker evidence establishes flat before first included MI execution",
    executions:miExecutions
  };

  const miCaptainConfirmed = {
    ...clone(miUnknown),
    tradeCampaignId:"MI-2026-10-05-SCALP-01",
    campaignContinuity:{
      status:"CONFIRMED_SAME_CAMPAIGN",
      confirmedBy:"Captain",
      evidence:"KER-32 Captain ruling — 2026-10-05"
    }
  };

  const a=reconstruct(duplicate);
  const b=reconstruct(badAnchor);
  const c=reconstruct(oversell);
  const d=reconstruct(miUnknown);
  const e=reconstruct(miCaptainConfirmed);

  const miCalc=e.calculations || {};
  const miCampaign=e.campaigns?.[0] || {};

  const checks={
    duplicateRemoved:a.status==="PASS" && a.dedupeReport?.duplicatesRemoved===1 && a.calculations?.executionCount===2,
    badAnchorRejected:b.status==="NEEDS_EVIDENCE",
    oversellRejected:c.status==="CONFLICT",
    unknownContinuityStops:d.status==="CONFLICT" && d.campaignBoundaryStatus==="NEEDS_CAPTAIN_CONFIRMATION" && d.positionCycles?.length===4 && d.campaigns?.length===0,
    miFourPositionCycles:e.status==="PASS" && e.positionCycles?.length===4,
    miOneTradeCampaign:e.status==="PASS" && e.campaigns?.length===1 && miCampaign.positionCycleCount===4,
    miBoughtSoldFlat:miCalc.boughtShares===6 && miCalc.soldShares===6 && miCalc.remainingShares===0 && miCalc.finalState==="Flat",
    miWeightedEntry:Math.abs(miCalc.weightedEntry-5.3633)<0.00005,
    miWeightedExit:Math.abs(miCalc.weightedExit-5.7683)<0.00005,
    miGrossPnl:Math.abs(miCalc.grossPnlDisplay-2.43)<0.005,
    miCampaignWindow:miCampaign.openedAt==="2026-10-05T11:26:25-04:00" && miCampaign.closedAt==="2026-10-05T12:03:07-04:00" && miCampaign.calculations?.elapsedSeconds===2202,
    readOnly:e.mode==="READ_ONLY_PROPOSAL" && Array.isArray(e.proposedNotionWrites) && e.proposedNotionWrites.length===0
  };

  return res.status(200).json({
    service:"Red Dagger KER-32 reconstruction safety gates",
    environment:"preview/read-only",
    canonicalWritesEnabled:false,
    pass:Object.values(checks).every(Boolean),
    checks,
    results:{
      duplicate:a,
      badAnchor:b,
      oversell:c,
      miUnknownContinuity:d,
      miCaptainConfirmed:e
    }
  });
};
