import express from "express";
import { statsController } from "../controllers/statsController";

const router = express.Router();

/**
 * GET /admin/stats
 * Get summary statistics (publicly accessible)
 */
router.get("/", statsController.getSummaryStats);

/**
 * GET /admin/stats/users
 * Get user-specific statistics (publicly accessible)
 */
router.get("/users", statsController.getUserStats);

export default router;
