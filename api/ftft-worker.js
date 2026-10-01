"use strict";
const { reconstruct } = require("../lib/red-dagger-ftft-core");

const FTFT = {
  source: "Canonical Execution Ledger validation vector",
  importBatch: "FTFT-LATE-AFTERNOON-2026-09-14",
  startingPosition: 0,
  positionAnchor: "Earlier FTFT morning campaign returned flat; late-afternoon campaign begins from zero.",
  executions: [
    ["2026-09-14T14:49:47-04:00","BUY",20,8.1045],
    ["2026-09-14T14:50:10-04:00","BUY",20,7.65],
    ["2026-09-14T14:50:25-04:00","BUY",20,7.59],
    ["2026-09-14T14:50:53-04:00","BUY",10,7.46],
    ["2026-09-14T14:54:00-04:00","BUY",10,7.2874],
    ["2026-09-14T14:58:26-04:00","BUY",10,7.33],
    ["2026-09-14T15:31:45-04:00","SELL",10,7.68],
    ["2026-09-14T15:32:02-04:00","SELL",10,7.68],
    ["2026-09-14T15:32:07-04:00","SELL",10,7.82],
    ["2026-09-14T15:41:56-04:00","SELL",10,8.00],
    ["2026-09-14T15:56:39-04:00","SELL",10,8.1842],
    ["2026-09-14T15:57:16-04:00","SELL",10,8.24],
    ["2026-09-14T16:00:09-04:00","SELL",10,8.21],
    ["2026-09-14T16:00:24-04:00","SELL",10,8.41],
    ["2026-09-14T16:08:32-04:00","SELL",10,7.42]
  ].map((x,i)=>({
    ticker:"FTFT", timestamp:x[0], action:x[1], shares:x[2], price:x[3], fees:0,
    brokerExecutionId:`ftft-validation-${String(i+1).padStart(2,"0")}`
  }))
};

function validateKnownAnswer(result) {
  const c=result.calculations || {};
  const checks={
    status:result.status==="PASS",
    boughtShares:c.boughtShares===90,
    soldShares:c.soldShares===90,
    flat:c.remainingShares===0 && c.finalState==="Flat",
    executions:c.executionCount===15,
    weightedEntry:Math.abs(c.weightedEntry-7.6407)<0.00005,
    weightedExit:Math.abs(c.weightedExit-7.9605)<0.00005,
    grossPnl:Math.abs(c.grossPnlDisplay-28.78)<0.005,
    trace:JSON.stringify(result.runningPositionTrace)===JSON.stringify([0,20,40,60,70,80,90,80,70,60,50,40,30,20,10,0])
  };
  return {pass:Object.values(checks).every(Boolean),passed:Object.values(checks).filter(Boolean).length,total:Object.keys(checks).length,checks};
}

module.exports = function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(req.method==="GET"){
    const result=reconstruct(FTFT);
    return res.status(200).json({
      service:"Red Dagger BP-3 deterministic reconstruction",
      environment:"preview/read-only",
      canonicalWritesEnabled:false,
      fixture:"FTFT Late Afternoon — 2026-09-14",
      validation:validateKnownAnswer(result),
      result
    });
  }
  if(req.method==="POST"){
    const result=reconstruct(req.body);
    const code=result.status==="ERROR"?400:200;
    return res.status(code).json({
      service:"Red Dagger BP-3 deterministic reconstruction",
      environment:"preview/read-only",
      canonicalWritesEnabled:false,
      result
    });
  }
  res.setHeader("Allow","GET, POST");
  return res.status(405).json({error:"Method not allowed"});
};
