# Red Dagger Market Board — Morning Scout Engineering Roadmap

Status: active implementation roadmap
Governance authority: Linear KER-37 and canonical Red Dagger doctrine in Notion

## Purpose

Extend the existing Red Dagger Market Board into a low-latency market-intelligence scanner over the governed five-watchlist universe.

This public engineering roadmap intentionally omits proprietary scoring weights, internal AI prompts, private journal data and protected Red Dagger strategy logic.

## Current production baseline

- Five active watchlists with 177 unique researched symbols across WL2–WL5.
- TradingView visualization.
- Finnhub quote lane.
- Massive previous-day lane.
- Benzinga catalyst/news lane.
- Market % Change scan, sorting and mover filters.
- Server-side provider credentials.
- Static watchlist membership remains separate from trading readiness.

## Build sequence

### 1. Provider benchmark
Measure Finnhub, Massive, Benzinga and any candidate low-latency OHLCV provider against:
- coverage;
- freshness/delay;
- bar availability;
- volume support;
- rate limits;
- WebSocket/polling behavior;
- U.S. microcap coverage;
- public-display licensing.

Twelve Data is an evaluation candidate only until entitlement, latency and licensing are verified.

### 2. Normalized market observation contract
Standardize:
- symbol;
- venue;
- provider;
- last;
- market percent change;
- volume;
- average-volume reference;
- RVOL;
- observation/retrieval timestamps;
- freshness;
- delay state;
- retrieval state;
- session;
- bar availability.

### 3. Volume / RVOL
Add deterministic:
- current volume;
- average-volume baseline;
- RVOL;
- abnormal-volume state;
- volume acceleration when supported.

### 4. Higher-timeframe trend
Derive bounded machine-readable states from structured OHLCV:
- Uptrend;
- Downtrend;
- Range;
- Transition;
- Unknown.

Primary scanner timeframes:
- Daily;
- 4H;
- optional 1H.

### 5. Catalyst / event enrichment
Surface factual Benzinga attention evidence:
- news;
- press releases;
- WIIM;
- halts/resumes;
- offerings;
- movers;
- trending.

Provider evidence does not become a proprietary catalyst grade automatically.

### 6. Morning Scout discovery priority
Create a transparent attention/ranking layer from validated deterministic inputs.

Possible public categories:
- Emerging Momentum;
- Top Movers;
- Fresh Catalyst;
- Watch Closely;
- Extended / Risky.

This is discovery priority, not predicted return, trade probability or trading authorization.

### 7. Market Board scanner UX
Planned sortable/filterable fields:
- Symbol;
- Market %;
- Price;
- Volume;
- RVOL;
- Fresh Catalyst;
- Daily Trend;
- 4H Trend;
- Scout Priority;
- Freshness.

### 8. Alerting
After validation, support change-based alerts for meaningful transitions:
- new catalyst;
- halt/resume;
- RVOL threshold crossing;
- unusual percent acceleration;
- first entry into high-priority discovery state.

Avoid repeated alerts for unchanged state.

### 9. Validation
Before commissioning:
- test all 177 symbols;
- measure end-to-end latency;
- verify stale/error/not-entitled behavior;
- verify symbol/venue identity;
- record false positives/false negatives;
- verify no static-list classification is treated as trading readiness.

## Security

- Provider keys stay server-side.
- Browser never receives provider secrets.
- No shadow canonical trading database.
- Public Market Board does not expose proprietary internal logic.
- Canonical governance remains outside this public runtime.
