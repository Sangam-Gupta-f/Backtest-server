import { Candle } from '../models/candleData.js';
import { Instrument } from '../models/instrument.js';
import { validateStrategy } from '../strategy/validateStrategy.js';
import { compileStrategy } from '../backtest/compileStrategy.js';
import { runBacktest } from '../backtest/runBacktest.js';
import { buildCostLookup } from '../backtest/costs.js';

const run = async (req, res) => {
  try {
    const { strategy, from, to, initialCapital, slippageBps } = req.body;

    if (!strategy || typeof strategy !== 'object') {
      return res.status(400).json({ message: 'strategy graph is required' });
    }

    const validation = validateStrategy(strategy);
    if (!validation.valid) {
      return res.status(422).json({ message: 'Strategy failed validation', ...validation });
    }

    const dataSourceNode = strategy.nodes.find((node) => node.type === 'dataSource');
    const { exchange, symboltoken, interval } = dataSourceNode.data;

    const filter = { token: symboltoken, exchange, interval };
    if (from || to) {
      filter.time = {};
      if (from) filter.time.$gte = new Date(from);
      if (to) filter.time.$lte = new Date(to);
    }

    const candles = await Candle.find(filter).sort({ time: 1 }).lean();
    if (candles.length < 30) {
      return res.status(422).json({
        message: 'Not enough cached candles to run a backtest — ingest more history first (need 30+ bars)',
        cachedCandles: candles.length,
      });
    }

    const instrument = await Instrument.findOne({ token: symboltoken, exch_seg: exchange });
    const { tradePlans } = compileStrategy(strategy, candles);

    const costLookupsByPlan = new Map();
    for (const plan of tradePlans) {
      const lookup = await buildCostLookup({
        exchange,
        instrumenttype: instrument?.instrumenttype || 'EQ',
        producttype: plan.producttype,
      });
      costLookupsByPlan.set(plan.entryNodeId, lookup);
    }

    const result = runBacktest({
      candles,
      tradePlans,
      initialCapital: initialCapital ?? 100000,
      slippageBps: slippageBps ?? 5,
      costLookup: (plan) => costLookupsByPlan.get(plan.entryNodeId),
    });

    return res.status(200).json({
      message: 'Backtest complete',
      candles: candles.length,
      warnings: [...validation.warnings, ...result.warnings],
      trades: result.trades,
      equityCurve: result.equityCurve,
      metrics: result.metrics,
    });
  } catch (error) {
    console.log('Error in backtest run controller', error.message);
    return res.status(500).json({ message: 'Failed to run backtest', error: error.message });
  }
};

export { run };
