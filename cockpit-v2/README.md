# Red Dagger Cockpit V2 scaffold

This branch is a non-destructive implementation scaffold for the existing Vercel-hosted Red Dagger Market Board.

## Current production baseline
- Alias: https://red-dagger-market-board.vercel.app
- Existing UI: TradingView ticker tape, watchlists, 15m chart with VWAP/Volume, Risk Compass, heatmap, news and economic calendar.
- Existing production should remain untouched until this scaffold is merged into an explicit source-controlled deployment path.

## Environment variables
Set only in the Vercel project/server environment:

- `BENZINGA_API_KEY`
- `FINNHUB_API_KEY`

Never expose either key in browser JavaScript.

## API routes
- `/api/status` — provider configuration health without secrets
- `/api/finnhub?action=quote&symbol=REI`
- `/api/finnhub?action=profile&symbol=REI`
- `/api/finnhub?action=metric&symbol=REI`
- `/api/benzinga?action=news&symbol=REI`
- `/api/benzinga?action=halts&symbol=REI`
- `/api/benzinga?action=movers`

All responses preserve provider, retrieval state, retrieved_at and delay_state. Delay is deliberately UNKNOWN until entitlement semantics are verified.

## Frontend merge
Add the provider panel markup to the current board:

```html
<link rel="stylesheet" href="/provider-cockpit.css">

<div class="rd-provider-grid">
  <section class="rd-provider-panel">
    <div class="rd-provider-head">Watchlist Intelligence <span>Finnhub</span></div>
    <div class="rd-provider-body rd-kpi-grid" id="rdQuoteIntel"></div>
  </section>

  <section class="rd-provider-panel">
    <div class="rd-provider-head">Catalyst Watch <span>Benzinga</span></div>
    <div class="rd-provider-body" id="rdCatalystIntel"></div>
  </section>

  <section class="rd-provider-panel">
    <div class="rd-provider-head">Provider Health <span>Systems</span></div>
    <div class="rd-provider-body" id="rdProviderHealth"></div>
  </section>
</div>

<script src="/provider-cockpit.js"></script>
```

Then call:

```js
RedDaggerProviderCockpit.refresh(selectedTicker);
```

from the existing symbol-selection handler.

## Guardrails
- TradingView remains visual/context only.
- Broker/thinkorswim remains execution truth.
- Benzinga facts never become Red Dagger Catalyst Grade automatically.
- Market-intelligence KPIs do not enter Ledger of Plunder merely because they are shown in the cockpit.
- Provider failures must show NOT_CONFIGURED / NOT_ENTITLED / SOURCE_ERROR rather than stale unlabeled numbers.
- No canonical Notion write-back is included in this scaffold.
