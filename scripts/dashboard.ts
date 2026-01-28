#!/usr/bin/env npx ts-node
/**
 * BagBot Dashboard
 * Real-time portfolio view, P&L tracking, opportunity scanner
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

const WALLET = 'bL7yksLLAUZDhSXvxhMEVpruqhUNn8T8C4jWzdnVChm';
const RPC_URL = 'https://api.mainnet-beta.solana.com';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

interface Position {
  symbol: string;
  name: string;
  mint: string;
  tokens: number;
  entry_sol: number;
  entry_price_usd: number;
  entry_mcap: number;
  entry_time: string;
  status: string;
}

interface DexData {
  priceUsd: string;
  marketCap: number;
  volume24h: number;
  priceChange: { h1?: number; h24?: number };
  txns: { h1: { buys: number; sells: number } };
  liquidity: { usd: number } | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA FETCHING
// ═══════════════════════════════════════════════════════════════════════════

async function getSolBalance(): Promise<number> {
  const connection = new Connection(RPC_URL, 'confirmed');
  const pubkey = new PublicKey(WALLET);
  const balance = await connection.getBalance(pubkey);
  return balance / LAMPORTS_PER_SOL;
}

async function getSolPrice(): Promise<number> {
  try {
    const res = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    return res.data.solana.usd;
  } catch {
    return 0;
  }
}

async function getTokenData(mint: string): Promise<DexData | null> {
  try {
    const res = await axios.get(`https://api.dexscreener.com/tokens/v1/solana/${mint}`, { timeout: 10000 });
    if (res.data && res.data.length > 0) {
      const pair = res.data[0];
      return {
        priceUsd: pair.priceUsd,
        marketCap: pair.marketCap || pair.fdv || 0,
        volume24h: pair.volume?.h24 || 0,
        priceChange: pair.priceChange || {},
        txns: pair.txns || { h1: { buys: 0, sells: 0 } },
        liquidity: pair.liquidity,
      };
    }
  } catch {}
  return null;
}

async function getPositions(): Promise<Position[]> {
  const posPath = path.join(__dirname, '..', 'memory', 'positions.json');
  try {
    const data = JSON.parse(fs.readFileSync(posPath, 'utf-8'));
    return data.positions.filter((p: Position) => p.status === 'open');
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SCANNER
// ═══════════════════════════════════════════════════════════════════════════

async function scanForRunners(): Promise<any[]> {
  try {
    const res = await axios.get('https://api.dexscreener.com/latest/dex/search?q=BAGS', { timeout: 15000 });
    if (res.data?.pairs) {
      return res.data.pairs
        .filter((p: any) => 
          p.chainId === 'solana' && 
          p.baseToken.address.endsWith('BAGS') &&
          p.volume?.h24 > 50000 &&
          (p.marketCap || p.fdv || 0) < 500000
        )
        .map((p: any) => ({
          symbol: p.baseToken.symbol,
          name: p.baseToken.name,
          mint: p.baseToken.address,
          price: parseFloat(p.priceUsd || '0'),
          mcap: p.marketCap || p.fdv || 0,
          vol24h: p.volume?.h24 || 0,
          change1h: p.priceChange?.h1 || 0,
          buySell1h: p.txns?.h1 ? (p.txns.h1.buys / Math.max(p.txns.h1.sells, 1)).toFixed(2) : '0',
          buys1h: p.txns?.h1?.buys || 0,
          sells1h: p.txns?.h1?.sells || 0,
        }))
        .sort((a: any, b: any) => b.vol24h / b.mcap - a.vol24h / a.mcap)
        .slice(0, 5);
    }
  } catch {}
  return [];
}

// ═══════════════════════════════════════════════════════════════════════════
// DISPLAY
// ═══════════════════════════════════════════════════════════════════════════

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function formatPct(n: number): string {
  const sign = n >= 0 ? '+' : '';
  const color = n >= 0 ? '\x1b[32m' : '\x1b[31m';
  return `${color}${sign}${n.toFixed(1)}%\x1b[0m`;
}

function formatPnl(pnl: number, pct: number): string {
  const sign = pnl >= 0 ? '+' : '';
  const color = pnl >= 0 ? '\x1b[32m' : '\x1b[31m';
  return `${color}${sign}${pnl.toFixed(4)} SOL (${sign}${pct.toFixed(1)}%)\x1b[0m`;
}

async function renderDashboard() {
  console.clear();
  const now = new Date().toISOString();
  
  console.log('\x1b[36m');
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║                         🤖 BAGBOT DASHBOARD                          ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log('\x1b[0m');
  console.log(`  ${now}\n`);

  // Wallet
  const solBalance = await getSolBalance();
  const solPrice = await getSolPrice();
  const walletUsd = solBalance * solPrice;
  
  console.log('\x1b[33m┌─ WALLET ─────────────────────────────────────────────────────────────┐\x1b[0m');
  console.log(`  Address:   ${WALLET}`);
  console.log(`  Balance:   \x1b[1m${solBalance.toFixed(4)} SOL\x1b[0m (${formatUsd(walletUsd)})`);
  console.log(`  SOL Price: ${formatUsd(solPrice)}`);
  console.log('\x1b[33m└──────────────────────────────────────────────────────────────────────┘\x1b[0m\n');

  // Positions
  const positions = await getPositions();
  let totalValue = solBalance;
  let totalCost = 0;
  
  console.log('\x1b[33m┌─ POSITIONS ──────────────────────────────────────────────────────────┐\x1b[0m');
  
  if (positions.length === 0) {
    console.log('  No open positions');
  } else {
    for (const pos of positions) {
      const data = await getTokenData(pos.mint);
      if (data) {
        const currentPrice = parseFloat(data.priceUsd);
        const currentValue = pos.tokens * currentPrice;
        const currentValueSol = currentValue / solPrice;
        const pnlSol = currentValueSol - pos.entry_sol;
        const pnlPct = ((currentValueSol / pos.entry_sol) - 1) * 100;
        
        totalValue += currentValueSol;
        totalCost += pos.entry_sol;
        
        const buySell = data.txns.h1.sells > 0 
          ? (data.txns.h1.buys / data.txns.h1.sells).toFixed(2) 
          : '∞';
        
        console.log(`  \x1b[1m${pos.symbol}\x1b[0m (${pos.name})`);
        console.log(`  ├─ Tokens:    ${pos.tokens.toLocaleString()}`);
        console.log(`  ├─ Entry:     ${pos.entry_sol} SOL @ $${pos.entry_price_usd.toFixed(8)}`);
        console.log(`  ├─ Current:   $${currentPrice.toFixed(8)} | MCAP: ${formatUsd(data.marketCap)}`);
        console.log(`  ├─ Value:     ${currentValueSol.toFixed(4)} SOL (${formatUsd(currentValue)})`);
        console.log(`  ├─ P&L:       ${formatPnl(pnlSol, pnlPct)}`);
        console.log(`  ├─ 1h:        ${formatPct(data.priceChange.h1 || 0)} | B/S: ${buySell}`);
        console.log(`  └─ Volume:    ${formatUsd(data.volume24h)} (24h)`);
        console.log('');
      }
    }
  }
  console.log('\x1b[33m└──────────────────────────────────────────────────────────────────────┘\x1b[0m\n');

  // Portfolio Summary
  const totalPnl = totalValue - solBalance - totalCost;
  const totalPnlPct = totalCost > 0 ? ((totalValue - solBalance) / totalCost - 1) * 100 : 0;
  
  console.log('\x1b[33m┌─ PORTFOLIO ──────────────────────────────────────────────────────────┐\x1b[0m');
  console.log(`  Total Value:   \x1b[1m${totalValue.toFixed(4)} SOL\x1b[0m (${formatUsd(totalValue * solPrice)})`);
  console.log(`  In Positions:  ${totalCost.toFixed(4)} SOL`);
  console.log(`  Available:     ${solBalance.toFixed(4)} SOL`);
  if (totalCost > 0) {
    console.log(`  Unrealized:    ${formatPnl(totalPnl, totalPnlPct)}`);
  }
  console.log('\x1b[33m└──────────────────────────────────────────────────────────────────────┘\x1b[0m\n');

  // Scanner
  console.log('\x1b[33m┌─ OPPORTUNITY SCANNER ────────────────────────────────────────────────┐\x1b[0m');
  console.log('  Scanning for BAGS runners (>$50K vol, <$500K mcap)...\n');
  
  const runners = await scanForRunners();
  if (runners.length === 0) {
    console.log('  No runners found matching criteria');
  } else {
    console.log('  Symbol       MCAP        Vol 24h     1h Change   B/S Ratio');
    console.log('  ─────────────────────────────────────────────────────────────');
    for (const r of runners) {
      const symbol = r.symbol.padEnd(10);
      const mcap = formatUsd(r.mcap).padEnd(10);
      const vol = formatUsd(r.vol24h).padEnd(10);
      const change = formatPct(r.change1h).padEnd(18);
      console.log(`  ${symbol} ${mcap} ${vol} ${change} ${r.buySell}`);
    }
  }
  console.log('\x1b[33m└──────────────────────────────────────────────────────────────────────┘\x1b[0m\n');

  console.log('\x1b[90m  Commands: dashboard | bags | bags-search | execute-swap\x1b[0m');
  console.log('\x1b[90m  Press Ctrl+C to exit\x1b[0m\n');
}

// Main
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--watch') || args.includes('-w')) {
    // Continuous mode
    while (true) {
      await renderDashboard();
      await new Promise(r => setTimeout(r, 30000)); // Refresh every 30s
    }
  } else {
    // Single run
    await renderDashboard();
  }
}

main().catch(console.error);
