#!/usr/bin/env ts-node
/**
 * Jupiter v1 Swap with API Key
 */
import axios from 'axios';
import { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ path: process.env.HOME + '/.credentials/jupiter.env' });

const JUP_API_KEY = process.env.JUPITER_API_KEY;
const WALLET_PATH = './wallet/bagbot-keypair.json';
const RPC = 'https://api.mainnet-beta.solana.com';

async function main() {
  const [inputMint, outputMint, amount] = process.argv.slice(2);
  if (!inputMint || !outputMint || !amount) {
    console.log('Usage: jup-swap-exec.ts <inputMint> <outputMint> <amount>');
    return;
  }
  
  console.log('\n🚀 Jupiter Swap Execution');
  console.log(`Input: ${inputMint.slice(0,8)}...`);
  console.log(`Output: ${outputMint.slice(0,8)}...`);
  console.log(`Amount: ${amount}`);
  
  // Get quote
  console.log('\n📊 Getting quote...');
  const quoteRes = await axios.get('https://api.jup.ag/swap/v1/quote', {
    params: { inputMint, outputMint, amount, slippageBps: 100 },
    headers: { 'x-api-key': JUP_API_KEY },
    timeout: 15000,
  });
  
  const quote = quoteRes.data;
  console.log(`Out: ${parseInt(quote.outAmount) / LAMPORTS_PER_SOL} SOL`);
  console.log(`Impact: ${(parseFloat(quote.priceImpactPct) * 100).toFixed(3)}%`);
  
  // Load wallet
  const keypairData = JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8'));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(keypairData));
  console.log(`\n🔑 Wallet: ${wallet.publicKey.toString()}`);
  
  // Get swap tx
  console.log('\n📝 Building transaction...');
  const swapRes = await axios.post('https://api.jup.ag/swap/v1/swap', {
    quoteResponse: quote,
    userPublicKey: wallet.publicKey.toString(),
    wrapAndUnwrapSol: true,
    dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: 'auto',
  }, {
    headers: { 'x-api-key': JUP_API_KEY, 'Content-Type': 'application/json' },
    timeout: 15000,
  });
  
  const { swapTransaction } = swapRes.data;
  const txBuf = Buffer.from(swapTransaction, 'base64');
  const tx = VersionedTransaction.deserialize(txBuf);
  tx.sign([wallet]);
  
  // Connect and send
  const connection = new Connection(RPC, 'confirmed');
  
  console.log('\n🔍 Simulating...');
  const sim = await connection.simulateTransaction(tx);
  if (sim.value.err) {
    console.error('❌ Simulation failed:', sim.value.err);
    return;
  }
  console.log('✅ Simulation passed');
  
  console.log('\n📤 Sending...');
  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: true,
    maxRetries: 3,
  });
  
  console.log(`\n✅ TX: ${sig}`);
  console.log(`https://solscan.io/tx/${sig}`);
  
  // Confirm
  console.log('\n⏳ Confirming...');
  const conf = await connection.confirmTransaction(sig, 'confirmed');
  if (conf.value.err) {
    console.error('❌ Failed:', conf.value.err);
  } else {
    console.log('✅ CONFIRMED!');
  }
}

main().catch(e => console.error('Error:', e.message));
