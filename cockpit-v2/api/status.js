const { send } = require("./_common");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "METHOD_NOT_ALLOWED" });

  const providers = {
    benzinga: {
      configured: Boolean(process.env.BENZINGA_API_KEY),
      state: process.env.BENZINGA_API_KEY ? "CONFIGURED_UNVERIFIED_RUNTIME" : "NOT_CONFIGURED",
      delay_state: "UNKNOWN"
    },
    finnhub: {
      configured: Boolean(process.env.FINNHUB_API_KEY),
      state: process.env.FINNHUB_API_KEY ? "CONFIGURED_UNVERIFIED_RUNTIME" : "NOT_CONFIGURED",
      delay_state: "UNKNOWN"
    },
    tradingview: {
      configured: true,
      state: "PUBLIC_WIDGETS",
      delay_state: "EXCHANGE_DEPENDENT"
    }
  };

  return send(res, 200, {
    service: "red-dagger-cockpit-v2",
    retrieved_at: new Date().toISOString(),
    providers
  });
};