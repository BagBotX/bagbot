#!/usr/bin/env ts-node
/**
 * BagBot Price Checker
 * Fetches token prices from DexScreener + CoinGecko
 */

import axios from 'axios';

const TOKENS: Record<string, { symbol: string; coingeckoId?: string }> = {
  'So11111111111111111111111111111111111111112': { symbol: 'SOL', coingeckoId: 'solana' },
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol: 'USDC', coingeckoId: 'usd-coin' },
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': { symbol: 'BONK', coingeckoId: 'bonk' },
  'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm': { symbol: 'WIF', coingeckoId: 'dogwifcoin' },
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': { symbol: 'JUP', coingeckoId: 'jupiter-exchange-solana' },
};

async function getDexScreenerPrice(address: string): Promise<any> {
  try {
    const res = await axios.get(`https://api.dexscreener.com/tokens/v1/solana/${address}`, {
      timeout: 10000
    });
    if (res.data && res.data.length > 0) {
      const pair = res.data[0];
      return {
        price: parseFloat(pair.priceUsd),
        change24h: pair.priceChange?.h24 || 0,
        volume24h: pair.volume?.h24 || 0,
        liquidity: pair.liquidity?.usd || 0,
        source: 'dexscreener'
      };
    }
  } catch (e) {
    console.error(`DexScreener error for ${address}:`, (e as Error).message);
  }
  return null;
}

async function getCoinGeckoPrice(id: string): Promise<any> {
  try {
    const res = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`,
      { timeout: 10000 }
    );
    if (res.data && res.data[id]) {
      return {
        price: res.data[id].usd,
        change24h: res.data[id].usd_24h_change || 0,
        source: 'coingecko'
      };
    }
  } catch (e) {
    console.error(`CoinGecko error for ${id}:`, (e as Error).message);
  }
  return null;
}

async function main() {
  const targetAddress = process.argv[2];
  
  if (targetAddress) {
    // Single token lookup
    const data = await getDexScreenerPrice(targetAddress);
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log('No data found');
    }
    return;
  }
  
  // Default: check all known tokens
  console.log('=== BagBot Price Check ===\n');
  
  for (const [address, info] of Object.entries(TOKENS)) {
    const dexData = await getDexScreenerPrice(address);
    const geckoData = info.coingeckoId ? await getCoinGeckoPrice(info.coingeckoId) : null;
    
    const price = dexData?.price || geckoData?.price || 'N/A';
    const change = dexData?.change24h || geckoData?.change24h || 0;
    const changeStr = change > 0 ? `+${change.toFixed(2)}%` : `${change.toFixed(2)}%`;
    
    console.log(`${info.symbol}: $${typeof price === 'number' ? price.toFixed(6) : price} (${changeStr})`);
  }
}

main().catch(console.error);
