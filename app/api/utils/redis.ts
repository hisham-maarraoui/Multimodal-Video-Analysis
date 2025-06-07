import { createClient } from 'redis';

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error('Missing REDIS_URL in environment variables');
}

export const redis = createClient({ url: redisUrl });

redis.on('error', (err) => console.error('Redis Client Error', err));

// Ensure connection is established before use
export async function connectRedis() {
  if (!redis.isOpen) {
    await redis.connect();
  }
}

export async function getCache(key: string) {
  await connectRedis();
  const value = await redis.get(key);
  return value ? JSON.parse(value) : null;
}

export async function setCache(key: string, value: any, ttlSeconds = 86400) {
  await connectRedis();
  await redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
} 