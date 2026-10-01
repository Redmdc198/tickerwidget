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
const clone=x=>JSON.parse(JSON.stringify(x));

module.exports=function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  const duplicate=clone(base); duplicate.executions.push({...duplicate.executions[0]});
  const badAnchor=clone(base); badAnchor.startingPosition=10;
  const oversell=clone(base); oversell.executions.push({ticker:"FTFT",timestamp:"2026-09-14T16:09:00-04:00",action:"SELL",shares:10,price:7.40,fees:0,brokerExecutionId:"safe-3"});
  const a=reconstruct(duplicate), b=reconstruct(badAnchor), c=reconstruct(oversell);
  const checks={
    duplicateRemoved:a.status==="PASS" && a.dedupeReport?.duplicatesRemoved===1 && a.calculations?.executionCount===2,
    badAnchorRejected:b.status==="NEEDS_EVIDENCE",
    oversellRejected:c.status==="CONFLICT"
  };
  return res.status(200).json({
    service:"Red Dagger BP-3 safety gates",
    environment:"preview/read-only",
    canonicalWritesEnabled:false,
    pass:Object.values(checks).every(Boolean),
    checks,
    results:{duplicate:a,badAnchor:b,oversell:c}
  });
};
