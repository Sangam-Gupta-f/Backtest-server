import cron from 'node-cron';
import { Candle } from '../models/candleData.js';
import User from '../models/user.js';
import { ingestCandleRange } from '../services/candleIngestion.js';

const getSessionUser = async () => User.findOne({ jwtToken: { $exists: true, $ne: null } }).sort({ updatedAt: -1 });

// Candle data is shared market data, not user-owned — any one user's live
// AngelOne session is enough to refresh the whole cache. AngelOne's jwtToken
// is only valid ~24h and a full re-login needs a fresh TOTP code, which can't
// be generated unattended from what's stored today, so an expired session
// just skips this run rather than failing loudly — log in again to resume it.
const refreshTrackedCandles = async () => {
  const user = await getSessionUser();
  if (!user) {
    console.log('[candle-refresh] No logged-in user session available, skipping refresh');
    return;
  }

  if (!user.jwtTokenExpiresAt || user.jwtTokenExpiresAt <= new Date()) {
    console.log(
      `[candle-refresh] Session for ${user.clientcode} has expired and needs a fresh TOTP login — skipping until then`
    );
    return;
  }

  const trackedInstruments = await Candle.aggregate([
    {
      $group: {
        _id: { token: '$token', exchange: '$exchange', interval: '$interval' },
        lastTime: { $max: '$time' },
      },
    },
  ]);

  console.log(`[candle-refresh] Refreshing ${trackedInstruments.length} tracked instrument/interval combos`);

  for (const { _id, lastTime } of trackedInstruments) {
    const { token, exchange, interval } = _id;
    const fromDate = new Date(lastTime);
    const toDate = new Date();

    if (fromDate >= toDate) continue;

    try {
      const result = await ingestCandleRange({
        exchange,
        symboltoken: token,
        interval,
        fromDate,
        toDate,
        key: user.key,
        jwtToken: user.jwtToken,
      });
      console.log(`[candle-refresh] ${exchange}:${token} (${interval}) — stored ${result.stored} new candles`);
    } catch (error) {
      console.log(`[candle-refresh] Failed for ${exchange}:${token} (${interval})`, error.message);
    }
  }
};

// Runs weekdays shortly after NSE/BSE close (15:30 IST) with a buffer.
const scheduleCandleRefreshJob = () => {
  cron.schedule('0 18 * * 1-5', refreshTrackedCandles, { timezone: 'Asia/Kolkata' });
  console.log('[candle-refresh] Daily refresh cron scheduled for 18:00 IST on weekdays');
};

export { scheduleCandleRefreshJob, refreshTrackedCandles };
