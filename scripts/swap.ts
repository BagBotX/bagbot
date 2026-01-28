#!/usr/bin/env ts-node
/**
 * BagBot Swap Executor
 * Executes token swaps via Jupiter Ultra API
 * 
 * SAFETY: Dry run by default. Use --execute flag to actually swap.
 */

import axios from 'axios';
import { Connection, Keypair, PublicKey, VersionedTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const WALLET_PATH = process.env.WALLET_PATH || './wallet/bagbot-keypair.json';
const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const JUPITER_API = 'https://api.jup.ag/ultra/v1';

// Limits
const MAX_SWAP_SOL = parseFloat(process.env.MAX_SWAP_SOL || '1.0');
const DEFAULT_SLIPPAGE = parseInt(process.env.DEFAULT_SLIPPAGE_BPS || '50');
const MAX_PRICE_IMPACT = parseFloat(process.env.MAX_PRICE_IMPACT_PCT || '1.0');

const TOKENS: Record<string, string> = {
  'SOL': 'So11111111111111111111111111111111111111112',
  'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'BONK': 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  'WIF': 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  'JUP': 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
};

function loadKeypair(): Keypair {
  const keypairPath = path.resolve(WALLET_PATH);
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(keypairData));
}

async function getQuote(inputMint: string, outputMint: string, amount: string, slippageBps: number) {
  const res = await axios.get(`${JUPITER_API}/quote`, {
    params: { inputMint, outputMint, amount, slippageBps },
    timeout: 15000,
  });
  return res.data;
}

async function getSwapTransaction(quote: any, userPublicKey: string) {
  const res = await axios.post(`${JUPITER_API}/swap`, {
    quoteResponse: quote,
    userPublicKey,
    wrapAndUnwrapSol: true,
    dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: 'auto',
  }, { timeout: 15000 });
  return res.data;
}

async function main() {
  const args = process.argv.slice(2);
  const executeFlag = args.includes('--execute');
  const filteredArgs = args.filter(a => a !== '--execute');
  
  if (filteredArgs.length < 3) {
    console.log('Usage: swap.ts <from> <to> <amount> [--execute]');
    console.log('Example: swap.ts SOL USDC 0.1 --execute');
    console.log('\n⚠️  Without --execute, this is a dry run (quote only)');
    console.log('\nAvailable tokens:', Object.keys(TOKENS).join(', '));
    return;
  }
  
  const [fromSymbol, toSymbol, amountStr] = filteredArgs;
  const inputMint = TOKENS[fromSymbol.toUpperCase()] || fromSymbol;
  const outputMint = TOKENS[toSymbol.toUpperCase()] || toSymbol;
  
  // Convert amount to lamports/smallest unit
  let amount: bigint;
  if (fromSymbol.toUpperCase() === 'SOL') {
    amount = BigInt(Math.floor(parseFloat(amountStr) * LAMPORTS_PER_SOL));
    
    // Safety check
    if (parseFloat(amountStr) > MAX_SWAP_SOL) {
      console.error(`❌ REJECTED: ${amountStr} SOL exceeds max swap limit of ${MAX_SWAP_SOL} SOL`);
      process.exit(1);
    }
  } else {
    // Assume 6 decimals for other tokens (USDC etc)
    amount = BigInt(Math.floor(parseFloat(amountStr) * 1_000_000));
  }
  
  console.log('\n=== BagBot Swap ===');
  console.log(`Mode: ${executeFlag ? '🔴 LIVE EXECUTION' : '🟡 DRY RUN'}`);
  console.log(`From: ${fromSymbol} → To: ${toSymbol}`);
  console.log(`Amount: ${amountStr} (${amount.toString()} raw)`);
  console.log(`Slippage: ${DEFAULT_SLIPPAGE} bps`);
  console.log('');
  
  // Get quote
  console.log('Fetching quote...');
  const quote = await getQuote(inputMint, outputMint, amount.toString(), DEFAULT_SLIPPAGE);
  
  if (!quote) {
    console.error('❌ Failed to get quote');
    process.exit(1);
  }
  
  const priceImpact = parseFloat(quote.priceImpactPct || '0');
  console.log(`\n--- Quote ---`);
  console.log(`Input: ${quote.inAmount}`);
  console.log(`Output: ${quote.outAmount}`);
  console.log(`Price Impact: ${priceImpact}%`);
  
  // Price impact check
  if (priceImpact > MAX_PRICE_IMPACT) {
    console.error(`\n❌ REJECTED: Price impact ${priceImpact}% exceeds limit of ${MAX_PRICE_IMPACT}%`);
    process.exit(1);
  }
  
  if (!executeFlag) {
    console.log('\n🟡 DRY RUN COMPLETE - Add --execute to swap');
    return;
  }
  
  // Load wallet and execute
  console.log('\nLoading wallet...');
  const keypair = loadKeypair();
  const connection = new Connection(RPC, 'confirmed');
  
  // Check balance
  const balance = await connection.getBalance(keypair.publicKey);
  console.log(`Wallet balance: ${balance / LAMPORTS_PER_SOL} SOL`);
  
  if (balance < Number(amount) + 10_000_000) { // Need amount + ~0.01 SOL for fees
    console.error('❌ Insufficient balance');
    process.exit(1);
  }
  
  // Get swap transaction
  console.log('\nBuilding transaction...');
  const swapData = await getSwapTransaction(quote, keypair.publicKey.toString());
  
  // Deserialize and sign
  const txBuf = Buffer.from(swapData.swapTransaction, 'base64');
  const tx = VersionedTransaction.deserialize(txBuf);
  tx.sign([keypair]);
  
  // Simulate first
  console.log('Simulating...');
  const simulation = await connection.simulateTransaction(tx);
  if (simulation.value.err) {
    console.error('❌ Simulation failed:', simulation.value.err);
    process.exit(1);
  }
  console.log('✅ Simulation passed');
  
  // Execute
  console.log('Executing...');
  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: true,
    maxRetries: 3,
  });
  
  console.log(`\n✅ Transaction sent: ${sig}`);
  console.log(`https://solscan.io/tx/${sig}`);
  
  // Wait for confirmation
  const confirmation = await connection.confirmTransaction(sig, 'confirmed');
  if (confirmation.value.err) {
    console.error('❌ Transaction failed:', confirmation.value.err);
  } else {
    console.log('✅ Transaction confirmed!');
  }
}

main().catch(console.error);
