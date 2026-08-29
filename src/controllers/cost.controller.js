import axios from 'axios';
import { CostProfile } from '../models/costProfile.js';
import { API } from '../../config/api.js';
import { buildAngelHeaders } from '../utils/angelHeaders.js';

// Charges/margin for a strategy are looked up by instrument type at run time,
// not fetched live per simulated trade — AngelOne's per-second rate limits
// make that unworkable across thousands of backtest fills. This endpoint
// takes one representative order per (exchange, instrumenttype, producttype,
// transactiontype) combo and caches the resulting breakdown for the engine
// to reuse.
const syncCostProfile = async (req, res) => {
  try {
    const {
      exchange,
      token,
      tradingsymbol,
      instrumenttype,
      producttype,
      transactiontype,
      quantity,
      price,
    } = req.body;

    if (
      !exchange ||
      !token ||
      !tradingsymbol ||
      !instrumenttype ||
      !producttype ||
      !transactiontype ||
      !quantity ||
      price === undefined
    ) {
      return res.status(400).json({
        message:
          'exchange, token, tradingsymbol, instrumenttype, producttype, transactiontype, quantity and price are required',
      });
    }

    const { key, jwtToken } = req.user;
    const headers = buildAngelHeaders(key, jwtToken);

    const chargesConfig = {
      method: 'post',
      url: `${API.root}${API.estimateCharges}`,
      headers,
      data: JSON.stringify({
        orders: [
          {
            product_type: producttype,
            transaction_type: transactiontype,
            quantity: String(quantity),
            price: String(price),
            exchange,
            symbol_name: tradingsymbol,
            token,
          },
        ],
      }),
    };

    const marginConfig = {
      method: 'post',
      url: `${API.root}${API.margin_api}`,
      headers,
      data: JSON.stringify({
        positions: [
          {
            exchange,
            qty: quantity,
            price,
            productType: producttype,
            token,
            tradeType: transactiontype,
          },
        ],
      }),
    };

    const [chargesResponse, marginResponse] = await Promise.all([axios(chargesConfig), axios(marginConfig)]);
    const chargesData = chargesResponse?.data;
    const marginData = marginResponse?.data;

    if (!chargesData?.status || !marginData?.status) {
      return res.status(502).json({
        message: 'AngelOne rejected the charges/margin estimate',
        charges: chargesData,
        margin: marginData,
      });
    }

    const costProfile = await CostProfile.findOneAndUpdate(
      { exchange, instrumenttype, producttype, transactiontype },
      {
        sample: { token, tradingsymbol, quantity, price },
        charges: chargesData.data,
        margin: marginData.data,
      },
      { upsert: true, new: true }
    );

    return res.status(200).json({ message: 'Cost profile synced', data: costProfile });
  } catch (error) {
    console.log('Error in syncCostProfile controller', error?.response?.data || error.message);
    return res.status(500).json({ message: 'Failed to sync cost profile', error: error.message });
  }
};

const getCostProfile = async (req, res) => {
  try {
    const { exchange, instrumenttype, producttype, transactiontype } = req.query;
    if (!exchange || !instrumenttype || !producttype || !transactiontype) {
      return res.status(400).json({
        message: 'exchange, instrumenttype, producttype and transactiontype are required',
      });
    }

    const costProfile = await CostProfile.findOne({ exchange, instrumenttype, producttype, transactiontype });
    if (!costProfile) {
      return res.status(404).json({ message: 'No cached cost profile for this combination yet' });
    }

    return res.status(200).json({ message: 'OK', data: costProfile });
  } catch (error) {
    console.log('Error in getCostProfile controller', error.message);
    return res.status(500).json({ message: 'Failed to fetch cost profile', error: error.message });
  }
};

export { syncCostProfile, getCostProfile };
