(() => {
  const $ = (s) => document.querySelector(s);

  function fmtTime(iso) {
    if (!iso) return "—";
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit"
      }).format(new Date(iso)) + " ET";
    } catch { return "—"; }
  }

  function stateClass(state) {
    if (state === "VALID") return "rd-state-good";
    if (["NOT_CONFIGURED","NOT_ENTITLED","SOURCE_ERROR","STALE"].includes(state)) return "rd-state-bad";
    return "rd-state-warn";
  }

  async function getJSON(url) {
    const r = await fetch(url, { cache: "no-store" });
    let j = null;
    try { j = await r.json(); } catch {}
    if (!r.ok && !j) throw new Error(`HTTP ${r.status}`);
    return j;
  }

  function renderProviderStatus(data) {
    const mount = $("#rdProviderHealth");
    if (!mount) return;
    const rows = Object.entries(data?.providers || {}).map(([name, p]) => `
      <div class="rd-health-row">
        <strong>${name.toUpperCase()}</strong>
        <span class="${p.configured ? "rd-state-good" : "rd-state-warn"}">${p.state}</span>
        <small>${p.delay_state}</small>
      </div>`).join("");
    mount.innerHTML = rows || '<div class="rd-empty">Provider health unavailable.</div>';
  }

  function renderQuote(payload, symbol) {
    const mount = $("#rdQuoteIntel");
    if (!mount) return;
    const m = payload?.meta || {};
    if (m.retrieval_state !== "VALID") {
      mount.innerHTML = `<div class="rd-empty"><strong>${symbol}</strong> · Finnhub ${m.retrieval_state || "UNAVAILABLE"}</div>`;
      return;
    }
    const q = payload.data || {};
    const price = Number.isFinite(Number(q.c)) ? Number(q.c).toFixed(4) : "—";
    const pct = Number.isFinite(Number(q.dp)) ? Number(q.dp).toFixed(2) + "%" : "—";
    mount.innerHTML = `
      <div class="rd-kpi"><span>Symbol</span><strong>${symbol}</strong></div>
      <div class="rd-kpi"><span>Last</span><strong>${price}</strong></div>
      <div class="rd-kpi"><span>Change</span><strong>${pct}</strong></div>
      <div class="rd-kpi"><span>Provider</span><strong>Finnhub</strong></div>
      <div class="rd-kpi"><span>Observed</span><strong>${fmtTime(m.observed_at)}</strong></div>
      <div class="rd-kpi"><span>Feed State</span><strong class="${stateClass(m.retrieval_state)}">${m.delay_state}</strong></div>`;
  }

  function extractNewsRows(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.results)) return data.results;
    return [];
  }

  function renderNews(payload, symbol) {
    const mount = $("#rdCatalystIntel");
    if (!mount) return;
    const state = payload?.meta?.retrieval_state;
    if (state !== "VALID") {
      mount.innerHTML = `<div class="rd-empty"><strong>${symbol}</strong> · Benzinga ${state || "UNAVAILABLE"}</div>`;
      return;
    }
    const rows = extractNewsRows(payload.data).slice(0, 6);
    if (!rows.length) {
      mount.innerHTML = '<div class="rd-empty">No returned Benzinga headlines. This is not equivalent to “no news.”</div>';
      return;
    }
    mount.innerHTML = rows.map(n => {
      const when = n.created || n.updated || n.published || null;
      const title = n.title || n.headline || "Untitled item";
      const url = n.url || "#";
      return `<article class="rd-news-row">
        <div><strong>${title}</strong><small>${when ? fmtTime(when) : "time unavailable"} · Benzinga</small></div>
        ${url !== "#" ? `<a href="${url}" target="_blank" rel="noopener">SOURCE</a>` : ""}
      </article>`;
    }).join("");
  }

  async function refresh(symbol) {
    symbol = String(symbol || "SPY").toUpperCase();
    const [status, quote, news] = await Promise.allSettled([
      getJSON("/api/status"),
      getJSON(`/api/finnhub?action=quote&symbol=${encodeURIComponent(symbol)}`),
      getJSON(`/api/benzinga?action=news&symbol=${encodeURIComponent(symbol)}&limit=8`)
    ]);
    if (status.status === "fulfilled") renderProviderStatus(status.value);
    if (quote.status === "fulfilled") renderQuote(quote.value, symbol);
    if (news.status === "fulfilled") renderNews(news.value, symbol);
  }

  window.RedDaggerProviderCockpit = { refresh };
})();