import { SMA, EMA, RSI, MACD, BollingerBands, ATR } from 'technicalindicators';

// Pure functions: candles in, indicator series out. No DB access, no HTTP,
// no AngelOne — safe to unit test directly and to reuse from the future
// backtest engine and from an HTTP endpoint alike.

const closes = (candles) => candles.map((c) => c.close);
const highs = (candles) => candles.map((c) => c.high);
const lows = (candles) => candles.map((c) => c.low);

// technicalindicators drops the warm-up bars it can't compute (e.g. a 20-period
// SMA has no value for the first 19 candles). This re-aligns its output back
// onto the original candle timestamps so callers can zip indicator values
// with the bars they describe instead of guessing the offset themselves.
const alignToCandles = (candles, values) => {
  const offset = candles.length - values.length;
  return values.map((value, i) => ({ time: candles[offset + i].time, value }));
};

export const sma = (candles, { period = 20 } = {}) => {
  const values = SMA.calculate({ period, values: closes(candles) });
  return alignToCandles(candles, values);
};

export const ema = (candles, { period = 20 } = {}) => {
  const values = EMA.calculate({ period, values: closes(candles) });
  return alignToCandles(candles, values);
};

export const rsi = (candles, { period = 14 } = {}) => {
  const values = RSI.calculate({ period, values: closes(candles) });
  return alignToCandles(candles, values);
};

export const macd = (candles, { fastPeriod = 12, slowPeriod = 26, signalPeriod = 9 } = {}) => {
  const values = MACD.calculate({
    values: closes(candles),
    fastPeriod,
    slowPeriod,
    signalPeriod,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  return alignToCandles(candles, values).map(({ time, value }) => ({
    time,
    macd: value.MACD,
    signal: value.signal,
    histogram: value.histogram,
  }));
};

export const bollingerBands = (candles, { period = 20, stdDev = 2 } = {}) => {
  const values = BollingerBands.calculate({ period, stdDev, values: closes(candles) });
  return alignToCandles(candles, values).map(({ time, value }) => ({
    time,
    upper: value.upper,
    middle: value.middle,
    lower: value.lower,
  }));
};

export const atr = (candles, { period = 14 } = {}) => {
  const values = ATR.calculate({ period, high: highs(candles), low: lows(candles), close: closes(candles) });
  return alignToCandles(candles, values);
};

// Lookup registry — this is what the future strategy DSL will use to resolve
// a drag-and-drop indicator node (e.g. { type: "rsi", params: { period: 14 } })
// to the function that computes it.
export const INDICATORS = { sma, ema, rsi, macd, bollingerBands, atr };
