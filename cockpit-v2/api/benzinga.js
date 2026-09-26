const { send, fetchJson, meta, cleanSymbol } = require("./_common");

const BASE = "https://api.benzinga.com";

function endpoint(action, symbol, req) {
  const size = Math.max(1, Math.min(50, Number(req.query.limit || 20)));
  if (action === "news") {
    const params = new URLSearchParams({ pageSize: String(size) });
    if (symbol) params.set("tickers", symbol);
    return `/api/v2/news?${params.toString()}`;
  }
  if (action === "halts") {
    const params = new URLSearchParams();
    if (symbol) params.set("tickers", symbol);
    return `/api/v1/signal/halt_resume?${params.toString()}`;
  }
  if (action === "movers") {
    const params = new URLSearchParams();
    if (req.query.session) params.set("session", String(req.query.session));
    return `/api/v1/market/movers?${params.toString()}`;
  }
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "METHOD_NOT_ALLOWED" });

  const token = process.env.BENZINGA_API_KEY;
  if (!token) {
    return send(res, 503, {
      data: null,
      meta: meta("Benzinga", "NOT_CONFIGURED")
    });
  }

  const action = String(req.query.action || "news").toLowerCase();
  const symbol = req.query.symbol ? cleanSymbol(req.query.symbol) : null;
  if (req.query.symbol && !symbol) return send(res, 400, { error: "INVALID_SYMBOL" });

  const path = endpoint(action, symbol, req);
  if (!path) return send(res, 400, { error: "UNSUPPORTED_ACTION", supported: ["news","halts","movers"] });

  const join = path.includes("?") ? "&" : "?";
  const sourceUrl = `${BASE}${path}`;
  const result = await fetchJson(`${sourceUrl}${join}token=${encodeURIComponent(token)}`);

  if (!result.ok) {
    return send(res, result.status === 403 ? 403 : 502, {
      data: null,
      meta: meta("Benzinga", result.status === 403 ? "NOT_ENTITLED" : "SOURCE_ERROR", {
        source_url: sourceUrl,
        elapsed_ms: result.elapsed_ms
      }),
      upstream_status: result.status
    });
  }

  return send(res, 200, {
    symbol,
    action,
    data: result.data,
    meta: meta("Benzinga", "VALID", {
      source_url: sourceUrl,
      elapsed_ms: result.elapsed_ms,
      delay_state: "UNKNOWN"
    })
  });
};