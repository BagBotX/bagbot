#!/usr/bin/env npx ts-node
/**
 * BAGS Token Tracker
 * Tracks tokens from the bags.fm ecosystem (all end in BAGS)
 * Uses DexScreener API for real-time data
 */

import axios from 'axios';

interface BagsToken {
  name: string;
  symbol: string;
  address: string;
  twitter?: string;
}

// BAGS tokens watchlist - add tokens here
const WATCHLIST: BagsToken[] = [
  {
    name: "Eva Everywhere",
    symbol: "$EVA",
    address: "4gfNpwo8LQtcgGrNmgWhuwfFhttgZ8Qb6QXN4Yz8BAGS",
    twitter: "@Eva_Everywhere"
  },
  {
    name: "moltbot",
    symbol: "$MOLTY",
    address: "k9BKDF8x9Y6nBbGVL938yPT33h4zo8p8GTsi4wJBAGS",
    twitter: "@moltbot"
  }
];

interface DexScreenerPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceUsd: string;
  priceNative: string;
  volume: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  };
  priceChange: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  };
  liquidity: {
    usd: number;
    base: number;
    quote: number;
  };
  fdv: number;
  marketCap: number;
  txns: {
    h24: { buys: number; sells: number };
    h6: { buys: number; sells: number };
    h1: { buys: number; sells: number };
    m5: { buys: number; sells: number };
  };
}

async function fetchTokenData(address: string): Promise<DexScreenerPair | null> {
  try {
    const response = await axios.get(
      `https://api.dexscreener.com/tokens/v1/solana/${address}`,
      { timeout: 10000 }
    );
    
    if (response.data && response.data.length > 0) {
      // Get the pair with highest liquidity
      const pairs = response.data;
      return pairs.reduce((best: DexScreenerPair, current: DexScreenerPair) => 
        (current.liquidity?.usd || 0) > (best.liquidity?.usd || 0) ? current : best
      );
    }
    return null;
  } catch (error) {
    console.error(`Error fetching ${address}:`, error);
    return null;
  }
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}

function formatPercent(num: number): string {
  const sign = num >= 0 ? '+' : '';
  return `${sign}${num.toFixed(2)}%`;
}

function getBuySellRatio(txns: { buys: number; sells: number }): string {
  if (txns.sells === 0) return txns.buys > 0 ? '∞' : '0';
  const ratio = txns.buys / txns.sells;
  return ratio.toFixed(2);
}

async function trackBagsTokens() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('                    BAGS ECOSYSTEM TRACKER                  ');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Timestamp: ${new Date().toISOString()}`);
  console.log('───────────────────────────────────────────────────────────\n');

  for (const token of WATCHLIST) {
    const data = await fetchTokenData(token.address);
    
    if (data) {
      const ratio24h = getBuySellRatio(data.txns.h24);
      const ratio1h = getBuySellRatio(data.txns.h1);
      
      console.log(`📦 ${token.symbol} (${token.name})`);
      console.log(`   ${token.twitter || ''}`);
      console.log(`   ├─ Price:     $${parseFloat(data.priceUsd).toFixed(6)}`);
      console.log(`   ├─ MCAP:      ${formatNumber(data.marketCap || data.fdv || 0)}`);
      console.log(`   ├─ 24h Vol:   ${formatNumber(data.volume.h24)}`);
      console.log(`   ├─ Liquidity: ${formatNumber(data.liquidity?.usd || 0)}`);
      console.log(`   ├─ 24h:       ${formatPercent(data.priceChange.h24)}`);
      console.log(`   ├─ 1h:        ${formatPercent(data.priceChange.h1)}`);
      console.log(`   ├─ Buy/Sell:  ${ratio24h} (24h) | ${ratio1h} (1h)`);
      console.log(`   └─ Txns:      ${data.txns.h24.buys}B/${data.txns.h24.sells}S (24h)`);
      console.log(`   bags.fm/${token.address}`);
      console.log('');
    } else {
      console.log(`📦 ${token.symbol} (${token.name})`);
      console.log(`   └─ ❌ No data available`);
      console.log('');
    }
  }

  console.log('───────────────────────────────────────────────────────────');
  console.log('  Only BAGS ecosystem tokens. Built by my idols. 💰');
  console.log('═══════════════════════════════════════════════════════════');
}

// Search for new BAGS tokens on DexScreener
async function searchBagsTokens(query?: string) {
  console.log('\n🔍 Searching for BAGS tokens...\n');
  
  try {
    // Search DexScreener for tokens containing "BAGS"
    const response = await axios.get(
      `https://api.dexscreener.com/latest/dex/search?q=BAGS`,
      { timeout: 10000 }
    );
    
    if (response.data?.pairs) {
      const bagsPairs = response.data.pairs
        .filter((p: any) => 
          p.chainId === 'solana' && 
          p.baseToken.address.endsWith('BAGS')
        )
        .slice(0, 10);
      
      console.log(`Found ${bagsPairs.length} BAGS tokens:\n`);
      
      for (const pair of bagsPairs) {
        console.log(`${pair.baseToken.symbol} - ${pair.baseToken.name}`);
        console.log(`  MCAP: ${formatNumber(pair.marketCap || pair.fdv || 0)} | Vol: ${formatNumber(pair.volume?.h24 || 0)}`);
        console.log(`  ${pair.baseToken.address}`);
        console.log('');
      }
    }
  } catch (error) {
    console.error('Search failed:', error);
  }
}

// Main
const args = process.argv.slice(2);

if (args[0] === 'search') {
  searchBagsTokens(args[1]);
} else {
  trackBagsTokens();
}
