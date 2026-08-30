import axios from 'axios';
import { Candle } from '../models/candleData.js';
import { API } from '../../config/api.js';
import { buildAngelHeaders } from '../utils/angelHeaders.js';
import { historicalLimiter } from './historicalRateLimiter.js';

// AngelOne caps how much history you can request in a single call, per interval.
export const MAX_DAYS_BY_INTERVAL = {
  ONE_MINUTE: 30,
  THREE_MINUTE: 60,
  FIVE_MINUTE: 100,
  TEN_MINUTE: 100,
  FIFTEEN_MINUTE: 200,
  THIRTY_MINUTE: 200,
  ONE_HOUR: 400,
  ONE_DAY: 2000,
};

const pad = (n) => String(n).padStart(2, '0');

// AngelOne expects "YYYY-MM-DD HH:mm", no seconds, no timezone suffix.
const formatAngelDate = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;

const buildDateChunks = (fromDate, toDate, interval) => {
  const maxDays = MAX_DAYS_BY_INTERVAL[interval];
  const chunks = [];
  let chunkStart = new Date(fromDate);

  while (chunkStart < toDate) {
    const chunkEnd = new Date(chunkStart);
    chunkEnd.setDate(chunkEnd.getDate() + maxDays);
    if (chunkEnd > toDate) chunkEnd.setTime(toDate.getTime());

    chunks.push([new Date(chunkStart), chunkEnd]);
    chunkStart = new Date(chunkEnd);
  }

  return chunks;
};

const fetchCandleChunk = (exchange, symboltoken, interval, fromdate, todate, key, jwtToken) =>
  historicalLimiter.schedule(async () => {
    const config = {
      method: 'post',
      url: `${API.root}${API.candle_data}`,
      headers: buildAngelHeaders(key, jwtToken),
      data: JSON.stringify({ exchange, symboltoken, interval, fromdate, todate }),
    };
    const response = await axios(config);
    return response?.data;
  });

// Fetches [fromDate, toDate] for one instrument/interval, chunked to respect
// AngelOne's range limits and throttled through the shared rate limiter.
// Used by both the on-demand ingest endpoint and the daily refresh cron.
export const ingestCandleRange = async ({ exchange, symboltoken, interval, fromDate, toDate, key, jwtToken }) => {
  if (!MAX_DAYS_BY_INTERVAL[interval]) {
    throw new Error(`Unsupported interval: ${interval}`);
  }

  const chunks = buildDateChunks(fromDate, toDate, interval);
  console.log("this is chunks ", chunks);
  let stored = 0;
  const errors = [];

  for (const [chunkStart, chunkEnd] of chunks) {
    const from = formatAngelDate(chunkStart);
    const to = formatAngelDate(chunkEnd);

    try {
      const angelData = await fetchCandleChunk(exchange, symboltoken, interval, from, to, key, jwtToken);
      if (!angelData?.status) {
        errors.push({ from, to, message: angelData?.message || 'Chunk fetch failed' });
        continue;
      }

      const rows = angelData.data || [];
      if (!rows.length) continue;

      const operations = rows.map(([time, open, high, low, close, volume]) => ({
        updateOne: {
          filter: { token: symboltoken, exchange, interval, time: new Date(time) },
          update: { $set: { open, high, low, close, volume } },
          upsert: true,
        },
      }));

      const result = await Candle.bulkWrite(operations, { ordered: false });
      stored += (result.upsertedCount || 0) + (result.modifiedCount || 0);
    } catch (chunkError) {
      errors.push({ from, to, message: chunkError?.response?.data?.message || chunkError.message });
    }
  }

  return { chunks: chunks.length, stored, errors };
};
