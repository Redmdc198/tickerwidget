const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const script = fs.readFileSync(path.join(__dirname, "..", "provider-cockpit.js"), "utf8");
const selectors = ["#rdProviderHealth", "#rdQuoteIntel", "#rdMassiveIntel", "#rdCatalystIntel"];

function responseFor(url, headline = '<img src=x onerror="bad()">', link = "javascript:alert(1)") {
  const symbol = new URL(url, "https://cockpit.test").searchParams.get("symbol") || "HIVE";
  let payload;
  if (url === "/api/status") {
    payload = { providers: {
      finnhub: { configured: true, state: "VALID", delay_state: "UNKNOWN" },
      massive: { configured: true, state: "VALID", delay_state: "UNKNOWN" },
      benzinga: { configured: true, state: "VALID", delay_state: "UNKNOWN" }
    } };
  } else if (url.startsWith("/api/finnhub")) {
    payload = { meta: { retrieval_state: "VALID", delay_state: "UNKNOWN", observed_at: "2026-10-23T20:00:00.000Z" },
      data: { c: symbol === "AAPL" ? 200 : 2, dp: 1.2 } };
  } else if (url.startsWith("/api/massive")) {
    payload = { meta: { retrieval_state: "VALID" }, data: { results: [{ c: 2, h: 3, l: 1, v: 123 }] } };
  } else {
    payload = { meta: { retrieval_state: "VALID" }, data: [{ title: headline, url: link }] };
  }
  return { ok: true, status: 200, json: async () => payload };
}

function harness(fetchImpl) {
  const mounts = Object.fromEntries(selectors.map(key => [key, { innerHTML: "" }]));
  const window = {};
  const document = { querySelector: selector => mounts[selector] || null };
  const context = vm.createContext({ window, document, fetch: fetchImpl, URL, Intl });
  vm.runInContext(script, context, { filename: "provider-cockpit.js" });
  return { refresh: window.RedDaggerProviderCockpit.refresh, mounts };
}

test("untrusted issuer headline is escaped and non-http source is omitted", async () => {
  const h = harness(async url => responseFor(url));
  await h.refresh("HIVE");
  const html = h.mounts["#rdCatalystIntel"].innerHTML;
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img/i);
  assert.doesNotMatch(html, /javascript:/i);
  assert.doesNotMatch(html, /href=/i);
});

test("https issuer source stays clickable after encoding", async () => {
  const h = harness(async url => responseFor(url, "Company update", "https://issuer.example/news?q=1&b=2"));
  await h.refresh("HIVE");
  const html = h.mounts["#rdCatalystIntel"].innerHTML;
  assert.match(html, /href="https:\/\/issuer\.example\/news\?q=1&amp;b=2"/);
  assert.match(html, /noopener noreferrer/);
});

test("older quote response does not replace a newer symbol", async () => {
  const held = [];
  const h = harness(url => url.includes("symbol=AAPL")
    ? new Promise(resolve => held.push(() => resolve(responseFor(url))))
    : Promise.resolve(responseFor(url)));
  const older = h.refresh("AAPL");
  const newer = h.refresh("HIVE");
  await newer;
  held.forEach(release => release());
  await older;
  assert.match(h.mounts["#rdQuoteIntel"].innerHTML, />HIVE</);
  assert.doesNotMatch(h.mounts["#rdQuoteIntel"].innerHTML, />AAPL</);
});

test("invalid symbol does not trigger provider calls", async () => {
  let calls = 0;
  const h = harness(async url => { calls += 1; return responseFor(url); });
  await h.refresh('<img src=x>');
  assert.equal(calls, 0);
  assert.equal(h.mounts["#rdQuoteIntel"].innerHTML, "");
});
