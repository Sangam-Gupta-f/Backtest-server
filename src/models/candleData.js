import mongoose from 'mongoose';

const candleSchema = new mongoose.Schema(
  {
    token: { type: String, required: true },
    exchange: { type: String, required: true },
    interval: { type: String, required: true },
    time: { type: Date, required: true },
    open: { type: Number, required: true },
    high: { type: Number, required: true },
    low: { type: Number, required: true },
    close: { type: Number, required: true },
    volume: { type: Number, required: true },
  },
  { timestamps: true }
);

candleSchema.index({ token: 1, exchange: 1, interval: 1, time: 1 }, { unique: true });

export const Candle = mongoose.model('Candle', candleSchema);
