import { Router } from "express";
import { loginuser, generateToken, logout, getProfile } from "../controllers/user.controller.js";

const userRoutes = Router();

userRoutes.post("/login", loginuser);
userRoutes.post("/refresh-token", generateToken);
userRoutes.post("/logout", logout);
userRoutes.get("/profile", getProfile);

export { userRoutes };
