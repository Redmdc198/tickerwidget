"use strict";

function round(value, decimals = 4) {
  if (value == null || !Number.isFinite(value)) return value;
  const p = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * p) / p;
}

function normalizeAction(action) {
  const a = String(action || "").trim().toUpperCase();
  if (["BUY", "BOT", "B"].includes(a)) return "BUY";
  if (["SELL", "SOLD", "SLD", "S"].includes(a)) return "SELL";
  return a;
}

function dedupeKey(row) {
  if (row.brokerExecutionId) return `exec:${row.brokerExecutionId}`;
  if (row.brokerOrderId) {
    return `order:${row.brokerOrderId}|${row.timestamp}|${normalizeAction(row.action)}|${row.shares}|${row.price}`;
  }
  return `derived:${row.source || "unknown"}|${row.importBatch || "unknown"}|${row.ticker}|${row.timestamp}|${normalizeAction(row.action)}|${row.shares}|${row.price}`;
}

function idToken(value) {
  return String(value || "PACKET").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "PACKET";
}

function elapsedSeconds(first, last) {
  const a = Date.parse(first);
  const b = Date.parse(last);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 1000);
}

function calculateRows(rows) {
  const buys = rows.filter(x => x.action === "BUY");
  const sells = rows.filter(x => x.action === "SELL");
  const buyShares = buys.reduce((s, x) => s + x.shares, 0);
  const sellShares = sells.reduce((s, x) => s + x.shares, 0);
  const buyGross = buys.reduce((s, x) => s + x.shares * x.price, 0);
  const sellGross = sells.reduce((s, x) => s + x.shares * x.price, 0);
  const fees = rows.reduce((s, x) => s + x.fees, 0);
  const firstExecution = rows[0]?.timestamp || null;
  const lastExecution = rows[rows.length - 1]?.timestamp || null;
  return {
    boughtShares: buyShares,
    soldShares: sellShares,
    remainingShares: buyShares - sellShares,
    executionCount: rows.length,
    entryFillCount: buys.length,
    exitFillCount: sells.length,
    weightedEntry: buyShares ? round(buyGross / buyShares, 4) : null,
    weightedExit: sellShares ? round(sellGross / sellShares, 4) : null,
    weightedEntryRaw: buyShares ? buyGross / buyShares : null,
    weightedExitRaw: sellShares ? sellGross / sellShares : null,
    grossCost: round(buyGross, 6),
    grossProceeds: round(sellGross, 6),
    grossPnl: round(sellGross - buyGross, 6),
    grossPnlDisplay: round(sellGross - buyGross, 2),
    fees: round(fees, 6),
    firstExecution,
    lastExecution,
    elapsedSeconds: firstExecution && lastExecution ? elapsedSeconds(firstExecution, lastExecution) : null,
    finalState: buyShares === sellShares ? "Flat" : "Open"
  };
}

function reconstruct(input) {
  const warnings = [];
  if (!input || !Array.isArray(input.executions) || !input.executions.length) {
    return { status: "ERROR", warnings: ["executions[] is required"] };
  }
  if (Number(input.startingPosition) !== 0) {
    return {
      status: "NEEDS_EVIDENCE",
      warnings: ["RD-WORKER-TRADE-RECON-1.1 requires a proven flat starting anchor (startingPosition=0)."]
    };
  }

  const seen = new Set();
  const normalized = [];
  const duplicates = [];

  for (const raw of input.executions) {
    const row = {
      ticker: String(raw.ticker || "").trim().toUpperCase(),
      timestamp: String(raw.timestamp || "").trim(),
      action: normalizeAction(raw.action),
      shares: Number(raw.shares),
      price: Number(raw.price),
      fees: raw.fees == null ? 0 : Number(raw.fees),
      brokerExecutionId: raw.brokerExecutionId || null,
      brokerOrderId: raw.brokerOrderId || null,
      source: raw.source || input.source || null,
      importBatch: raw.importBatch || input.importBatch || null
    };
    if (!row.ticker || !row.timestamp || !["BUY", "SELL"].includes(row.action) ||
        !Number.isFinite(row.shares) || row.shares <= 0 ||
        !Number.isFinite(row.price) || row.price <= 0 ||
        !Number.isFinite(row.fees)) {
      return { status: "ERROR", warnings: ["Invalid execution row", raw] };
    }
    const key = dedupeKey(row);
    if (seen.has(key)) {
      duplicates.push(key);
      continue;
    }
    seen.add(key);
    normalized.push({ ...row, dedupeKey: key });
  }

  normalized.sort((a,b) => a.timestamp.localeCompare(b.timestamp));
  const tickers = [...new Set(normalized.map(x => x.ticker))];
  if (tickers.length !== 1) {
    return { status: "CONFLICT", warnings: ["A reconstruction packet must contain exactly one ticker."], tickers };
  }

  const ticker = tickers[0];
  const idBase = `${idToken(ticker)}-${idToken(input.importBatch || "PACKET")}`;
  let position = 0;
  const trace = [0];
  const classified = [];
  const positionCycles = [];
  let activeCycle = null;
  let cycleNumber = 0;

  for (const row of normalized) {
    const before = position;
    if (row.action === "BUY") position += row.shares;
    else position -= row.shares;

    if (position < 0) {
      return {
        status: "CONFLICT",
        warnings: ["Running position crossed below zero; short/flip handling is not authorized in RD-WORKER-TRADE-RECON-1.1."],
        offendingExecution: row,
        runningPositionTrace: trace,
        positionCycles
      };
    }

    let positionEffect;
    if (before === 0 && position > 0) {
      positionEffect = "Open";
      cycleNumber += 1;
      activeCycle = {
        positionCycleId: `${idBase}-PC-${String(cycleNumber).padStart(2, "0")}`,
        cycleNumber,
        ticker,
        executionRows: [],
        openedAt: row.timestamp,
        closedAt: null,
        finalState: "Open"
      };
    } else if (row.action === "BUY" && position > before) {
      positionEffect = "Add";
    } else if (row.action === "SELL" && position > 0) {
      positionEffect = "Trim";
    } else if (row.action === "SELL" && position === 0) {
      positionEffect = "Close";
    } else {
      return { status: "CONFLICT", warnings: ["Unclassifiable position transition."], row, before, after: position };
    }

    if (!activeCycle) {
      return { status: "CONFLICT", warnings: ["Execution occurred without an active position cycle."], row };
    }

    const classifiedRow = {
      ...row,
      positionBefore: before,
      positionAfter: position,
      positionEffect,
      positionCycleId: activeCycle.positionCycleId
    };
    classified.push(classifiedRow);
    activeCycle.executionRows.push(classifiedRow);
    trace.push(position);

    if (positionEffect === "Close") {
      activeCycle.closedAt = row.timestamp;
      activeCycle.finalState = "Flat";
      activeCycle.calculations = calculateRows(activeCycle.executionRows);
      positionCycles.push(activeCycle);
      activeCycle = null;
    }
  }

  if (activeCycle) {
    activeCycle.finalState = "Open";
    activeCycle.calculations = calculateRows(activeCycle.executionRows);
    positionCycles.push(activeCycle);
  }

  if (!positionCycles.length) {
    return { status: "CONFLICT", warnings: ["No position cycle could be reconstructed."] };
  }

  const packetCalculations = calculateRows(classified);
  packetCalculations.remainingShares = position;
  packetCalculations.finalState = position === 0 ? "Flat" : "Open";

  const continuity = input.campaignContinuity || null;
  const captainConfirmedSame = positionCycles.length > 1 &&
    continuity?.status === "CONFIRMED_SAME_CAMPAIGN" &&
    continuity?.confirmedBy === "Captain";
  const captainConfirmedSeparate = positionCycles.length > 1 &&
    continuity?.status === "CONFIRMED_SEPARATE_CAMPAIGNS" &&
    continuity?.confirmedBy === "Captain";

  let campaignBoundaryStatus = "RESOLVED";
  let campaigns = [];

  const makeCampaign = (cycleGroup, index, explicitId = null) => {
    const executionRows = cycleGroup.flatMap(c => c.executionRows);
    const calc = calculateRows(executionRows);
    return {
      tradeCampaignId: explicitId || `${idBase}-TC-${String(index).padStart(2, "0")}`,
      ticker,
      positionCycleIds: cycleGroup.map(c => c.positionCycleId),
      positionCycleCount: cycleGroup.length,
      openedAt: executionRows[0]?.timestamp || null,
      closedAt: calc.finalState === "Flat" ? executionRows[executionRows.length - 1]?.timestamp || null : null,
      calculations: calc,
      continuityBasis: cycleGroup.length === 1 ? "SINGLE_POSITION_CYCLE" : continuity
    };
  };

  if (positionCycles.length === 1) {
    campaigns = [makeCampaign(positionCycles, 1, input.tradeCampaignId || null)];
  } else if (captainConfirmedSame) {
    campaigns = [makeCampaign(positionCycles, 1, input.tradeCampaignId || continuity.tradeCampaignId || null)];
  } else if (captainConfirmedSeparate) {
    campaigns = positionCycles.map((c, i) => makeCampaign([c], i + 1));
  } else {
    campaignBoundaryStatus = "NEEDS_CAPTAIN_CONFIRMATION";
    warnings.push("Multiple broker-proven Position Cycles detected. Flat proposes a campaign boundary but does not finalize it; Captain continuity is required before merge/split.");
  }

  const status = position !== 0
    ? "NEEDS_EVIDENCE"
    : campaignBoundaryStatus === "NEEDS_CAPTAIN_CONFIRMATION"
      ? "CONFLICT"
      : "PASS";

  const buys = classified.filter(x => x.action === "BUY");
  const sells = classified.filter(x => x.action === "SELL");

  return {
    status,
    workerContract: "RD-WORKER-TRADE-RECON-1.1",
    protocolVersion: "CSV_RECON_v1.3",
    mode: "READ_ONLY_PROPOSAL",
    ticker,
    sourceTrace: {
      source: input.source || null,
      importBatch: input.importBatch || null,
      startingPosition: 0,
      anchor: input.positionAnchor || "Caller asserted proven flat anchor",
      campaignContinuity: continuity
    },
    dedupeReport: {
      inputRows: input.executions.length,
      acceptedRows: classified.length,
      duplicatesRemoved: duplicates.length,
      duplicateKeys: duplicates
    },
    campaignBoundaryStatus,
    positionCycles: positionCycles.map(c => ({
      positionCycleId: c.positionCycleId,
      cycleNumber: c.cycleNumber,
      ticker: c.ticker,
      openedAt: c.openedAt,
      closedAt: c.closedAt,
      finalState: c.finalState,
      executionKeys: c.executionRows.map(x => x.dedupeKey),
      calculations: c.calculations
    })),
    campaigns,
    calculations: packetCalculations,
    calculationScope: campaigns.length === 1 ? "RESOLVED_TRADE_CAMPAIGN" : "PACKET_TOTALS",
    runningPositionTrace: trace,
    normalizedExecutions: classified,
    chartAnnotationPacket: {
      rawEvidenceMustRemainUnmodified: true,
      positionCycleCount: positionCycles.length,
      entry: {
        color: "GREEN",
        fillCount: buys.length,
        shares: packetCalculations.boughtShares,
        weightedPrice: packetCalculations.weightedEntry,
        gross: packetCalculations.grossCost,
        startTime: buys[0]?.timestamp || null,
        endTime: buys[buys.length - 1]?.timestamp || null
      },
      exit: {
        color: "RED",
        fillCount: sells.length,
        shares: packetCalculations.soldShares,
        weightedPrice: packetCalculations.weightedExit,
        gross: packetCalculations.grossProceeds,
        startTime: sells[0]?.timestamp || null,
        endTime: sells[sells.length - 1]?.timestamp || null
      }
    },
    protectedFieldsWithheld: [
      "Captain Confirmed","Thesis","Invalidation","Psychology","Lesson",
      "Catalyst Grade","Observed Setup","Planned Playbook","VWAP interpretation","Readiness"
    ],
    proposedNotionWrites: [],
    warnings
  };
}

module.exports = { reconstruct };
