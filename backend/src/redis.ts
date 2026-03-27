import Redis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

// Assuming default Redis port for local dev
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

export const redisClient = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
export const redisSubscriber = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

redisClient.on('error', (err) => console.error('Redis Client Error', err));
redisSubscriber.on('error', (err) => console.error('Redis Subscriber Error', err));
