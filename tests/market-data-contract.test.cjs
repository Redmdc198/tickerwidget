const test = require("node:test");
const assert = require("node:assert/strict");
const finnhub = require("../api/finnhub");
const massive = require("../api/massive");

process.env.FINNHUB_API_KEY = "mock-not-a-real-key";
process.env.MASSIVE_API_KEY = "mock-not-a-real-key";

async function call(handler, query) {
  let body;
  const res = {
    statusCode: null,
    setHeader() {},
    end(s) { body = JSON.parse(s); }
  };
  await handler({ method: "GET", query }, res);
  return { status: res.statusCode, body };
}
async function mocked(handler, query, payload, status = 200) {
  const before = global.fetch;
  global.fetch = async () => ({
    ok: status >= 200 && status < 300, status,
    text: async () => JSON.stringify(payload)
  });
  try { return await call(handler, query); } finally { global.fetch = before; }
}

test("Finnhub 200 with zero close and zero timestamp is MISSING, not VALID", async () => {
  const r = await mocked(finnhub, {action: "quote",symbol: "ZZZNOTREAL999"}, { c: 0, dp: null, t: 0 });
  assert.equal(r.status, 200);
  assert.equal(r.body.meta.retrieval_state, "MISSING");
  assert.equal(r.body.data, null);
  assert.equal(r.body.meta.observed_at, null);
});

test("Finnhub valid quote has true age and does not invent null percent change", async () => {
  const stamp = Math.floor((Date.now() - 20000) / 1000);
  const r = await mocked(finnhub, {action: "quote",symbol: "HIVE"}, { c: 2.07, dp: null, t: stamp });
  assert.equal(r.status, 200);
  assert.equal(r.body.meta.retrieval_state, "VALID");
  assert.equal(r.body.data.dp, null);
  assert.ok(r.body.meta.freshness_seconds >= 19);
  assert.equal(r.body.meta.delay_state, "UNKNOWN");
  assert.ok(r.body.meta.observed_at.endsWith("Z"));
});

test("Massive previous-day bar is labeled historical with observed_at", async () => {
  const r = await mocked(massive, {action: "prev",symbol: "HIVE"}, {
    status: "OK", results: [{T:"HIVE",c:2.05,h:2.2,l:2.01,v:123456,t:1792800000000}]
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.meta.retrieval_state, "VALID");
  assert.equal(r.body.meta.delay_state, "PREVIOUS_SESSION");
  assert.equal(r.body.meta.session, "PREVIOUS_TRADING_DAY");
  assert.ok(r.body.meta.observed_at);
  assert.equal(r.body.data.results.length, 1);
});

test("Massive empty prior-day payload is explicitly MISSING", async () => {
  const r = await mocked(massive, {action: "prev",symbol: "HIVE"}, {
    status:"OK",resultsCount:0,results:[]
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.data, null);
  assert.equal(r.body.meta.retrieval_state, "MISSING");
  assert.equal(r.body.meta.delay_state, "PREVIOUS_SESSION");
});

test("Massive snapshot entitlement restriction is not classified as empty data", async () => {
  const r = await mocked(massive, {action: "snapshot",symbol: "HIVE"}, {status:"NOT_AUTHORIZED"}, 403);
  assert.equal(r.status, 403);
  assert.equal(r.body.meta.retrieval_state, "NOT_ENTITLED");
  assert.equal(r.body.upstream_status, 403);
});

test("HTTP 429 upstream failure is not classified as a successful quote", async () => {
  const r = await mocked(finnhub, {action: "quote",symbol: "HIVE"}, {error:"rate limit"}, 429);
  assert.equal(r.status, 502);
  assert.equal(r.body.meta.retrieval_state, "SOURCE_ERROR");
  assert.equal(r.body.upstream_status, 429);
});

test("Finnhub network failure becomes explicit SOURCE_ERROR, not unhandled exception", async () => {
  const before = global.fetch;
  global.fetch = async () => { throw new Error("mock network outage"); };
  try {
    const r = await call(finnhub, {action:"quote",symbol:"HIVE"});
    assert.equal(r.status, 502);
    assert.equal(r.body.meta.retrieval_state, "SOURCE_ERROR");
    assert.equal(r.body.data, null);
  } finally { global.fetch = before; }
});

test("browser script remains syntactically valid", () => {
  const fs = require("node:fs");
  const vm = require("node:vm");
  vm.compileFunction(fs.readFileSync(require("node:path").join(__dirname,"..","app.js"),"utf8"),[]);
});
