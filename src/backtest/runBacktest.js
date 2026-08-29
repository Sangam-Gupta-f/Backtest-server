import { resolveRiskLevel, updateTrailingLevel, buildAtrSeries } from './riskEngine.js';
import { computeMetrics } from './metrics.js';

const ATR_PERIOD = 14;

const entryAction = (direction) => (direction === 'LONG' ? 'BUY' : 'SELL');
const exitAction = (direction) => (direction === 'LONG' ? 'SELL' : 'BUY');

const applySlippage = (price, action, slippageBps) => {
  const factor = slippageBps / 10000;
  return action === 'BUY' ? price * (1 + factor) : price * (1 - factor);
};

const resolveQuantity = (sizing, price, equity) => {
  if (sizing.method === 'fixedQuantity') return Math.max(0, Math.floor(sizing.value));
  if (sizing.method === 'fixedCapital') return Math.max(0, Math.floor(sizing.value / price));
  if (sizing.method === 'percentEquity') return Math.max(0, Math.floor((equity * (sizing.value / 100)) / price));
  return 0;
};

// Bar-replay engine. Fill model (deliberately conservative to avoid lookahead bias):
//  - Entry / discretionary-exit signals are evaluated using data available
//    through bar i's CLOSE, then filled at bar i+1's OPEN — never at the
//    same close that produced the signal, since that price wasn't
//    actionable in real time when the signal fired.
//  - Stop-loss / target / trailing levels are resting orders: checked every
//    bar against that bar's HIGH/LOW and filled at the level itself,
//    same-bar, since they don't wait on a signal that needed a full bar
//    close to compute.
//  - Only one position open at a time across the whole strategy (no
//    pyramiding); if multiple trade plans signal on the same bar, the first
//    one in declaration order wins. Both are v1 simplifications.
export const runBacktest = ({ candles, tradePlans, initialCapital = 100000, slippageBps = 5, costLookup }) => {
  const atrSeries = buildAtrSeries(candles, ATR_PERIOD);

  let cash = initialCapital;
  let openPosition = null;
  let pendingEntry = null;
  let pendingExit = null;

  const trades = [];
  const equityCurve = [];
  const warnings = [];
  const missingCostCombos = new Set();

  const chargesFor = (plan, transactiontype) => {
    const lookup = costLookup?.(plan);
    if (!lookup) return 0;
    lookup.missing.forEach((side) => missingCostCombos.add(`${plan.entryNodeId}:${side}`));
    return lookup.getCharges(transactiontype);
  };

  const closePosition = (price, time, reason) => {
    const { plan, direction, entryPrice, quantity, entryTime } = openPosition;
    const fillPrice = applySlippage(price, exitAction(direction), slippageBps);

    const grossPnl = direction === 'LONG' ? (fillPrice - entryPrice) * quantity : (entryPrice - fillPrice) * quantity;
    const entryCharges = chargesFor(plan, entryAction(direction));
    const exitCharges = chargesFor(plan, exitAction(direction));
    const netPnl = grossPnl - entryCharges - exitCharges;

    cash += netPnl;

    trades.push({
      entryNodeId: plan.entryNodeId,
      direction,
      entryTime,
      entryPrice,
      exitTime: time,
      exitPrice: fillPrice,
      quantity,
      entryValue: entryPrice * quantity,
      grossPnl,
      charges: entryCharges + exitCharges,
      netPnl,
      exitReason: reason,
    });

    openPosition = null;
  };

  for (let i = 0; i < candles.length; i += 1) {
    const bar = candles[i];

    // 1. Fill anything queued from the previous bar's close, at this bar's open.
    if (openPosition && pendingExit) {
      closePosition(bar.open, bar.time, pendingExit.reason);
      pendingExit = null;
    }
    if (!openPosition && pendingEntry) {
      const { plan } = pendingEntry;
      const fillPrice = applySlippage(bar.open, entryAction(plan.direction), slippageBps);
      const quantity = resolveQuantity(plan.sizing, fillPrice, cash);
      if (quantity > 0) {
        openPosition = {
          plan,
          direction: plan.direction,
          entryPrice: fillPrice,
          quantity,
          entryTime: bar.time,
          extreme: fillPrice,
        };
      }
      pendingEntry = null;
    }

    // 2. Resting stop/target/trailing orders — checked intrabar every bar a position is open.
    if (openPosition) {
      const { plan, direction, entryPrice } = openPosition;
      openPosition.extreme =
        direction === 'LONG' ? Math.max(openPosition.extreme, bar.high) : Math.min(openPosition.extreme, bar.low);

      for (const rule of plan.riskRules) {
        const atrValue = rule.mode === 'atrMultiple' ? atrSeries[i] : null;
        const level =
          rule.kind === 'trailingStop'
            ? updateTrailingLevel(rule, direction, openPosition.extreme, atrValue)
            : resolveRiskLevel(rule, direction, entryPrice, atrValue);

        if (level === null) continue;

        const hit =
          rule.kind === 'target'
            ? direction === 'LONG'
              ? bar.high >= level
              : bar.low <= level
            : direction === 'LONG'
              ? bar.low <= level
              : bar.high >= level;

        if (hit) {
          closePosition(level, bar.time, rule.kind);
          break;
        }
      }
    }

    // 3. Evaluate signals at this bar's close, to act on next bar's open.
    if (openPosition) {
      if (openPosition.plan.exitSignal && openPosition.plan.exitSignal[i]) {
        pendingExit = { reason: 'signal' };
      }
    } else {
      const triggeredPlan = tradePlans.find((plan) => plan.entrySignal[i]);
      if (triggeredPlan) pendingEntry = { plan: triggeredPlan };
    }

    // 4. Mark to market for the equity curve.
    const unrealized = openPosition
      ? openPosition.direction === 'LONG'
        ? (bar.close - openPosition.entryPrice) * openPosition.quantity
        : (openPosition.entryPrice - bar.close) * openPosition.quantity
      : 0;
    equityCurve.push({ time: bar.time, equity: cash + unrealized });
  }

  if (missingCostCombos.size) {
    warnings.push(
      'No cached cost profile for one or more (instrument, side) combinations — those trades were costed at 0. Run POST /api/costs/sync for this instrument to get realistic P&L.'
    );
  }

  return {
    trades,
    equityCurve,
    metrics: computeMetrics(trades, equityCurve, initialCapital),
    warnings,
  };
};
