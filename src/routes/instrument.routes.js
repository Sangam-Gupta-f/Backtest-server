import { Router } from 'express';
import { syncInstruments, searchInstruments } from '../controllers/instrument.controller.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const instrumentRoutes = Router();

instrumentRoutes.post('/sync', authMiddleware, syncInstruments);
instrumentRoutes.get('/search', authMiddleware, searchInstruments);

export { instrumentRoutes };
