"use strict";

function round(value, decimals = 4) {
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

function reconstruct(input) {
  const warnings = [];
  if (!input || !Array.isArray(input.executions) || !input.executions.length) {
    return { status: "ERROR", warnings: ["executions[] is required"] };
  }
  if (Number(input.startingPosition) !== 0) {
    return {
      status: "NEEDS_EVIDENCE",
      warnings: ["BP-3 v1.0 only authorizes a proven flat starting anchor (startingPosition=0)."]
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
    return { status: "CONFLICT", warnings: ["A BP-3 campaign packet must contain exactly one ticker."], tickers };
  }

  let position = 0;
  const trace = [0];
  const classified = [];
  let buyShares=0, sellShares=0, buyGross=0, sellGross=0, fees=0;
  let opened = false, closed = false;

  for (const row of normalized) {
    const before = position;
    if (row.action === "BUY") position += row.shares;
    else position -= row.shares;

    if (position < 0) {
      return {
        status: "CONFLICT",
        warnings: ["Running position crossed below zero; short/flip handling is not authorized in BP-3 v1.0."],
        offendingExecution: row,
        runningPositionTrace: trace
      };
    }

    let positionEffect;
    if (before === 0 && position > 0) {
      if (closed) {
        return {
          status: "CONFLICT",
          warnings: ["More than one flat-to-flat campaign detected in one packet. Split campaigns before reconstruction."]
        };
      }
      positionEffect = "Open";
      opened = true;
    } else if (row.action === "BUY" && position > before) {
      positionEffect = "Add";
    } else if (row.action === "SELL" && position > 0) {
      positionEffect = "Trim";
    } else if (row.action === "SELL" && position === 0) {
      positionEffect = "Close";
      closed = true;
    } else {
      return { status: "CONFLICT", warnings: ["Unclassifiable position transition."], row, before, after: position };
    }

    if (row.action === "BUY") {
      buyShares += row.shares;
      buyGross += row.shares * row.price;
    } else {
      sellShares += row.shares;
      sellGross += row.shares * row.price;
    }
    fees += row.fees;
    trace.push(position);
    classified.push({ ...row, positionBefore: before, positionAfter: position, positionEffect });
  }

  if (!opened) return { status: "CONFLICT", warnings: ["No opening execution found."] };

  const weightedEntry = buyShares ? buyGross / buyShares : null;
  const weightedExit = sellShares ? sellGross / sellShares : null;
  const grossPnl = sellGross - buyGross;
  const firstBuy = classified.find(x => x.action === "BUY");
  const buys = classified.filter(x => x.action === "BUY");
  const sells = classified.filter(x => x.action === "SELL");

  return {
    status: position === 0 ? "PASS" : "NEEDS_EVIDENCE",
    workerContract: "RD-WORKER-FTFT-1.0",
    mode: "READ_ONLY_PROPOSAL",
    ticker: tickers[0],
    sourceTrace: {
      source: input.source || null,
      importBatch: input.importBatch || null,
      startingPosition: 0,
      anchor: input.positionAnchor || "Caller asserted proven flat anchor"
    },
    dedupeReport: {
      inputRows: input.executions.length,
      acceptedRows: classified.length,
      duplicatesRemoved: duplicates.length,
      duplicateKeys: duplicates
    },
    calculations: {
      boughtShares: buyShares,
      soldShares: sellShares,
      remainingShares: position,
      executionCount: classified.length,
      entryFillCount: buys.length,
      exitFillCount: sells.length,
      weightedEntry: round(weightedEntry, 4),
      weightedExit: round(weightedExit, 4),
      weightedEntryRaw: weightedEntry,
      weightedExitRaw: weightedExit,
      grossCost: round(buyGross, 6),
      grossProceeds: round(sellGross, 6),
      grossPnl: round(grossPnl, 6),
      grossPnlDisplay: round(grossPnl, 2),
      fees: round(fees, 6),
      firstExecution: classified[0]?.timestamp || null,
      lastExecution: classified[classified.length-1]?.timestamp || null,
      finalState: position === 0 ? "Flat" : "Open"
    },
    runningPositionTrace: trace,
    normalizedExecutions: classified,
    chartAnnotationPacket: {
      rawEvidenceMustRemainUnmodified: true,
      entry: {
        color: "GREEN",
        fillCount: buys.length,
        shares: buyShares,
        weightedPrice: round(weightedEntry, 4),
        gross: round(buyGross, 6),
        startTime: firstBuy?.timestamp || null,
        endTime: buys[buys.length-1]?.timestamp || null
      },
      exit: {
        color: "RED",
        fillCount: sells.length,
        shares: sellShares,
        weightedPrice: round(weightedExit, 4),
        gross: round(sellGross, 6),
        startTime: sells[0]?.timestamp || null,
        endTime: sells[sells.length-1]?.timestamp || null
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
