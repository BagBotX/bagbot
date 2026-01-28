#!/usr/bin/env npx ts-node
/**
 * BAGS Portfolio Tracker
 * Tracks positions, calculates P&L, monitors entry/exit targets
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const WATCHLIST_PATH = path.join(__dirname, '..', 'data', 'watchlist.json');

interface Position {
  symbol: string;
  name: string;
  address: string;
  entryPrice: number;
  entryDate: string;
  tokens: number;
  costBasis: number;
  notes?: string;
}

interface WatchlistData {
  positions: Position[];
  watchlist: any[];
  lastUpdated: string;
}

interface TokenData {
  priceUsd: number;
  marketCap: number;
  volume24h: number;
  liquidity: number;
  priceChange24h: number;
  priceChange1h: number;
  buysSells24h: { buys: number; sells: number };
}

async function fetchTokenData(address: string): Promise<TokenData | null> {
  try {
    const response = await axios.get(
      `https://api.dexscreener.com/tokens/v1/solana/${address}`,
      { timeout: 10000 }
    );
    
    if (response.data && response.data.length > 0) {
      const pair = response.data[0];
      return {
        priceUsd: parseFloat(pair.priceUsd || '0'),
        marketCap: pair.marketCap || pair.fdv || 0,
        volume24h: pair.volume?.h24 || 0,
        liquidity: pair.liquidity?.usd || 0,
        priceChange24h: pair.priceChange?.h24 || 0,
        priceChange1h: pair.priceChange?.h1 || 0,
        buysSells24h: pair.txns?.h24 || { buys: 0, sells: 0 },
      };
    }
    return null;
  } catch {
    return null;
  }
}

function formatUsd(num: number): string {
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}

function formatPercent(num: number): string {
  const sign = num >= 0 ? '+' : '';
  const emoji = num >= 0 ? '📈' : '📉';
  return `${emoji} ${sign}${num.toFixed(1)}%`;
}

function formatPnL(pnl: number, pnlPercent: number): string {
  const sign = pnl >= 0 ? '+' : '';
  const emoji = pnl >= 0 ? '🟢' : '🔴';
  return `${emoji} ${sign}${formatUsd(pnl).replace('$', '')} (${sign}${pnlPercent.toFixed(0)}%)`;
}

async function displayPortfolio() {
  // Load watchlist
  let watchlist: WatchlistData;
  try {
    watchlist = JSON.parse(fs.readFileSync(WATCHLIST_PATH, 'utf-8'));
  } catch {
    console.error('❌ Could not load watchlist.json');
    process.exit(1);
  }

  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║                     💰 BAGBOT PORTFOLIO 💰                        ║');
  console.log('╠═══════════════════════════════════════════════════════════════════╣');
  console.log(`║  ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }).padEnd(63)}║`);
  console.log('╚═══════════════════════════════════════════════════════════════════╝');
  console.log('');

  let totalCostBasis = 0;
  let totalCurrentValue = 0;
  const results: any[] = [];

  for (const pos of watchlist.positions) {
    const data = await fetchTokenData(pos.address);
    
    if (data) {
      const currentValue = data.priceUsd * pos.tokens;
      const pnl = currentValue - pos.costBasis;
      const pnlPercent = ((currentValue / pos.costBasis) - 1) * 100;
      const priceFromEntry = ((data.priceUsd / pos.entryPrice) - 1) * 100;

      totalCostBasis += pos.costBasis;
      totalCurrentValue += currentValue;

      results.push({
        symbol: pos.symbol,
        name: pos.name,
        tokens: pos.tokens,
        entryPrice: pos.entryPrice,
        currentPrice: data.priceUsd,
        costBasis: pos.costBasis,
        currentValue,
        pnl,
        pnlPercent,
        priceFromEntry,
        marketCap: data.marketCap,
        change24h: data.priceChange24h,
        change1h: data.priceChange1h,
        volume: data.volume24h,
        buysSells: data.buysSells24h,
        notes: pos.notes,
      });
    } else {
      results.push({
        symbol: pos.symbol,
        name: pos.name,
        error: true,
      });
    }
  }

  // Sort by current value descending
  results.sort((a, b) => (b.currentValue || 0) - (a.currentValue || 0));

  // Display each position
  for (const r of results) {
    if (r.error) {
      console.log(`❌ ${r.symbol} (${r.name}) - Data unavailable`);
      console.log('');
      continue;
    }

    const isDiamond = r.notes?.includes('💎');
    const header = isDiamond ? `💎 ${r.symbol}` : r.symbol;
    
    console.log(`┌───────────────────────────────────────────────────────────────────┐`);
    console.log(`│ ${header.padEnd(20)} ${formatUsd(r.currentValue).padStart(12)} │ ${formatPnL(r.pnl, r.pnlPercent).padEnd(28)}│`);
    console.log(`├───────────────────────────────────────────────────────────────────┤`);
    console.log(`│  Entry:   $${r.entryPrice.toFixed(8).padEnd(15)} Current: $${r.currentPrice.toFixed(8).padEnd(15)}│`);
    console.log(`│  Tokens:  ${r.tokens.toLocaleString().padEnd(15)} MCAP:    ${formatUsd(r.marketCap).padEnd(15)}│`);
    console.log(`│  24h:     ${formatPercent(r.change24h).padEnd(15)} 1h:      ${formatPercent(r.change1h).padEnd(15)}│`);
    console.log(`│  Volume:  ${formatUsd(r.volume).padEnd(15)} B/S:     ${r.buysSells.buys}/${r.buysSells.sells}`.padEnd(68) + '│');
    if (r.notes) {
      console.log(`│  📝 ${r.notes.substring(0, 60).padEnd(60)}│`);
    }
    console.log(`└───────────────────────────────────────────────────────────────────┘`);
    console.log('');
  }

  // Portfolio summary
  const totalPnL = totalCurrentValue - totalCostBasis;
  const totalPnLPercent = ((totalCurrentValue / totalCostBasis) - 1) * 100;

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('                        PORTFOLIO SUMMARY                          ');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`  Cost Basis:     ${formatUsd(totalCostBasis)} SOL`);
  console.log(`  Current Value:  ${formatUsd(totalCurrentValue)}`);
  console.log(`  Total P&L:      ${formatPnL(totalPnL, totalPnLPercent)}`);
  console.log(`  Positions:      ${results.filter(r => !r.error).length}`);
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('  🎯 Only BAGS ecosystem tokens. Built by my idols.');
  console.log('');
}

// Quick position summary for heartbeat
async function quickSummary() {
  let watchlist: WatchlistData;
  try {
    watchlist = JSON.parse(fs.readFileSync(WATCHLIST_PATH, 'utf-8'));
  } catch {
    console.log('❌ No watchlist');
    return;
  }

  let totalValue = 0;
  const lines: string[] = [];

  for (const pos of watchlist.positions) {
    const data = await fetchTokenData(pos.address);
    if (data) {
      const value = data.priceUsd * pos.tokens;
      const pnl = ((value / pos.costBasis) - 1) * 100;
      totalValue += value;
      const emoji = pnl >= 0 ? '🟢' : '🔴';
      lines.push(`${emoji} ${pos.symbol}: ${formatUsd(value)} (${pnl >= 0 ? '+' : ''}${pnl.toFixed(0)}%)`);
    }
  }

  console.log(`💰 Portfolio: ${formatUsd(totalValue)}`);
  lines.forEach(l => console.log(`   ${l}`));
}

// Main
const args = process.argv.slice(2);

if (args[0] === 'quick' || args[0] === '-q') {
  quickSummary();
} else {
  displayPortfolio();
}
