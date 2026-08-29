import { Router } from 'express';
import { computeIndicator } from '../controllers/indicator.controller.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const indicatorRoutes = Router();

indicatorRoutes.get('/', authMiddleware, computeIndicator);

export { indicatorRoutes };
