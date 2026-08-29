import { Candle } from '../models/candleData.js';
import { ingestCandleRange, MAX_DAYS_BY_INTERVAL } from '../services/candleIngestion.js';

const ingestCandles = async (req, res) => {
  try {
    const { exchange, symboltoken, interval, fromdate, todate } = req.body;
    if (!exchange || !symboltoken || !interval || !fromdate || !todate) {
      return res.status(400).json({
        message: 'exchange, symboltoken, interval, fromdate and todate are required',
      });
    }
    if (!MAX_DAYS_BY_INTERVAL[interval]) {
      return res.status(400).json({
        message: `Unsupported interval. Use one of: ${Object.keys(MAX_DAYS_BY_INTERVAL).join(', ')}`,
      });
    }

    const fromDate = new Date(fromdate);
    const toDate = new Date(todate);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate >= toDate) {
      return res.status(400).json({ message: 'Invalid date range' });
    }

    const { key, jwtToken } = req.user;
    const result = await ingestCandleRange({ exchange, symboltoken, interval, fromDate, toDate, key, jwtToken });

    return res.status(200).json({ message: 'Candle ingestion complete', ...result });
  } catch (error) {
    console.log('Error in ingestCandles controller', error?.response?.data || error.message);
    return res.status(500).json({ message: 'Failed to ingest candle data', error: error.message });
  }
};

const getCandles = async (req, res) => {
  try {
    const { symboltoken, exchange, interval, from, to } = req.query;
    if (!symboltoken || !exchange || !interval) {
      return res.status(400).json({ message: 'symboltoken, exchange and interval are required' });
    }

    const filter = { token: symboltoken, exchange, interval };
    if (from || to) {
      filter.time = {};
      if (from) filter.time.$gte = new Date(from);
      if (to) filter.time.$lte = new Date(to);
    }

    const candles = await Candle.find(filter).sort({ time: 1 });
    return res.status(200).json({ message: 'OK', data: candles });
  } catch (error) {
    console.log('Error in getCandles controller', error.message);
    return res.status(500).json({ message: 'Failed to fetch candle data', error: error.message });
  }
};

export { ingestCandles, getCandles };
