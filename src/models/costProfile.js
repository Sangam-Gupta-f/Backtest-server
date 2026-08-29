import mongoose from 'mongoose';

const costProfileSchema = new mongoose.Schema(
  {
    exchange: { type: String, required: true },
    instrumenttype: { type: String, required: true },
    producttype: { type: String, required: true },
    transactiontype: { type: String, required: true, enum: ['BUY', 'SELL'] },
    sample: {
      token: String,
      tradingsymbol: String,
      quantity: Number,
      price: Number,
    },
    charges: { type: mongoose.Schema.Types.Mixed },
    margin: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

costProfileSchema.index(
  { exchange: 1, instrumenttype: 1, producttype: 1, transactiontype: 1 },
  { unique: true }
);

export const CostProfile = mongoose.model('CostProfile', costProfileSchema);
