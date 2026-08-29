import { Router } from "express";

const router=Router();
import { userRoutes } from "./user.routes.js";
import { instrumentRoutes } from "./instrument.routes.js";
import { candleRoutes } from "./candle.routes.js";
import { costRoutes } from "./cost.routes.js";
import { indicatorRoutes } from "./indicator.routes.js";
import { strategyRoutes } from "./strategy.routes.js";
import { backtestRoutes } from "./backtest.routes.js";

router.use("/user", userRoutes);
router.use("/instruments", instrumentRoutes);
router.use("/candles", candleRoutes);
router.use("/costs", costRoutes);
router.use("/indicators", indicatorRoutes);
router.use("/strategies", strategyRoutes);
router.use("/backtest", backtestRoutes);

export default router;