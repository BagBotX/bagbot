#!/usr/bin/env npx ts-node
/**
 * Execute BAGS swap - full flow
 * Quote → Transaction → Sign → Broadcast
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { 
  Connection, 
  Keypair, 
  VersionedTransaction,
  TransactionConfirmationStrategy,
} from '@solana/web3.js';
import bs58 from 'bs58';

const BASE_URL = 'https://public-api-v2.bags.fm/api/v1';
const RPC_URL = 'https://api.mainnet-beta.solana.com';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const LAMPORTS_PER_SOL = 1_000_000_000;

// Load credentials
function getApiKey(): string {
  const envPath = path.join(process.env.HOME || '', '.credentials', 'bags.env');
  const content = fs.readFileSync(envPath, 'utf-8');
  const match = content.match(/BAGS_API_KEY=(.+)/);
  if (match) return match[1].trim();
  throw new Error('BAGS_API_KEY not found');
}

function getKeypair(): Keypair {
  const keypairPath = path.join(process.env.HOME || '', 'clawd-bagbot', 'wallet', 'bagbot-keypair.json');
  const secretKey = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  return Keypair.fromSecretKey(new Uint8Array(secretKey));
}

const API_KEY = getApiKey();
const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'x-api-key': API_KEY },
  timeout: 30000,
});

async function executeSwap(
  outputMint: string,
  solAmount: number,
  slippageBps: number = 100
) {
  const connection = new Connection(RPC_URL, 'confirmed');
  const keypair = getKeypair();
  const wallet = keypair.publicKey.toBase58();
  
  console.log(`\n🚀 EXECUTING SWAP`);
  console.log(`   Wallet: ${wallet}`);
  console.log(`   Input:  ${solAmount} SOL`);
  console.log(`   Output: ${outputMint.slice(0,8)}...BAGS`);
  console.log(`   Slippage: ${slippageBps} bps\n`);

  // Step 1: Get quote
  console.log('📊 Step 1: Getting quote...');
  const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
  
  const quoteRes = await api.get('/trade/quote', {
    params: {
      inputMint: SOL_MINT,
      outputMint,
      amount: lamports.toString(),
      slippageBps,
      slippageMode: 'manual',
    },
  });
  
  if (!quoteRes.data.success) {
    throw new Error(`Quote failed: ${quoteRes.data.error}`);
  }
  
  const quote = quoteRes.data.response;
  const outDecimals = quote.routePlan[0]?.outputMintDecimals || 9;
  const outAmount = Number(quote.outAmount) / Math.pow(10, outDecimals);
  
  console.log(`   ✅ Output: ${outAmount.toLocaleString()} tokens`);
  console.log(`   ✅ Price Impact: ${quote.priceImpactPct}%`);
  console.log(`   ✅ Venue: ${quote.routePlan.map((r: any) => r.venue).join(' → ')}\n`);

  // Check price impact
  const priceImpact = parseFloat(quote.priceImpactPct);
  if (priceImpact > 1) {
    throw new Error(`Price impact too high: ${priceImpact}% (max 1%)`);
  }

  // Step 2: Create swap transaction
  console.log('🔧 Step 2: Creating transaction...');
  const swapRes = await api.post('/trade/swap', {
    quoteResponse: quote,
    userPublicKey: wallet,
  });
  
  if (!swapRes.data.success) {
    throw new Error(`Swap creation failed: ${swapRes.data.error}`);
  }
  
  const swapData = swapRes.data.response;
  console.log(`   ✅ Transaction created`);
  console.log(`   ✅ Compute units: ${swapData.computeUnitLimit}`);
  console.log(`   ✅ Priority fee: ${swapData.prioritizationFeeLamports} lamports\n`);

  // Step 3: Deserialize and sign
  console.log('✍️  Step 3: Signing transaction...');
  const txBuffer = bs58.decode(swapData.swapTransaction);
  const transaction = VersionedTransaction.deserialize(txBuffer);
  transaction.sign([keypair]);
  console.log(`   ✅ Signed\n`);

  // Step 4: Broadcast
  console.log('📡 Step 4: Broadcasting...');
  const signature = await connection.sendTransaction(transaction, {
    skipPreflight: true,
    maxRetries: 3,
  });
  console.log(`   ✅ Sent: ${signature}\n`);

  // Step 5: Confirm
  console.log('⏳ Step 5: Confirming...');
  const latestBlockhash = await connection.getLatestBlockhash();
  
  const confirmStrategy: TransactionConfirmationStrategy = {
    signature,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: swapData.lastValidBlockHeight || latestBlockhash.lastValidBlockHeight,
  };
  
  const confirmation = await connection.confirmTransaction(confirmStrategy, 'confirmed');
  
  if (confirmation.value.err) {
    throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
  }
  
  console.log(`   ✅ CONFIRMED!\n`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`🎉 SWAP SUCCESSFUL`);
  console.log(`   Bought: ~${outAmount.toLocaleString()} tokens`);
  console.log(`   Spent:  ${solAmount} SOL`);
  console.log(`   Tx:     https://solscan.io/tx/${signature}`);
  console.log('═══════════════════════════════════════════════════════════\n');
  
  return {
    signature,
    inputAmount: solAmount,
    outputAmount: outAmount,
    outputMint,
    priceImpact,
  };
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log(`
Usage: execute-swap <outputMint> <solAmount> [slippageBps]

Example:
  execute-swap AtiFyHm6UMNLXCWJGLqhxSwvr3n3MgFKxppkKWUoBAGS 0.2 100
    `);
    process.exit(1);
  }
  
  const [outputMint, solAmountStr, slippageStr] = args;
  const solAmount = parseFloat(solAmountStr);
  const slippageBps = slippageStr ? parseInt(slippageStr) : 100;
  
  if (solAmount > 1) {
    console.error('❌ Max 1 SOL per trade. Aborting.');
    process.exit(1);
  }
  
  try {
    const result = await executeSwap(outputMint, solAmount, slippageBps);
    
    // Output for scripting
    console.log('\n--- RESULT JSON ---');
    console.log(JSON.stringify(result, null, 2));
  } catch (error: any) {
    console.error(`\n❌ SWAP FAILED: ${error.message}`);
    process.exit(1);
  }
}

main();
