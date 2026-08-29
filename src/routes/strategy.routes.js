import { Router } from 'express';
import { validate } from '../controllers/strategy.controller.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const strategyRoutes = Router();

strategyRoutes.post('/validate', authMiddleware, validate);

export { strategyRoutes };
