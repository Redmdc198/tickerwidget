const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

function send(res, status, payload) {
  res.statusCode = status;
  for (const [k, v] of Object.entries(JSON_HEADERS)) res.setHeader(k, v);
  res.end(JSON.stringify(payload));
}

async function fetchJson(url, init = {}) {
  const started = Date.now();
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(8000),
    headers: {
      "user-agent": "Red-Dagger-Cockpit/2.0",
      ...(init.headers || {})
    }
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw_text: text.slice(0, 4000) }; }
  return {
    ok: response.ok,
    status: response.status,
    elapsed_ms: Date.now() - started,
    data
  };
}

function meta(provider, state, extra = {}) {
  return {
    provider,
    retrieval_state: state,
    retrieved_at: new Date().toISOString(),
    delay_state: extra.delay_state || "UNKNOWN",
    freshness_seconds: extra.freshness_seconds ?? null,
    observed_at: extra.observed_at || null,
    published_at: extra.published_at || null,
    source_url: extra.source_url || null,
    elapsed_ms: extra.elapsed_ms ?? null
  };
}

function cleanSymbol(value) {
  const symbol = String(value || "").trim().toUpperCase();
  return /^[A-Z0-9.\-]{1,15}$/.test(symbol) ? symbol : null;
}

module.exports = { send, fetchJson, meta, cleanSymbol };