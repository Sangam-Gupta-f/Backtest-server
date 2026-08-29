export const computeMetrics = (trades, equityCurve, initialCapital) => {
  if (!trades.length) {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalPnl: 0,
      totalReturnPct: 0,
      maxDrawdownPct: 0,
      profitFactor: null,
      avgWin: 0,
      avgLoss: 0,
      sharpePerTrade: null,
    };
  }

  const wins = trades.filter((t) => t.netPnl > 0);
  const losses = trades.filter((t) => t.netPnl <= 0);
  const totalPnl = trades.reduce((sum, t) => sum + t.netPnl, 0);

  const grossWin = wins.reduce((sum, t) => sum + t.netPnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.netPnl, 0));

  let peak = initialCapital;
  let maxDrawdownPct = 0;
  for (const point of equityCurve) {
    peak = Math.max(peak, point.equity);
    const drawdownPct = peak > 0 ? ((peak - point.equity) / peak) * 100 : 0;
    maxDrawdownPct = Math.max(maxDrawdownPct, drawdownPct);
  }

  const returns = trades.map((t) => t.netPnl / t.entryValue);
  const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - meanReturn) ** 2, 0) / returns.length;
  const stdDev = Math.sqrt(variance);

  return {
    totalTrades: trades.length,
    winningTrades: wins.length,
    losingTrades: losses.length,
    winRate: (wins.length / trades.length) * 100,
    totalPnl,
    totalReturnPct: (totalPnl / initialCapital) * 100,
    maxDrawdownPct,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? -grossLoss / losses.length : 0,
    // Deliberately NOT annualized — that requires assuming a trading
    // frequency this engine has no basis to guess from a single run.
    // Fine for comparing strategies on the same instrument/interval;
    // don't treat it as a textbook annualized Sharpe ratio.
    sharpePerTrade: stdDev > 0 ? meanReturn / stdDev : null,
  };
};
