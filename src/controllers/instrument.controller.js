import axios from 'axios';
import { Instrument } from '../models/instrument.js';
import { API } from '../../config/api.js';

const BATCH_SIZE = 5000;

const syncInstruments = async (req, res) => {
  try {
    const { data } = await axios.get(API.instrument_master, { timeout: 60000 });

    if (!Array.isArray(data)) {
      return res.status(502).json({ message: 'Unexpected instrument master format' });
    }
    console.log("Data fetch sucessfully, Now trying to DB insert")
    let upserted = 0;

    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      const batch = data.slice(i, i + BATCH_SIZE);
      const operations = batch
        .filter((row) => row.token && row.exch_seg)
        .map((row) => ({
          updateOne: {
            filter: { token: row.token, exch_seg: row.exch_seg },
            update: {
              $set: {
                token: row.token,
                symbol: row.symbol,
                name: row.name,
                expiry: row.expiry,
                strike: Number(row.strike),
                lotsize: Number(row.lotsize),
                instrumenttype: row.instrumenttype,
                exch_seg: row.exch_seg,
                tick_size: Number(row.tick_size),
              },
            },
            upsert: true,
          },
        }));

      if (operations.length) {
        const result = await Instrument.bulkWrite(operations, { ordered: false });
        upserted += (result.upsertedCount || 0) + (result.modifiedCount || 0);
        console.log("total Write instrument in DB ",upserted);
      }
    }

    return res.status(200).json({
      message: 'Instrument master synced',
      total: data.length,
      upserted,
    });
  } catch (error) {
    console.log('Error in syncInstruments controller', error?.response?.data || error.message);
    return res.status(500).json({ message: 'Failed to sync instrument master', error: error.message });
  }
};

const searchInstruments = async (req, res) => {
  try {
    const { query, exchange } = req.query;
    if (!query || query.trim().length < 2) {
      return res.status(400).json({ message: 'Provide at least 2 characters to search' });
    }

    const filter = {
      $or: [
        { symbol: { $regex: query, $options: 'i' } },
        { name: { $regex: query, $options: 'i' } },
      ],
    };
    if (exchange) filter.exch_seg = exchange;

    const instruments = await Instrument.find(filter).limit(25);
    return res.status(200).json({ message: 'OK', data: instruments });
  } catch (error) {
    console.log('Error in searchInstruments controller', error.message);
    return res.status(500).json({ message: 'Failed to search instruments', error: error.message });
  }
};

export { syncInstruments, searchInstruments };
