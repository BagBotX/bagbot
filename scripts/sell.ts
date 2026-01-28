#!/usr/bin/env npx ts-node
/**
 * Sell BAGS tokens back to SOL
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { 
  Connection, 
  Keypair, 
  VersionedTransaction,
  PublicKey,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import bs58 from 'bs58';

const BASE_URL = 'https://public-api-v2.bags.fm/api/v1';
const RPC_URL = 'https://api.mainnet-beta.solana.com';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

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

async function getTokenBalance(mint: string, wallet: string): Promise<{ balance: number; decimals: number }> {
  const connection = new Connection(RPC_URL, 'confirmed');
  const walletPubkey = new PublicKey(wallet);
  const mintPubkey = new PublicKey(mint);
  
  try {
    const ata = await getAssociatedTokenAddress(mintPubkey, walletPubkey);
    const accountInfo = await connection.getTokenAccountBalance(ata);
    return {
      balance: parseFloat(accountInfo.value.amount),
      decimals: accountInfo.value.decimals,
    };
  } catch {
    return { balance: 0, decimals: 9 };
  }
}

async function executeSell(
  inputMint: string,
  amount: number | 'all',
  slippageBps: number = 100
) {
  const connection = new Connection(RPC_URL, 'confirmed');
  const keypair = getKeypair();
  const wallet = keypair.publicKey.toBase58();
  
  // Get token balance
  const { balance, decimals } = await getTokenBalance(inputMint, wallet);
  const readableBalance = balance / Math.pow(10, decimals);
  
  console.log(`\n💰 TOKEN BALANCE: ${readableBalance.toLocaleString()} tokens\n`);
  
  if (balance === 0) {
    throw new Error('No tokens to sell');
  }
  
  const sellAmount = amount === 'all' ? balance : Math.floor(amount * Math.pow(10, decimals));
  const sellReadable = sellAmount / Math.pow(10, decimals);
  
  console.log(`🔴 EXECUTING SELL`);
  console.log(`   Wallet: ${wallet}`);
  console.log(`   Selling: ${sellReadable.toLocaleString()} tokens`);
  console.log(`   For: SOL`);
  console.log(`   Slippage: ${slippageBps} bps\n`);

  // Step 1: Get quote
  console.log('📊 Step 1: Getting quote...');
  const quoteRes = await api.get('/trade/quote', {
    params: {
      inputMint,
      outputMint: SOL_MINT,
      amount: sellAmount.toString(),
      slippageBps,
      slippageMode: 'manual',
    },
  });
  
  if (!quoteRes.data.success) {
    throw new Error(`Quote failed: ${quoteRes.data.error}`);
  }
  
  const quote = quoteRes.data.response;
  const outSol = Number(quote.outAmount) / 1e9;
  const minOutSol = Number(quote.minOutAmount) / 1e9;
  
  console.log(`   ✅ Output: ${outSol.toFixed(6)} SOL`);
  console.log(`   ✅ Min Output: ${minOutSol.toFixed(6)} SOL`);
  console.log(`   ✅ Price Impact: ${quote.priceImpactPct}%\n`);

  // Check price impact
  const priceImpact = parseFloat(quote.priceImpactPct);
  if (priceImpact > 2) {
    throw new Error(`Price impact too high: ${priceImpact}% (max 2%)`);
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
  
  console.log(`   ✅ Transaction created\n`);

  // Step 3: Sign and broadcast
  console.log('✍️  Step 3: Signing...');
  const txBuffer = bs58.decode(swapRes.data.response.swapTransaction);
  const transaction = VersionedTransaction.deserialize(txBuffer);
  transaction.sign([keypair]);
  console.log(`   ✅ Signed\n`);

  console.log('📡 Step 4: Broadcasting...');
  const signature = await connection.sendTransaction(transaction, {
    skipPreflight: true,
    maxRetries: 3,
  });
  console.log(`   ✅ Sent: ${signature}\n`);

  console.log('⏳ Step 5: Confirming...');
  const latestBlockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({
    signature,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: swapRes.data.response.lastValidBlockHeight || latestBlockhash.lastValidBlockHeight,
  }, 'confirmed');
  
  console.log(`   ✅ CONFIRMED!\n`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`🎉 SELL SUCCESSFUL`);
  console.log(`   Sold: ${sellReadable.toLocaleString()} tokens`);
  console.log(`   Received: ~${outSol.toFixed(6)} SOL`);
  console.log(`   Tx: https://solscan.io/tx/${signature}`);
  console.log('═══════════════════════════════════════════════════════════\n');
  
  return { signature, soldTokens: sellReadable, receivedSol: outSol };
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log(`
Usage: sell <inputMint> [amount|all] [slippageBps]

Examples:
  sell AtiFyHm6UMNLXCWJGLqhxSwvr3n3MgFKxppkKWUoBAGS all
  sell AtiFyHm6UMNLXCWJGLqhxSwvr3n3MgFKxppkKWUoBAGS 100000 150
    `);
    process.exit(1);
  }
  
  const [inputMint, amountStr, slippageStr] = args;
  const amount = amountStr === 'all' || !amountStr ? 'all' : parseFloat(amountStr);
  const slippageBps = slippageStr ? parseInt(slippageStr) : 300; // Higher default for volatile tokens
  
  try {
    await executeSell(inputMint, amount, slippageBps);
  } catch (error: any) {
    console.error(`\n❌ SELL FAILED: ${error.message}`);
    process.exit(1);
  }
}

main();
