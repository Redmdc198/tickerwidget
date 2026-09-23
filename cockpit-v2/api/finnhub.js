const { send, fetchJson, meta, cleanSymbol } = require("./_common");

const BASE = "https://finnhub.io/api/v1";

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "METHOD_NOT_ALLOWED" });

  const token = process.env.FINNHUB_API_KEY;
  if (!token) {
    return send(res, 503, {
      data: null,
      meta: meta("Finnhub", "NOT_CONFIGURED")
    });
  }

  const symbol = cleanSymbol(req.query.symbol);
  if (!symbol) return send(res, 400, { error: "INVALID_SYMBOL" });

  const action = String(req.query.action || "quote").toLowerCase();
  let path;
  if (action === "quote") path = `/quote?symbol=${encodeURIComponent(symbol)}`;
  else if (action === "profile") path = `/stock/profile2?symbol=${encodeURIComponent(symbol)}`;
  else if (action === "metric") path = `/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all`;
  else return send(res, 400, { error: "UNSUPPORTED_ACTION", supported: ["quote","profile","metric"] });

  const sourceUrl = `${BASE}${path}`;
  const result = await fetchJson(`${sourceUrl}&token=${encodeURIComponent(token)}`);

  if (!result.ok) {
    return send(res, result.status === 403 ? 403 : 502, {
      data: null,
      meta: meta("Finnhub", result.status === 403 ? "NOT_ENTITLED" : "SOURCE_ERROR", {
        source_url: sourceUrl,
        elapsed_ms: result.elapsed_ms
      }),
      upstream_status: result.status
    });
  }

  let observedAt = null;
  if (action === "quote" && Number(result.data?.t)) {
    observedAt = new Date(Number(result.data.t) * 1000).toISOString();
  }

  return send(res, 200, {
    symbol,
    action,
    data: result.data,
    meta: meta("Finnhub", "VALID", {
      source_url: sourceUrl,
      observed_at: observedAt,
      elapsed_ms: result.elapsed_ms,
      delay_state: "UNKNOWN"
    })
  });
};