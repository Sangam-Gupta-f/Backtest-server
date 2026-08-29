import { Router } from 'express';
import { syncCostProfile, getCostProfile } from '../controllers/cost.controller.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const costRoutes = Router();

costRoutes.post('/sync', authMiddleware, syncCostProfile);
costRoutes.get('/', authMiddleware, getCostProfile);

export { costRoutes };
