import { Router } from 'express';
import { run } from '../controllers/backtest.controller.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const backtestRoutes = Router();

backtestRoutes.post('/run', authMiddleware, run);

export { backtestRoutes };
