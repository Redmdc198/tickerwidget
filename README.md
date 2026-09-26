# Red Dagger Market Board — Cockpit V2

This branch mirrors the currently working Vercel cockpit and adds server-backed provider modules without replacing TradingView visuals.

## Runtime key aliases
- Benzinga: BENZINGA_API_KEY / BENZINGA_API / BAZINGA_API_KEY / BAZINGA_API
- Finnhub: FINNHUB_API_KEY / FINNHUB_API / FINNHUB_TOKEN / FINHUB_API_KEY
- Finnhub Widgets: FINNHUB_WIDGETS / FINNHUB_WIDGET_KEY / FINNHUB_WIDGETS_KEY / FINNHUB_WIDGET_TOKEN
- Massive: MASSIVE_API_KEY / MASSIVE_API / MASSIVE_TOKEN / MASSIVE_KEY

No route returns the secret or the matching variable name.

## Provider routes
/api/status
/api/finnhub?action=quote&symbol=REI
/api/finnhub?action=profile&symbol=REI
/api/finnhub?action=metric&symbol=REI
/api/benzinga?action=news&symbol=REI
/api/benzinga?action=halts&symbol=REI
/api/benzinga?action=movers
/api/massive?action=snapshot&symbol=REI
/api/massive?action=gainers
/api/massive?action=losers
/api/massive?action=news&symbol=REI

All delay states remain UNKNOWN until runtime/account entitlement is verified. TradingView stays visual context; thinkorswim/broker evidence stays execution truth.

## Benzinga authentication
Cockpit V2 authenticates Benzinga server-side with the `Authorization: token <key>` header. The secret remains in Vercel environment variables and is never sent to browser JavaScript or appended to provider request URLs.
