# Red Dagger Trade Reconstruction Worker

This preview-only service is the governed control implementation for the deterministic reconstruction core.

Current contract: `RD-WORKER-TRADE-RECON-1.1`  
Current reconstruction doctrine: `Red Dagger CSV Import & Campaign Reconstruction Protocol v1.3`

## Safety boundary

- **Read-only proposal mode.**
- No Notion credentials.
- No canonical writes.
- No Captain-owned judgments.
- Broker/execution evidence remains truth.
- Raw charts remain unmodified.
- Canceled/pending orders are not executions.
- A proven flat starting position anchor is still required by this implementation.

## Position Cycle vs Trade Campaign

The Worker now separates two granularities:

- **Position Cycle** — deterministic broker-provable zero → nonzero → zero sequence. Every verified return to Flat ends a Position Cycle.
- **Trade Campaign** — strategic/tactical grouping. Flat proposes a boundary but does not automatically finalize one.

For a packet containing more than one Position Cycle:

- Captain-confirmed same-campaign continuity may group the cycles into one Trade Campaign.
- Captain-confirmed separate treatment may preserve the cycles as separate Trade Campaigns.
- Without confirmed continuity, the Worker returns `CONFLICT` with `campaignBoundaryStatus: NEEDS_CAPTAIN_CONFIRMATION`.
- The Worker does not infer setup, thesis, catalyst, psychology, or strategic continuity from broker mechanics.

Each normalized execution carries a `positionCycleId`. Output includes both `positionCycles[]` and `campaigns[]`.

## Endpoint

`GET /api/ftft-worker` preserves the canonical FTFT Late Afternoon 2026-09-14 single-cycle known-answer fixture.

Expected validation: **9/9 PASS**.

`POST /api/ftft-worker` accepts a JSON packet with `startingPosition: 0` and `executions[]` and returns normalized executions, Position Cycles, resolved/proposed Trade Campaigns, position trace, deterministic calculations, chart annotation packet, and protected fields withheld.

`GET /api/ftft-worker-safety` now includes:
- duplicate execution dedupe
- bad-anchor refusal
- oversell conflict
- MI unknown-continuity stop
- MI Captain-confirmed 4-Position-Cycle → 1-Trade-Campaign case
- read-only write-boundary check

## FTFT known answer

FTFT remains the regression control:

- 1 Position Cycle
- 1 Trade Campaign
- 90 shares bought
- 90 shares sold
- 15 executions
- weighted entry 7.6407
- weighted exit 7.9605
- gross cost 687.664
- gross proceeds 716.442
- gross P&L +28.78
- final state Flat

The canceled 9.94 target is intentionally absent because it was not an execution.

## MI KER-32 acceptance vector

Captain-confirmed MI 2026-10-05 continuity must resolve to:

- 4 Position Cycles
- 1 Trade Campaign
- 6 shares bought
- 6 shares sold
- final state Flat
- weighted entry 5.3633
- weighted exit 5.7683
- gross cost 32.18
- gross proceeds 34.61
- gross P&L +2.43
- opened 11:26:25 ET
- finally closed 12:03:07 ET
- elapsed window 2,202 seconds / 36m 42s

The same MI fills **without** Captain continuity must not be silently merged or split; they must return `NEEDS_CAPTAIN_CONFIRMATION / CONFLICT`.

## Deployment boundary

The GitHub/Vercel implementation remains a read-only control. Native Notion Worker deployment is a separate runtime gate. A GitHub code PASS must not be represented as proof that the deployed Notion Worker has been updated until the native Worker is rebuilt/deployed and re-run.
