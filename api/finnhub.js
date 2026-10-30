const { send, fetchJson, meta, cleanSymbol, envFirst } = require("./_common");
const BASE = "https://finnhub.io/api/v1";

function validQuote(q) {
  // Finnhub returns zero timestamps/prices for some unsupported or unavailable tickers.
  // A 200 response is not sufficient to claim a valid market observation.
  return q && typeof q === "object" &&
    Number.isFinite(Number(q.c)) && Number(q.c) > 0 &&
    Number.isFinite(Number(q.t)) && Number(q.t) > 0 &&
    Number(q.t) * 1000 <= Date.now() + 60000;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "METHOD_NOT_ALLOWED" });
  const token = envFirst("FINNHUB_API_KEY", "FINNHUB_API", "FINNHUB_TOKEN", "FINHUB_API_KEY");
  if (!token) return send(res, 503, { data: null, meta: meta("Finnhub", "NOT_CONFIGURED") });
  const symbol = cleanSymbol(req.query.symbol);
  if (!symbol) return send(res, 400, { error: "INVALID_SYMBOL" });
  const action = String(req.query.action || "quote").toLowerCase();
  let path;
  if (action === "quote") path = `/quote?symbol=${encodeURIComponent(symbol)}`;
  else if (action === "profile") path = `/stock/profile2?symbol=${encodeURIComponent(symbol)}`;
  else if (action === "metric") path = `/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all`;
  else return send(res, 400, { error: "UNSUPPORTED_ACTION", supported: ["quote", "profile", "metric"] });
  const sourceUrl = BASE + path;
  let result, auth_mode = "header";
  try {
    result = await fetchJson(sourceUrl, { headers: { "X-Finnhub-Token": token } });
    // Historical compatibility fallback. Do not include token-bearing URL in output or logs.
    if (result.status === 401) {
      result = await fetchJson(`${sourceUrl}&token=${encodeURIComponent(token)}`);
      auth_mode = "query_fallback";
    }
  } catch {
    return send(res, 502, { symbol, action, data: null,
      meta: meta("Finnhub", "SOURCE_ERROR", { source_url: sourceUrl }), auth_mode });
  }
  if (!result.ok) return send(res, result.status === 403 ? 403 : 502, {
    symbol, action, data: null,
    meta: meta("Finnhub", result.status === 403 ? "NOT_ENTITLED" : "SOURCE_ERROR",
      { source_url: sourceUrl, elapsed_ms: result.elapsed_ms }),
    upstream_status: result.status, auth_mode
  });
  if (action === "quote" && !validQuote(result.data)) {
    return send(res, 200, { symbol, action, data: null,
      meta: meta("Finnhub", "MISSING", { source_url: sourceUrl, elapsed_ms: result.elapsed_ms }),
      reason: "QUOTE_EMPTY_OR_INVALID", auth_mode });
  }
  if (action !== "quote" && (!result.data || typeof result.data !== "object" ||
    Object.keys(result.data).length === 0)) {
    return send(res, 200, { symbol, action, data: null,
      meta: meta("Finnhub", "MISSING", { source_url: sourceUrl, elapsed_ms: result.elapsed_ms }), auth_mode });
  }
  const observedMs = action === "quote" ? Number(result.data.t) * 1000 : null;
  return send(res, 200, { symbol, action, data: result.data,
    meta: meta("Finnhub", "VALID", {
      source_url: sourceUrl,
      observed_at: observedMs ? new Date(observedMs).toISOString() : null,
      freshness_seconds: observedMs ? Math.max(0, Math.floor((Date.now() - observedMs) / 1000)) : null,
      elapsed_ms: result.elapsed_ms, delay_state: "UNKNOWN"
    }), auth_mode });
};
