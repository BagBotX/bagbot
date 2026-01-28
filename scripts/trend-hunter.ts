#!/usr/bin/env npx ts-node
/**
 * Trend Hunter - Find early runners before they 5000x
 * Looks for narrative momentum, not just price momentum
 */

import axios from 'axios';

const DEXSCREENER_API = 'https://api.dexscreener.com';

interface TokenSignal {
  symbol: string;
  name: string;
  mint: string;
  mcap: number;
  volume24h: number;
  volMcapRatio: number;
  priceChange: {
    m5: number;
    h1: number;
    h6: number;
    h24: number;
  };
  buyRatio: number;
  txCount24h: number;
  signal: string;
  score: number;
}

// Find tokens with unusual volume accumulation (whales loading)
async function findAccumulation(): Promise<TokenSignal[]> {
  const res = await axios.get(`${DEXSCREENER_API}/latest/dex/search?q=BAGS`);
  const pairs = res.data.pairs?.filter((p: any) => 
    p.chainId === 'solana' && 
    p.baseToken.address.endsWith('BAGS')
  ) || [];

  const signals: TokenSignal[] = [];

  for (const p of pairs) {
    const mcap = p.marketCap || p.fdv || 0;
    const vol = p.volume?.h24 || 0;
    const volMcapRatio = mcap > 0 ? vol / mcap : 0;
    const h1Change = p.priceChange?.h1 || 0;
    const h6Change = p.priceChange?.h6 || 0;
    const m5Change = p.priceChange?.m5 || 0;
    const buys = p.txns?.h24?.buys || 0;
    const sells = p.txns?.h24?.sells || 0;
    const buyRatio = sells > 0 ? buys / sells : buys;
    const txCount = buys + sells;

    // ACCUMULATION PATTERN: High volume, low price movement = someone loading
    if (volMcapRatio > 5 && Math.abs(h1Change) < 20 && mcap < 50000) {
      signals.push({
        symbol: p.baseToken.symbol,
        name: p.baseToken.name,
        mint: p.baseToken.address,
        mcap,
        volume24h: vol,
        volMcapRatio,
        priceChange: { m5: m5Change, h1: h1Change, h6: h6Change, h24: p.priceChange?.h24 || 0 },
        buyRatio,
        txCount24h: txCount,
        signal: '🐋 ACCUMULATION - High vol, flat price',
        score: volMcapRatio * buyRatio
      });
    }

    // BREAKOUT SETUP: Consolidation then volume spike
    if (mcap < 30000 && volMcapRatio > 3 && m5Change > 10 && h1Change < 50) {
      signals.push({
        symbol: p.baseToken.symbol,
        name: p.baseToken.name,
        mint: p.baseToken.address,
        mcap,
        volume24h: vol,
        volMcapRatio,
        priceChange: { m5: m5Change, h1: h1Change, h6: h6Change, h24: p.priceChange?.h24 || 0 },
        buyRatio,
        txCount24h: txCount,
        signal: '🚀 BREAKOUT SETUP - Starting to move',
        score: m5Change * buyRatio
      });
    }

    // MICRO CAP GEM: Tiny mcap, decent volume, buyers winning
    if (mcap < 10000 && vol > 20000 && buyRatio > 1.3) {
      signals.push({
        symbol: p.baseToken.symbol,
        name: p.baseToken.name,
        mint: p.baseToken.address,
        mcap,
        volume24h: vol,
        volMcapRatio,
        priceChange: { m5: m5Change, h1: h1Change, h6: h6Change, h24: p.priceChange?.h24 || 0 },
        buyRatio,
        txCount24h: txCount,
        signal: '💎 MICRO GEM - Tiny cap, buyer pressure',
        score: volMcapRatio * buyRatio * 2
      });
    }
  }

  return signals.sort((a, b) => b.score - a.score).slice(0, 10);
}

// Find newly launched tokens (< 24h old with traction)
async function findNewLaunches(): Promise<any[]> {
  // DexScreener doesn't give launch time directly, but we can infer from low tx count + volume
  const res = await axios.get(`${DEXSCREENER_API}/latest/dex/search?q=BAGS`);
  const pairs = res.data.pairs?.filter((p: any) => 
    p.chainId === 'solana' && 
    p.baseToken.address.endsWith('BAGS') &&
    (p.txns?.h24?.buys || 0) + (p.txns?.h24?.sells || 0) < 500 && // Low total txs = new
    (p.volume?.h24 || 0) > 10000 // But has some volume
  ) || [];

  return pairs.slice(0, 5).map((p: any) => ({
    symbol: p.baseToken.symbol,
    name: p.baseToken.name,
    mint: p.baseToken.address,
    mcap: p.marketCap || p.fdv || 0,
    volume: p.volume?.h24 || 0,
    txCount: (p.txns?.h24?.buys || 0) + (p.txns?.h24?.sells || 0),
    signal: '🆕 NEW LAUNCH'
  }));
}

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(0)}`;
}

async function main() {
  console.log('\n🎯 TREND HUNTER - Finding 5000x Candidates\n');
  console.log('═'.repeat(70));

  console.log('\n📊 ACCUMULATION & BREAKOUT SIGNALS:\n');
  const signals = await findAccumulation();
  
  if (signals.length === 0) {
    console.log('  No strong signals detected this scan.\n');
  } else {
    for (const s of signals) {
      console.log(`  ${s.signal}`);
      console.log(`  ${s.symbol} (${s.name})`);
      console.log(`  ├─ MCAP: ${formatUsd(s.mcap)} | Vol: ${formatUsd(s.volume24h)} (${s.volMcapRatio.toFixed(1)}x)`);
      console.log(`  ├─ 5m: ${s.priceChange.m5 > 0 ? '+' : ''}${s.priceChange.m5.toFixed(1)}% | 1h: ${s.priceChange.h1 > 0 ? '+' : ''}${s.priceChange.h1.toFixed(1)}%`);
      console.log(`  ├─ Buy/Sell: ${s.buyRatio.toFixed(2)} | Txs: ${s.txCount24h}`);
      console.log(`  └─ ${s.mint}`);
      console.log('');
    }
  }

  console.log('\n🆕 NEW LAUNCHES WITH TRACTION:\n');
  const newLaunches = await findNewLaunches();
  
  if (newLaunches.length === 0) {
    console.log('  No new launches found.\n');
  } else {
    for (const n of newLaunches) {
      console.log(`  ${n.signal}: ${n.symbol}`);
      console.log(`  ├─ MCAP: ${formatUsd(n.mcap)} | Vol: ${formatUsd(n.volume)}`);
      console.log(`  ├─ Only ${n.txCount} transactions (very early)`);
      console.log(`  └─ ${n.mint}`);
      console.log('');
    }
  }

  console.log('═'.repeat(70));
  console.log('  🎯 5000x Pattern: Micro cap + accumulation + narrative = moon');
  console.log('  🔑 Key: Find tokens where volume > price movement (loading phase)');
  console.log('═'.repeat(70) + '\n');
}

main().catch(console.error);
