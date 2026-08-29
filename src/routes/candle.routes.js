import { Router } from 'express';
import { ingestCandles, getCandles } from '../controllers/candle.controller.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const candleRoutes = Router();

candleRoutes.post('/ingest', authMiddleware, ingestCandles);
candleRoutes.get('/', authMiddleware, getCandles);

export { candleRoutes };
