import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import fs from 'fs';

const HENRY_MINT = 'CHv6YRoDExZya65YPpTMt7RnguAqHEi9MWJvV9DHBAGS';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const RPC = 'https://api.mainnet-beta.solana.com';

// Load wallet
const keypairPath = '/Users/bagbot/clawd-bagbot/wallet/bagbot-keypair.json';
const keypairData = JSON.parse(fs.readFileSync(keypairPath));
const wallet = Keypair.fromSecretKey(Uint8Array.from(keypairData));
console.log('Wallet:', wallet.publicKey.toString());

// Sell 50% = 330,547 tokens (HENRY has 6 decimals based on typical BAGS tokens)
const DECIMALS = 6;
const sellAmount = 330547 * Math.pow(10, DECIMALS);
console.log(`Selling 330,547 HENRY (${sellAmount} raw)`);

// Get quote
const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${HENRY_MINT}&outputMint=${SOL_MINT}&amount=${sellAmount}&slippageBps=100`;
console.log('Getting quote...');

const quoteRes = await fetch(quoteUrl);
const quote = await quoteRes.json();

if (quote.error) {
  console.error('Quote error:', quote.error);
  process.exit(1);
}

console.log('Quote received:');
console.log('  Output:', (quote.outAmount / 1e9).toFixed(4), 'SOL');
console.log('  Price Impact:', quote.priceImpactPct || 'N/A');

// Get swap transaction
console.log('Building swap transaction...');
const swapRes = await fetch('https://quote-api.jup.ag/v6/swap', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    quoteResponse: quote,
    userPublicKey: wallet.publicKey.toString(),
    wrapAndUnwrapSol: true,
    dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: 'auto'
  })
});

const swapData = await swapRes.json();
if (swapData.error) {
  console.error('Swap error:', swapData.error);
  process.exit(1);
}

// Deserialize and sign
const connection = new Connection(RPC, 'confirmed');
const txBuf = Buffer.from(swapData.swapTransaction, 'base64');
const tx = VersionedTransaction.deserialize(txBuf);
tx.sign([wallet]);

// Simulate first
console.log('Simulating...');
const sim = await connection.simulateTransaction(tx);
if (sim.value.err) {
  console.error('Simulation failed:', JSON.stringify(sim.value.err));
  process.exit(1);
}
console.log('Simulation passed ✓');

// Send
console.log('Sending transaction...');
const sig = await connection.sendRawTransaction(tx.serialize(), {
  skipPreflight: true,
  maxRetries: 3
});
console.log('Signature:', sig);

// Confirm
console.log('Confirming...');
const confirm = await connection.confirmTransaction(sig, 'confirmed');
if (confirm.value.err) {
  console.error('Transaction failed:', confirm.value.err);
  process.exit(1);
}

console.log('✅ TAKE PROFIT EXECUTED');
console.log('TX:', `https://solscan.io/tx/${sig}`);
