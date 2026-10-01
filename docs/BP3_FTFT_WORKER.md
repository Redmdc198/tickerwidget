# BP-3 FTFT Deterministic Reconstruction

This preview-only service implements the deterministic core of `RD-WORKER-FTFT-1.0`.

## Safety boundary

- **Read-only proposal mode.**
- No Notion credentials.
- No canonical writes.
- No Captain-owned judgments.
- Broker/execution evidence remains truth.
- Raw charts remain unmodified.
- Canceled/pending orders are not executions.

## Endpoint

`GET /api/ftft-worker` runs the canonical FTFT Late Afternoon 2026-09-14 known-answer fixture.

Expected validation: **9/9 PASS**.

`POST /api/ftft-worker` accepts a JSON packet with `startingPosition: 0` and `executions[]` and returns normalized executions, position trace, deterministic calculations, chart annotation packet, and protected fields withheld.

## Known answer

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

## Why Vercel first

Native Notion Worker deployment requires workspace-owner enablement/permission. This preview service lets Red Dagger validate the exact deterministic contract using infrastructure already controlled by the project. If native Notion Worker access is later granted, this core can be ported without changing the canonical data contract.
