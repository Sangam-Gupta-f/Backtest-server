import { Candle } from '../models/candleData.js';
import { INDICATORS } from '../indicators/index.js';

const computeIndicator = async (req, res) => {
  try {
    const { type, symboltoken, exchange, interval, from, to, ...params } = req.query;

    if (!type || !symboltoken || !exchange || !interval) {
      return res.status(400).json({ message: 'type, symboltoken, exchange and interval are required' });
    }

    const indicatorFn = INDICATORS[type];
    if (!indicatorFn) {
      return res.status(400).json({
        message: `Unknown indicator "${type}". Available: ${Object.keys(INDICATORS).join(', ')}`,
      });
    }

    const filter = { token: symboltoken, exchange, interval };
    if (from || to) {
      filter.time = {};
      if (from) filter.time.$gte = new Date(from);
      if (to) filter.time.$lte = new Date(to);
    }

    const candles = await Candle.find(filter).sort({ time: 1 });
    if (!candles.length) {
      return res.status(404).json({ message: 'No cached candles for this instrument/interval yet' });
    }

    const numericParams = Object.fromEntries(
      Object.entries(params).map(([k, v]) => [k, Number.isNaN(Number(v)) ? v : Number(v)])
    );

    const series = indicatorFn(candles, numericParams);
    return res.status(200).json({ message: 'OK', type, count: series.length, data: series });
  } catch (error) {
    console.log('Error in computeIndicator controller', error.message);
    return res.status(500).json({ message: 'Failed to compute indicator', error: error.message });
  }
};

export { computeIndicator };
