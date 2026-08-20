import { Router } from "express";

const router=Router();
import { userRoutes } from "./user.routes.js";

router.use("/user", userRoutes);

export default router;