import mongoose from 'mongoose';

const instrumentSchema = new mongoose.Schema(
  {
    token: { type: String, required: true },
    symbol: { type: String, required: true },
    name: { type: String },
    expiry: { type: String },
    strike: { type: Number },
    lotsize: { type: Number },
    instrumenttype: { type: String },
    exch_seg: { type: String, required: true },
    tick_size: { type: Number },
  },
  { timestamps: true }
);

instrumentSchema.index({ token: 1, exch_seg: 1 }, { unique: true });
instrumentSchema.index({ symbol: 1 });
instrumentSchema.index({ name: 1 });

export const Instrument = mongoose.model('Instrument', instrumentSchema);
