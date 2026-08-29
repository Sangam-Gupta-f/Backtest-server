import { CostProfile } from '../models/costProfile.js';

// AngelOne's estimateCharges response schema isn't verified against a live
// sandbox response here — this tries the shapes documented/seen in
// community SDKs and falls back to 0 rather than silently guessing wrong.
// Revisit against a real response before trusting absolute cost numbers.
const extractTotalCharges = (charges) => {
  if (!charges) return 0;
  const candidates = [
    charges?.summary?.total_charges,
    charges?.total_charges,
    Array.isArray(charges) ? charges[0]?.total_charges : undefined,
    Array.isArray(charges?.charges) ? charges.charges[0]?.total_charges : undefined,
  ];
  const found = candidates.find((value) => typeof value === 'number');
  return found ?? 0;
};

// A backtest can generate thousands of simulated fills; calling AngelOne's
// estimateCharges live per fill isn't workable under its rate limits. This
// looks up the one cached profile per (exchange, instrumenttype,
// producttype, side) instead — see cost.controller.js's syncCostProfile for
// how that cache gets populated.
export const buildCostLookup = async ({ exchange, instrumenttype, producttype }) => {
  const [buyProfile, sellProfile] = await Promise.all([
    CostProfile.findOne({ exchange, instrumenttype, producttype, transactiontype: 'BUY' }),
    CostProfile.findOne({ exchange, instrumenttype, producttype, transactiontype: 'SELL' }),
  ]);

  const missing = [];
  if (!buyProfile) missing.push('BUY');
  if (!sellProfile) missing.push('SELL');

  return {
    missing,
    getCharges: (transactiontype) =>
      extractTotalCharges((transactiontype === 'BUY' ? buyProfile : sellProfile)?.charges),
  };
};
