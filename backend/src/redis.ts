import { Redis } from "ioredis";
import { config } from "./config.js";

// BullMQ requires maxRetriesPerRequest: null so blocking commands never time out.
export const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
