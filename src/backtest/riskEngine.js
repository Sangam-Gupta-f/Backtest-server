import { atr as computeAtr } from '../indicators/index.js';
import { buildDenseFromTimedSeries } from './denseSeries.js';

const DEFAULT_ATR_PERIOD = 14;

// atrMultiple risk rules aren't wired to a graph indicator node in the v1 DSL
// (riskRule only accepts a "position" input, not a "series" one) — they
// compute their own ATR(14) directly against the candle history instead of
// reading a user-placed indicator node. Documented v1 simplification.
export const buildAtrSeries = (candles, period = DEFAULT_ATR_PERIOD) => {
  const timed = computeAtr(candles, { period });
  return buildDenseFromTimedSeries(candles, timed);
};

const offsetFromMode = (basePrice, mode, value, atrValue) => {
  if (mode === 'percent') return basePrice * (value / 100);
  if (mode === 'points') return value;
  if (mode === 'atrMultiple') return (atrValue ?? 0) * value;
  return 0;
};

// Absolute price level at which a stopLoss/target should trigger for a
// LONG/SHORT position opened at entryPrice. Returns null if it can't be
// computed yet (e.g. ATR still warming up) — the caller should skip the
// rule for that bar rather than treat it as triggered or not triggered.
export const resolveRiskLevel = (rule, direction, entryPrice, atrValue) => {
  if (rule.mode === 'atrMultiple' && (atrValue === null || atrValue === undefined)) return null;
  const offset = offsetFromMode(entryPrice, rule.mode, rule.value, atrValue);

  if (rule.kind === 'stopLoss') return direction === 'LONG' ? entryPrice - offset : entryPrice + offset;
  if (rule.kind === 'target') return direction === 'LONG' ? entryPrice + offset : entryPrice - offset;
  return null;
};

// Trailing stops move every bar with the trade's favorable extreme since
// entry, so — unlike stopLoss/target — they need that running extreme
// threaded in from the replay loop rather than being a single static level.
export const updateTrailingLevel = (rule, direction, extremeSinceEntry, atrValue) => {
  if (rule.mode === 'atrMultiple' && (atrValue === null || atrValue === undefined)) return null;
  const offset = offsetFromMode(extremeSinceEntry, rule.mode, rule.value, atrValue);
  return direction === 'LONG' ? extremeSinceEntry - offset : extremeSinceEntry + offset;
};
