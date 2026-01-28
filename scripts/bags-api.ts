#!/usr/bin/env npx ts-node
/**
 * bags.fm API Client
 * Native integration with the BAGS ecosystem
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'https://public-api-v2.bags.fm/api/v1';

// Load API key from credentials
function getApiKey(): string {
  const envPath = path.join(process.env.HOME || '', '.credentials', 'bags.env');
  try {
    const content = fs.readFileSync(envPath, 'utf-8');
    const match = content.match(/BAGS_API_KEY=(.+)/);
    if (match) return match[1].trim();
  } catch (e) {}
  throw new Error('BAGS_API_KEY not found in ~/.credentials/bags.env');
}

const API_KEY = getApiKey();

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'x-api-key': API_KEY },
  timeout: 15000,
});

// ============ TYPES ============

interface QuoteParams {
  inputMint: string;
  outputMint: string;
  amount: string | number;  // in smallest units (lamports)
  slippageBps?: number;
  slippageMode?: 'auto' | 'manual';
}

interface QuoteResponse {
  requestId: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  minOutAmount: string;
  priceImpactPct: string;
  slippageBps: number;
  routePlan: RouteLeg[];
  platformFee: { amount: string; feeBps: number; mode: string } | null;
  contextSlot: number;
  simulatedComputeUnits: number;
}

interface RouteLeg {
  venue: string;
  marketKey: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  inputMintDecimals: number;
  outputMintDecimals: number;
}

interface SwapResponse {
  swapTransaction: string;  // base58 VersionedTransaction
  computeUnitLimit: number;
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
}

interface TokenLifetimeFees {
  mint: string;
  totalFeesUsd: number;
  totalFeesSol: number;
}

// ============ API FUNCTIONS ============

/**
 * Get a trade quote
 */
export async function getQuote(params: QuoteParams): Promise<QuoteResponse> {
  const { data } = await api.get('/trade/quote', {
    params: {
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amount: params.amount.toString(),
      slippageBps: params.slippageBps || 50,
      slippageMode: params.slippageMode || 'manual',
    },
  });
  
  if (!data.success) throw new Error(data.error || 'Quote failed');
  return data.response;
}

/**
 * Create swap transaction from quote
 */
export async function createSwap(
  quoteResponse: QuoteResponse,
  userPublicKey: string
): Promise<SwapResponse> {
  const { data } = await api.post('/trade/swap', {
    quoteResponse,
    userPublicKey,
  });
  
  if (!data.success) throw new Error(data.error || 'Swap creation failed');
  return data.response;
}

/**
 * Get token lifetime fees
 */
export async function getTokenFees(mint: string): Promise<any> {
  const { data } = await api.get(`/analytics/token/${mint}/lifetime-fees`);
  if (!data.success) throw new Error(data.error || 'Failed to get fees');
  return data.response;
}

/**
 * Get token claim stats
 */
export async function getTokenClaimStats(mint: string): Promise<any> {
  const { data } = await api.get(`/analytics/token/${mint}/claim-stats`);
  if (!data.success) throw new Error(data.error || 'Failed to get claim stats');
  return data.response;
}

/**
 * Get token creators
 */
export async function getTokenCreators(mint: string): Promise<any> {
  const { data } = await api.get(`/analytics/token/${mint}/creators`);
  if (!data.success) throw new Error(data.error || 'Failed to get creators');
  return data.response;
}

// ============ HELPERS ============

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const LAMPORTS_PER_SOL = 1_000_000_000;

export function solToLamports(sol: number): string {
  return Math.floor(sol * LAMPORTS_PER_SOL).toString();
}

export function lamportsToSol(lamports: string | number): number {
  return Number(lamports) / LAMPORTS_PER_SOL;
}

export function formatTokenAmount(amount: string, decimals: number = 9): string {
  const num = Number(amount) / Math.pow(10, decimals);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  return num.toFixed(4);
}

// ============ CLI ============

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'quote') {
    // bags-api quote <inputMint> <outputMint> <amount> [slippageBps]
    const [, inputMint, outputMint, amount, slippage] = args;
    
    if (!inputMint || !outputMint || !amount) {
      console.log('Usage: bags-api quote <inputMint> <outputMint> <amount> [slippageBps]');
      console.log('  amount in SOL if inputMint is SOL, otherwise smallest units');
      process.exit(1);
    }

    const isSolInput = inputMint === 'SOL' || inputMint === SOL_MINT;
    const actualInputMint = isSolInput ? SOL_MINT : inputMint;
    const actualAmount = isSolInput ? solToLamports(parseFloat(amount)) : amount;

    console.log(`\n📊 Getting quote...`);
    console.log(`   ${isSolInput ? amount + ' SOL' : amount} → ${outputMint.slice(0, 8)}...BAGS\n`);

    try {
      const quote = await getQuote({
        inputMint: actualInputMint,
        outputMint,
        amount: actualAmount,
        slippageBps: slippage ? parseInt(slippage) : 50,
      });

      const outDecimals = quote.routePlan[0]?.outputMintDecimals || 9;
      
      console.log('✅ Quote received:');
      console.log(`   Input:        ${formatTokenAmount(quote.inAmount, 9)} SOL`);
      console.log(`   Output:       ${formatTokenAmount(quote.outAmount, outDecimals)} tokens`);
      console.log(`   Min Output:   ${formatTokenAmount(quote.minOutAmount, outDecimals)} tokens`);
      console.log(`   Price Impact: ${quote.priceImpactPct}%`);
      console.log(`   Slippage:     ${quote.slippageBps} bps`);
      console.log(`   Venue:        ${quote.routePlan.map(r => r.venue).join(' → ')}`);
      if (quote.platformFee) {
        console.log(`   Platform Fee: ${quote.platformFee.feeBps} bps`);
      }
      console.log(`   Request ID:   ${quote.requestId}`);
    } catch (e: any) {
      console.error('❌ Quote failed:', e.message);
    }

  } else if (command === 'fees') {
    // bags-api fees <mint>
    const mint = args[1];
    if (!mint) {
      console.log('Usage: bags-api fees <mint>');
      process.exit(1);
    }

    console.log(`\n📊 Getting lifetime fees for ${mint.slice(0, 8)}...BAGS\n`);

    try {
      const fees = await getTokenFees(mint);
      console.log('✅ Lifetime Fees:', JSON.stringify(fees, null, 2));
    } catch (e: any) {
      console.error('❌ Failed:', e.message);
    }

  } else if (command === 'creators') {
    // bags-api creators <mint>
    const mint = args[1];
    if (!mint) {
      console.log('Usage: bags-api creators <mint>');
      process.exit(1);
    }

    console.log(`\n📊 Getting creators for ${mint.slice(0, 8)}...BAGS\n`);

    try {
      const creators = await getTokenCreators(mint);
      console.log('✅ Creators:', JSON.stringify(creators, null, 2));
    } catch (e: any) {
      console.error('❌ Failed:', e.message);
    }

  } else {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║              bags.fm API Client - BagBot                 ║
╠══════════════════════════════════════════════════════════╣
║  Commands:                                               ║
║                                                          ║
║  quote <in> <out> <amt> [slip]  Get swap quote           ║
║    • in: SOL or mint address                             ║
║    • out: BAGS token mint address                        ║
║    • amt: amount (SOL if input is SOL)                   ║
║    • slip: slippage in bps (default 50)                  ║
║                                                          ║
║  fees <mint>                    Token lifetime fees      ║
║  creators <mint>                Token creators           ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
    `);
  }
}

main().catch(console.error);
