const { send, fetchJson, meta, cleanSymbol, envFirst } = require("./_common");
const BASE = "https://api.massive.com";
const isNumber = n => n !== null && n !== undefined && Number.isFinite(Number(n));
function previousBar(payload, symbol) {
  const r = Array.isArray(payload?.results) ? payload.results[0] : null;
  if (!r || (r.T && r.T !== symbol) || !isNumber(r.c) || Number(r.c) <= 0 ||
      !isNumber(r.h) || !isNumber(r.l) || !isNumber(r.v) ||
      !isNumber(r.t) || Number(r.t) <= 0 ||
      !Number.isFinite(new Date(Number(r.t)).getTime())) return null;
  return r;
}
module.exports = async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "METHOD_NOT_ALLOWED" });
  const token = envFirst("MASSIVE_API_KEY", "MASSIVE_API", "MASSIVE_TOKEN", "MASSIVE_KEY");
  if (!token) return send(res, 503, { data: null, meta: meta("Massive", "NOT_CONFIGURED") });
  const action = String(req.query.action || "snapshot").toLowerCase();
  const symbol = req.query.symbol ? cleanSymbol(req.query.symbol) : null;
  if (req.query.symbol && !symbol) return send(res, 400, { error: "INVALID_SYMBOL" });
  let path;
  if (action === "snapshot") {
    if (!symbol) return send(res, 400, { error: "SYMBOL_REQUIRED" });
    path = `/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(symbol)}`;
  } else if (action === "prev") {
    if (!symbol) return send(res, 400, { error: "SYMBOL_REQUIRED" });
    path = `/v2/aggs/ticker/${encodeURIComponent(symbol)}/prev`;
  } else if (action === "gainers" || action === "losers") {
    path = `/v2/snapshot/locale/us/markets/stocks/${action}`;
  } else if (action === "news") {
    const p = new URLSearchParams({
      limit: String(Math.max(1, Math.min(20, Number(req.query.limit || 8)))),
      order: "desc", sort: "published_utc"
    });
    if (symbol) p.set("ticker", symbol);
    path = `/v2/reference/news?${p.toString()}`;
  } else return send(res, 400, { error: "UNSUPPORTED_ACTION", supported: ["snapshot", "prev", "gainers", "losers", "news"] });
  const sourceUrl = BASE + path;
  let result, auth_mode = "bearer";
  try {
    result = await fetchJson(sourceUrl, { headers: { Authorization: `Bearer ${token}` } });
    // Account compatibility fallback, server-side only. Never return the credential-bearing URL.
    if (result.status === 401) {
      const join = sourceUrl.includes("?") ? "&" : "?";
      result = await fetchJson(`${sourceUrl}${join}apiKey=${encodeURIComponent(token)}`);
      auth_mode = "query_fallback";
    }
  } catch {
    return send(res, 502, { symbol, action, data: null,
      meta: meta("Massive", "SOURCE_ERROR", { source_url: sourceUrl }), auth_mode });
  }
  if (!result.ok) return send(res, result.status === 403 ? 403 : 502, {
    symbol, action, data: null,
    meta: meta("Massive", result.status === 403 ? "NOT_ENTITLED" : "SOURCE_ERROR",
      { source_url: sourceUrl, elapsed_ms: result.elapsed_ms }),
    upstream_status: result.status, auth_mode
  });
  if (action === "prev") {
    const r = previousBar(result.data, symbol);
    if (!r) return send(res, 200, { symbol, action, data: null,
      meta: { ...meta("Massive", "MISSING", { source_url: sourceUrl,
        elapsed_ms: result.elapsed_ms, delay_state: "PREVIOUS_SESSION" }),
        session: "PREVIOUS_TRADING_DAY" },
      reason: "PREVIOUS_BAR_UNAVAILABLE", auth_mode });
    const observedMs = Number(r.t);
    return send(res, 200, { symbol, action, data: result.data,
      meta: { ...meta("Massive", "VALID", {
        source_url: sourceUrl, observed_at: new Date(observedMs).toISOString(),
        freshness_seconds: Math.max(0, Math.floor((Date.now() - observedMs) / 1000)),
        delay_state: "PREVIOUS_SESSION", elapsed_ms: result.elapsed_ms
      }), session: "PREVIOUS_TRADING_DAY" }, auth_mode });
  }
  // A successful HTTP response is not proof that snapshots are available on this account.
  if (action === "snapshot" && (!result.data?.ticker || typeof result.data.ticker !== "object")) {
    return send(res, 200, { symbol, action, data: null,
      meta: meta("Massive", "MISSING", { source_url: sourceUrl, elapsed_ms: result.elapsed_ms }), auth_mode });
  }
  return send(res, 200, { symbol, action, data: result.data,
    meta: meta("Massive", "VALID", { source_url: sourceUrl, elapsed_ms: result.elapsed_ms,
      delay_state: "UNKNOWN" }), auth_mode });
};
