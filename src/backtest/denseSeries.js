// Indicator/condition/logic outputs from Phase 2-3 are computed once over the
// *entire* candle history (safe: SMA/RSI/MACD/etc. at bar i only ever depend
// on bars <= i, so precomputing the whole series up front introduces no
// lookahead). But technicalindicators drops warm-up bars it can't compute,
// so each series needs to be re-expanded ("densified") back to one value per
// candle — null where the underlying indicator had no value yet — so every
// node's output can be looked up by the same bar index during replay.

export const buildDenseFromTimedSeries = (candles, timedSeries, pick = (v) => v) => {
  const byTime = new Map(timedSeries.map((point) => [point.time.getTime(), pick(point)]));
  return candles.map((candle) => {
    const value = byTime.get(candle.time.getTime());
    return value === undefined ? null : value;
  });
};

export const buildDenseFromField = (candles, field) => candles.map((candle) => candle[field]);

export const buildDenseConstant = (candles, value) => candles.map(() => value);

const compareOp = (operator, left, right) => {
  switch (operator) {
    case 'gt': return left > right;
    case 'gte': return left >= right;
    case 'lt': return left < right;
    case 'lte': return left <= right;
    case 'eq': return left === right;
    default: return false;
  }
};

// Elementwise comparison of two dense series. Crosses need the previous bar
// too, so they're handled with a one-bar lookback rather than pointwise.
export const evaluateCondition = (operator, left, right) => {
  const length = left.length;
  const result = new Array(length).fill(false);

  for (let i = 0; i < length; i += 1) {
    const l = left[i];
    const r = right[i];
    if (l === null || r === null) continue;

    if (operator === 'crossesAbove' || operator === 'crossesBelow') {
      if (i === 0) continue;
      const prevL = left[i - 1];
      const prevR = right[i - 1];
      if (prevL === null || prevR === null) continue;
      result[i] =
        operator === 'crossesAbove' ? prevL <= prevR && l > r : prevL >= prevR && l < r;
      continue;
    }

    result[i] = compareOp(operator, l, r);
  }

  return result;
};

export const evaluateLogic = (operator, a, b) => {
  const length = a.length;
  const result = new Array(length).fill(false);

  for (let i = 0; i < length; i += 1) {
    if (operator === 'not') {
      result[i] = a[i] === null ? false : !a[i];
      continue;
    }
    const av = a[i] === null ? false : a[i];
    const bv = b[i] === null ? false : b[i];
    result[i] = operator === 'and' ? av && bv : av || bv;
  }

  return result;
};
