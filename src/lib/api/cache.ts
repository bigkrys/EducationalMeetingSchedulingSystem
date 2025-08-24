import Redis from 'redis'

// 简单的内存缓存实现
class MemoryCache {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>()

  set(key: string, data: any, ttl: number = 5 * 60 * 1000) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    })
  }

  get(key: string): any | null {
    const item = this.cache.get(key)
    if (!item) return null

    const now = Date.now()
    if (now - item.timestamp > item.ttl) {
      this.cache.delete(key)
      return null
    }

    return item.data
  }

  delete(key: string) {
    this.cache.delete(key)
  }

  clear() {
    this.cache.clear()
  }

  // 删除匹配模式的缓存键
  deletePattern(pattern: string) {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key)
      }
    }
  }

  // 清理过期缓存
  cleanup() {
    const now = Date.now()
    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > item.ttl) {
        this.cache.delete(key)
      }
    }
  }
}

export const memoryCache = new MemoryCache()

let redisClient: Redis.RedisClientType | null = null

// 初始化 Redis 连接
export async function initRedis() {
  if (process.env.REDIS_URL) {
    try {
      redisClient = Redis.createClient({ url: process.env.REDIS_URL })
      await redisClient.connect()
      console.log('Redis connected')
    } catch (error) {
      console.warn('Redis connection failed, falling back to memory cache:', error)
      redisClient = null
    }
  }
}

// 设置缓存
export async function setCache(key: string, value: any, ttlSeconds: number = 300) {
  const expires = Date.now() + ttlSeconds * 1000
  
  if (redisClient) {
    try {
      await redisClient.setEx(key, ttlSeconds, JSON.stringify(value))
    } catch (error) {
      console.warn('Redis set failed, using memory cache:', error)
      memoryCache.set(key, value, ttlSeconds)
    }
  } else {
    memoryCache.set(key, value, ttlSeconds)
  }
}

// 获取缓存
export async function getCache<T>(key: string): Promise<T | null> {
  if (redisClient) {
    try {
      const value = await redisClient.get(key)
      return value ? JSON.parse(value) : null
    } catch (error) {
      console.warn('Redis get failed, trying memory cache:', error)
    }
  }
  
  const item = memoryCache.get(key)
  if (item && item.timestamp + item.ttl > Date.now()) {
    return item.data
  }
  
  if (item) {
    memoryCache.delete(key)
  }
  
  return null
}

// 删除缓存
export async function deleteCache(key: string) {
  if (redisClient) {
    try {
      await redisClient.del(key)
    } catch (error) {
      console.warn('Redis delete failed:', error)
    }
  }
  
  memoryCache.delete(key)
}

// 批量删除缓存（支持模式匹配）
export async function deleteCachePattern(pattern: string) {
  if (redisClient) {
    try {
      const keys = await redisClient.keys(pattern)
      if (keys.length > 0) {
        await redisClient.del(keys)
      }
    } catch (error) {
      console.warn('Redis pattern delete failed:', error)
    }
  }
  
  // 内存缓存不支持模式匹配，只能逐个删除
  memoryCache.deletePattern(pattern)
}

// 清理过期缓存
export function cleanupMemoryCache() {
  memoryCache.cleanup()
}

// 定期清理内存缓存
setInterval(cleanupMemoryCache, 60000) // 每分钟清理一次
