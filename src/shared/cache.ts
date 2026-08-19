import { TermExplanation } from './types';
import { CACHE_TTL_MS, MAX_CACHE_ENTRIES } from './constants';

export interface CacheEntry {
  data: TermExplanation;
  timestamp: number;
}

export function generateCacheKey(term: string): string {
  return `finterm_cache_${term.toLowerCase().trim()}`;
}

export async function getCachedTerm(term: string): Promise<TermExplanation | null> {
  const key = generateCacheKey(term);
  const result = await chrome.storage.local.get(key);
  const entry = result[key] as CacheEntry | undefined;

  if (!entry) return null;

  const isExpired = Date.now() - entry.timestamp > CACHE_TTL_MS;
  if (isExpired) {
    await chrome.storage.local.remove(key);
    return null;
  }

  return entry.data;
}

export async function cacheTerm(term: string, data: TermExplanation): Promise<void> {
  const key = generateCacheKey(term);
  const entry: CacheEntry = {
    data,
    timestamp: Date.now()
  };

  // Enforce max cache entries limit
  const allItems = await chrome.storage.local.get(null);
  const cacheKeys = Object.keys(allItems).filter(k => k.startsWith('finterm_cache_'));
  
  if (cacheKeys.length >= MAX_CACHE_ENTRIES) {
    // Sort by timestamp ascending (oldest first)
    const sortedKeys = cacheKeys.sort((a, b) => {
      const entryA = allItems[a] as CacheEntry;
      const entryB = allItems[b] as CacheEntry;
      return entryA.timestamp - entryB.timestamp;
    });
    
    // Remove oldest entries to make room
    const keysToRemove = sortedKeys.slice(0, cacheKeys.length - MAX_CACHE_ENTRIES + 1);
    await chrome.storage.local.remove(keysToRemove);
  }

  await chrome.storage.local.set({ [key]: entry });
}

export async function clearCache(): Promise<void> {
  const allItems = await chrome.storage.local.get(null);
  const cacheKeys = Object.keys(allItems).filter(k => k.startsWith('finterm_cache_'));
  await chrome.storage.local.remove(cacheKeys);
}

export async function getCacheStats(): Promise<{ count: number; oldestEntry: number | null }> {
  const allItems = await chrome.storage.local.get(null);
  const cacheEntries = Object.entries(allItems)
    .filter(([key]) => key.startsWith('finterm_cache_'))
    .map(([, value]) => value as CacheEntry);
    
  if (cacheEntries.length === 0) {
    return { count: 0, oldestEntry: null };
  }
  
  const oldest = Math.min(...cacheEntries.map(e => e.timestamp));
  return { count: cacheEntries.length, oldestEntry: oldest };
}
