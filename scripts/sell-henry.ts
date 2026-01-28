import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import * as fs from 'fs';

const JUPITER_API_KEY = process.env.JUPITER_API_KEY!;
const HENRY_MINT = 'CHv6YRoDExZya65YPpTMt7RnguAqHEi9MWJvV9DHBAGS';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const AMOUNT = '330547000000000';

async function main() {
  const keypairPath = process.env.HOME + '/clawd-bagbot/wallet/bagbot-keypair.json';
  const keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf-8'))));
  const wallet = keypair.publicKey.toBase58();
  
  console.log('🔄 SELLING 50% $HENRY for SOL');
  console.log(`   Wallet: ${wallet}`);
  console.log(`   Amount: 330,547 HENRY`);
  
  console.log('\n📊 Getting quote...');
  const quoteRes = await fetch(
    `https://api.jup.ag/swap/v1/quote?inputMint=${HENRY_MINT}&outputMint=${SOL_MINT}&amount=${AMOUNT}&slippageBps=200`,
    { headers: { 'x-api-key': JUPITER_API_KEY } }
  );
  const quote = await quoteRes.json() as any;
  
  if (!quote.outAmount) {
    console.log('❌ Quote failed:', quote);
    return;
  }
  
  const solOut = parseInt(quote.outAmount) / 1e9;
  console.log(`   ✅ Output: ${solOut.toFixed(4)} SOL`);
  console.log(`   ✅ Price Impact: ${quote.priceImpactPct}%`);
  
  console.log('\n🔧 Building transaction...');
  const swapRes = await fetch('https://api.jup.ag/swap/v1/swap', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'x-api-key': JUPITER_API_KEY 
    },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: wallet,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto'
    })
  });
  
  const swapData = await swapRes.json() as any;
  if (!swapData.swapTransaction) {
    console.log('❌ Swap build failed:', swapData);
    return;
  }
  console.log('   ✅ Transaction built');
  
  console.log('\n✍️ Signing...');
  const txBuf = Buffer.from(swapData.swapTransaction, 'base64');
  const tx = VersionedTransaction.deserialize(txBuf);
  tx.sign([keypair]);
  console.log('   ✅ Signed');
  
  console.log('\n📡 Broadcasting...');
  const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: true,
    maxRetries: 3
  });
  console.log(`   ✅ Sent: ${sig}`);
  
  console.log('\n⏳ Confirming...');
  const conf = await connection.confirmTransaction(sig, 'confirmed');
  if (conf.value.err) {
    console.log('❌ Transaction failed:', conf.value.err);
    return;
  }
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('🎉 PROFIT TAKEN!');
  console.log(`   Sold: 330,547 HENRY (50%)`);
  console.log(`   Received: ~${solOut.toFixed(4)} SOL`);
  console.log(`   Tx: https://solscan.io/tx/${sig}`);
  console.log('═══════════════════════════════════════════════════════════');
}

main().catch(console.error);
