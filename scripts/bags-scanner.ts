#!/usr/bin/env npx ts-node
/**
 * BAGS Token Scanner & Analyzer
 * Combines DexScreener + bags.fm data for comprehensive token analysis
 * Built by BagBot for the BAGS ecosystem
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// ============ CONFIG ============

const DEXSCREENER_BASE = 'https://api.dexscreener.com';
const BAGS_API_BASE = 'https://public-api-v2.bags.fm/api/v1';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

function getBagsApiKey(): string {
  const envPath = path.join(process.env.HOME || '', '.credentials', 'bags.env');
  try {
    const content = fs.readFileSync(envPath, 'utf-8');
    const match = content.match(/BAGS_API_KEY=(.+)/);
    if (match) return match[1].trim();
  } catch (e) {}
  return '';
}

const BAGS_API_KEY = getBagsApiKey();

// ============ TYPES ============

interface TokenMetrics {
  symbol: string;
  name: string;
  address: string;
  mcap: number;
  price: number;
  priceChange: {
    m5: number;
    h1: number;
    h6: number;
    h24: number;
  };
  volume: {
    h1: number;
    h24: number;
  };
  txns: {
    buys: number;
    sells: number;
    ratio: number;
  };
  liquidity: number;
  pairAge: string;
  dexScreenerUrl: string;
}

interface ScanResult {
  token: TokenMetrics;
  score: number;
  signals: string[];
  warnings: string[];
}

// ============ DEXSCREENER API ============

async function getTokenData(mint: string): Promise<any> {
  const { data } = await axios.get(`${DEXSCREENER_BASE}/tokens/v1/solana/${mint}`);
  return data[0] || null;
}

async function searchBAGSTokens(query: string = 'BAGS'): Promise<any[]> {
  const { data } = await axios.get(`${DEXSCREENER_BASE}/latest/dex/search`, {
    params: { q: query }
  });
  
  // Filter for BAGS ecosystem tokens (addresses ending in BAGS)
  return (data.pairs || []).filter((p: any) => 
    p.chainId === 'solana' && 
    p.baseToken?.address?.endsWith('BAGS')
  );
}

async function getTrendingBAGS(): Promise<any[]> {
  const { data } = await axios.get(`${DEXSCREENER_BASE}/token-boosts/top/v1`);
  return (data || []).filter((t: any) => 
    t.chainId === 'solana' &&
    t.tokenAddress?.endsWith('BAGS')
  );
}

// ============ ANALYSIS FUNCTIONS ============

function parseMetrics(pair: any): TokenMetrics {
  const txns = pair.txns?.h1 || { buys: 0, sells: 0 };
  const buyRatio = txns.sells > 0 ? txns.buys / txns.sells : txns.buys;
  
  // Calculate pair age
  const createdAt = pair.pairCreatedAt ? new Date(pair.pairCreatedAt) : null;
  const ageMs = createdAt ? Date.now() - createdAt.getTime() : 0;
  const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
  const ageDays = Math.floor(ageHours / 24);
  const pairAge = ageDays > 0 ? `${ageDays}d ${ageHours % 24}h` : `${ageHours}h`;

  return {
    symbol: pair.baseToken?.symbol || 'UNKNOWN',
    name: pair.baseToken?.name || 'Unknown',
    address: pair.baseToken?.address || '',
    mcap: pair.marketCap || pair.fdv || 0,
    price: parseFloat(pair.priceUsd) || 0,
    priceChange: {
      m5: pair.priceChange?.m5 || 0,
      h1: pair.priceChange?.h1 || 0,
      h6: pair.priceChange?.h6 || 0,
      h24: pair.priceChange?.h24 || 0,
    },
    volume: {
      h1: pair.volume?.h1 || 0,
      h24: pair.volume?.h24 || 0,
    },
    txns: {
      buys: txns.buys,
      sells: txns.sells,
      ratio: buyRatio,
    },
    liquidity: pair.liquidity?.usd || 0,
    pairAge,
    dexScreenerUrl: pair.url || '',
  };
}

function analyzeToken(metrics: TokenMetrics): ScanResult {
  const signals: string[] = [];
  const warnings: string[] = [];
  let score = 50; // Start neutral

  // FAKE VOLUME DETECTION
  // Real volume = many small txs ($50-100 avg). Fake = few large txs ($500+ avg)
  const totalTxnsH1 = metrics.txns.buys + metrics.txns.sells;
  const avgTxSize = totalTxnsH1 > 0 ? metrics.volume.h1 / totalTxnsH1 : 0;
  
  if (avgTxSize > 500 && totalTxnsH1 < 50) {
    warnings.push(`🚨 FAKE VOLUME? Avg tx $${avgTxSize.toFixed(0)} (should be <$100)`);
    score -= 25;
  } else if (avgTxSize > 200 && totalTxnsH1 < 100) {
    warnings.push(`⚠️ Suspicious volume: Avg tx $${avgTxSize.toFixed(0)}, low txn count`);
    score -= 10;
  } else if (avgTxSize > 0 && avgTxSize < 150 && totalTxnsH1 > 50) {
    signals.push(`✅ Organic volume (avg $${avgTxSize.toFixed(0)}/tx, ${totalTxnsH1} txns)`);
    score += 5;
  }

  // Volume/MCap ratio (higher = more activity)
  const volMcapRatio = metrics.mcap > 0 ? metrics.volume.h24 / metrics.mcap : 0;
  if (volMcapRatio > 5) {
    signals.push(`🔥 Extreme volume (${volMcapRatio.toFixed(1)}x mcap)`);
    score += 15;
  } else if (volMcapRatio > 2) {
    signals.push(`📈 High volume (${volMcapRatio.toFixed(1)}x mcap)`);
    score += 10;
  } else if (volMcapRatio < 0.1) {
    warnings.push(`⚠️ Low volume (${(volMcapRatio * 100).toFixed(1)}% of mcap)`);
    score -= 10;
  }

  // Buy/Sell ratio
  if (metrics.txns.ratio > 2) {
    signals.push(`🟢 Strong buying (${metrics.txns.ratio.toFixed(2)}x)`);
    score += 15;
  } else if (metrics.txns.ratio > 1.3) {
    signals.push(`🟢 More buyers than sellers (${metrics.txns.ratio.toFixed(2)}x)`);
    score += 8;
  } else if (metrics.txns.ratio < 0.7) {
    warnings.push(`🔴 Heavy selling (${metrics.txns.ratio.toFixed(2)}x)`);
    score -= 15;
  }

  // Price momentum
  if (metrics.priceChange.h1 > 50) {
    if (metrics.priceChange.h1 > 200) {
      warnings.push(`⚠️ Parabolic pump (+${metrics.priceChange.h1.toFixed(0)}% h1) - may be late`);
      score -= 5; // Risky to chase
    } else {
      signals.push(`🚀 Strong momentum (+${metrics.priceChange.h1.toFixed(0)}% h1)`);
      score += 10;
    }
  } else if (metrics.priceChange.h1 < -20) {
    warnings.push(`📉 Dumping (${metrics.priceChange.h1.toFixed(0)}% h1)`);
    score -= 10;
  }

  // 5-minute trend (recent action)
  if (metrics.priceChange.m5 > 10) {
    signals.push(`⬆️ Pumping now (+${metrics.priceChange.m5.toFixed(1)}% 5m)`);
    score += 5;
  } else if (metrics.priceChange.m5 < -10) {
    warnings.push(`⬇️ Dumping now (${metrics.priceChange.m5.toFixed(1)}% 5m)`);
    score -= 5;
  }

  // Market cap category
  if (metrics.mcap < 10000) {
    signals.push(`💎 Micro cap (<$10K) - high risk/reward`);
    score += 5;
  } else if (metrics.mcap < 50000) {
    signals.push(`🎯 Small cap ($${(metrics.mcap/1000).toFixed(0)}K)`);
  } else if (metrics.mcap > 500000) {
    signals.push(`🏛️ Established ($${(metrics.mcap/1000).toFixed(0)}K mcap)`);
  }

  // Liquidity check
  if (metrics.liquidity < 5000) {
    warnings.push(`⚠️ Low liquidity ($${metrics.liquidity.toFixed(0)})`);
    score -= 10;
  }

  // Transaction count
  const totalTxns = metrics.txns.buys + metrics.txns.sells;
  if (totalTxns > 500) {
    signals.push(`📊 High activity (${totalTxns} txns/h)`);
    score += 5;
  } else if (totalTxns < 10) {
    warnings.push(`⚠️ Low activity (${totalTxns} txns/h)`);
    score -= 10;
  }

  return {
    token: metrics,
    score: Math.max(0, Math.min(100, score)),
    signals,
    warnings,
  };
}

// ============ DISPLAY FUNCTIONS ============

function formatUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function printResult(result: ScanResult): void {
  const { token, score, signals, warnings } = result;
  
  const scoreEmoji = score >= 70 ? '🟢' : score >= 50 ? '🟡' : '🔴';
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`${scoreEmoji} ${token.symbol} | Score: ${score}/100`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`📍 ${token.address}`);
  console.log(`💰 MCap: ${formatUSD(token.mcap)} | Price: $${token.price.toFixed(8)}`);
  console.log(`📊 Vol 24h: ${formatUSD(token.volume.h24)} | Vol/MCap: ${(token.volume.h24 / (token.mcap || 1)).toFixed(1)}x`);
  console.log(`📈 Change: ${token.priceChange.m5.toFixed(1)}% (5m) | ${token.priceChange.h1.toFixed(1)}% (1h) | ${token.priceChange.h24.toFixed(1)}% (24h)`);
  console.log(`🔄 Txns: ${token.txns.buys}B/${token.txns.sells}S (${token.txns.ratio.toFixed(2)}x ratio)`);
  console.log(`💧 Liquidity: ${formatUSD(token.liquidity)} | Age: ${token.pairAge}`);
  
  if (signals.length > 0) {
    console.log(`\n✅ Signals:`);
    signals.forEach(s => console.log(`   ${s}`));
  }
  
  if (warnings.length > 0) {
    console.log(`\n⚠️ Warnings:`);
    warnings.forEach(w => console.log(`   ${w}`));
  }
  
  console.log(`\n🔗 ${token.dexScreenerUrl}`);
}

// ============ CLI ============

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'analyze' || command === 'a') {
    // Analyze a specific token
    const mint = args[1];
    if (!mint) {
      console.log('Usage: bags-scanner analyze <mint_address>');
      process.exit(1);
    }

    console.log(`\n🔍 Analyzing ${mint.slice(0, 8)}...BAGS`);
    
    try {
      const data = await getTokenData(mint);
      if (!data) {
        console.log('❌ Token not found');
        process.exit(1);
      }
      
      const metrics = parseMetrics(data);
      const result = analyzeToken(metrics);
      printResult(result);
    } catch (e: any) {
      console.error('❌ Error:', e.message);
    }

  } else if (command === 'scan' || command === 's') {
    // Scan for BAGS tokens with optional filters
    const minScore = parseInt(args[1]) || 50;
    const brief = args.includes('--brief') || args.includes('-b');
    
    console.log(`\n🔍 Scanning BAGS ecosystem (min score: ${minScore})...`);
    
    try {
      const pairs = await searchBAGSTokens();
      console.log(`Found ${pairs.length} BAGS tokens`);
      
      const results: ScanResult[] = [];
      
      for (const pair of pairs.slice(0, 50)) { // Limit to top 50
        const metrics = parseMetrics(pair);
        const result = analyzeToken(metrics);
        if (result.score >= minScore) {
          results.push(result);
        }
      }
      
      // Sort by score
      results.sort((a, b) => b.score - a.score);
      
      console.log(`\n📊 ${results.length} tokens passed filter (score >= ${minScore})`);
      
      if (brief) {
        // Quick summary table
        console.log(`\n${'─'.repeat(90)}`);
        console.log(`${'Symbol'.padEnd(12)} ${'Score'.padEnd(6)} ${'MCap'.padEnd(10)} ${'Vol/MC'.padEnd(8)} ${'B/S'.padEnd(6)} ${'h1%'.padEnd(8)} ${'Alerts'}`);
        console.log(`${'─'.repeat(90)}`);
        
        for (const r of results.slice(0, 15)) {
          const t = r.token;
          const volMc = t.mcap > 0 ? (t.volume.h24 / t.mcap).toFixed(1) + 'x' : '-';
          const alertCount = r.warnings.length > 0 ? `⚠️${r.warnings.length}` : '✅';
          const scoreIcon = r.score >= 70 ? '🟢' : r.score >= 50 ? '🟡' : '🔴';
          
          console.log(
            `${t.symbol.slice(0, 11).padEnd(12)} ` +
            `${scoreIcon}${String(r.score).padEnd(4)} ` +
            `${formatUSD(t.mcap).padEnd(10)} ` +
            `${volMc.padEnd(8)} ` +
            `${t.txns.ratio.toFixed(1).padEnd(6)} ` +
            `${(t.priceChange.h1 > 0 ? '+' : '') + t.priceChange.h1.toFixed(0) + '%'.padEnd(6)} ` +
            `${alertCount}`
          );
        }
        console.log(`${'─'.repeat(90)}`);
      } else {
        for (const result of results.slice(0, 10)) {
          printResult(result);
        }
      }
      
    } catch (e: any) {
      console.error('❌ Error:', e.message);
    }

  } else if (command === 'trending' || command === 't') {
    // Show trending BAGS tokens
    console.log(`\n🔥 Trending BAGS tokens...`);
    
    try {
      const trending = await getTrendingBAGS();
      
      if (trending.length === 0) {
        console.log('No BAGS tokens currently boosted');
      } else {
        console.log(`Found ${trending.length} boosted BAGS tokens:`);
        for (const t of trending) {
          console.log(`  • ${t.tokenAddress?.slice(0, 8)}...BAGS`);
        }
      }
    } catch (e: any) {
      console.error('❌ Error:', e.message);
    }

  } else if (command === 'hot' || command === 'h') {
    // Quick hot opportunities filter - BagBot's criteria
    console.log(`\n🔥 Scanning for HOT opportunities...`);
    console.log(`   Criteria: Vol/MC >2x, B/S >1.2x, h1 <+200%, Liq >$5K\n`);
    
    try {
      const pairs = await searchBAGSTokens();
      const hot: ScanResult[] = [];
      
      for (const pair of pairs) {
        const metrics = parseMetrics(pair);
        const volMcap = metrics.mcap > 0 ? metrics.volume.h24 / metrics.mcap : 0;
        
        // BagBot's opportunity filter:
        // - Vol/MCap > 2x (active trading)
        // - Buy/Sell ratio > 1.2 (bullish sentiment)
        // - h1 change < 200% (not already parabolic)
        // - Liquidity > $5K (can exit)
        if (
          volMcap > 2 &&
          metrics.txns.ratio > 1.2 &&
          metrics.priceChange.h1 < 200 &&
          metrics.liquidity > 5000
        ) {
          const result = analyzeToken(metrics);
          // Skip if too many warnings
          if (result.warnings.length <= 2) {
            hot.push(result);
          }
        }
      }
      
      hot.sort((a, b) => b.score - a.score);
      
      if (hot.length === 0) {
        console.log('❌ No hot opportunities right now. Patience > FOMO.');
      } else {
        console.log(`✅ Found ${hot.length} candidates:\n`);
        
        for (const r of hot.slice(0, 5)) {
          const t = r.token;
          const volMc = (t.volume.h24 / t.mcap).toFixed(1);
          console.log(`🎯 $${t.symbol} | Score: ${r.score}/100`);
          console.log(`   MCap: ${formatUSD(t.mcap)} | Vol/MC: ${volMc}x | B/S: ${t.txns.ratio.toFixed(2)}x`);
          console.log(`   h1: ${t.priceChange.h1 > 0 ? '+' : ''}${t.priceChange.h1.toFixed(0)}% | Liq: ${formatUSD(t.liquidity)}`);
          console.log(`   ${t.address}`);
          if (r.signals.length > 0) console.log(`   ${r.signals.slice(0, 2).join(' | ')}`);
          if (r.warnings.length > 0) console.log(`   ⚠️ ${r.warnings.join(' | ')}`);
          console.log('');
        }
      }
    } catch (e: any) {
      console.error('❌ Error:', e.message);
    }

  } else if (command === 'watch' || command === 'w') {
    // Watch a token (continuous updates)
    const mint = args[1];
    const interval = parseInt(args[2]) || 30; // seconds
    
    if (!mint) {
      console.log('Usage: bags-scanner watch <mint_address> [interval_seconds]');
      process.exit(1);
    }

    console.log(`\n👀 Watching ${mint.slice(0, 8)}...BAGS (every ${interval}s)`);
    console.log('Press Ctrl+C to stop\n');
    
    const check = async () => {
      try {
        const data = await getTokenData(mint);
        if (!data) {
          console.log(`[${new Date().toLocaleTimeString()}] Token not found`);
          return;
        }
        
        const metrics = parseMetrics(data);
        const pctChange = metrics.priceChange.m5;
        const emoji = pctChange > 0 ? '🟢' : pctChange < 0 ? '🔴' : '⚪';
        
        console.log(
          `[${new Date().toLocaleTimeString()}] ${emoji} ${metrics.symbol} | ` +
          `${formatUSD(metrics.mcap)} | ${pctChange > 0 ? '+' : ''}${pctChange.toFixed(1)}% (5m) | ` +
          `${metrics.txns.buys}B/${metrics.txns.sells}S`
        );
      } catch (e: any) {
        console.log(`[${new Date().toLocaleTimeString()}] Error: ${e.message}`);
      }
    };
    
    await check();
    setInterval(check, interval * 1000);

  } else {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║           BAGS Token Scanner - BagBot Edition                ║
╠══════════════════════════════════════════════════════════════╣
║  Commands:                                                   ║
║                                                              ║
║  analyze <mint>       Deep analysis of a BAGS token          ║
║  scan [min] [-b]      Scan ecosystem (default: score >= 50)  ║
║                       -b/--brief for compact table view      ║
║  hot                  Quick filter for trading opportunities ║
║                       (Vol/MC>2x, B/S>1.2, h1<200%, Liq>$5K) ║
║  trending             Show boosted BAGS tokens               ║
║  watch <mint> [sec]   Live monitor a token                   ║
║                                                              ║
║  Examples:                                                   ║
║    bags-scanner analyze 6jpwUFeZdTQ3Y...BAGS                 ║
║    bags-scanner scan 60 --brief                              ║
║    bags-scanner hot                                          ║
║    bags-scanner watch 6jpwUFeZdTQ3Y...BAGS 15                ║
║                                                              ║
║  Features:                                                   ║
║    • Fake volume detection (avg tx size analysis)            ║
║    • Buy/sell ratio scoring                                  ║
║    • Momentum & liquidity checks                             ║
║                                                              ║
║  Only analyzes tokens ending in BAGS (bags.fm ecosystem)     ║
╚══════════════════════════════════════════════════════════════╝
    `);
  }
}

main().catch(console.error);
