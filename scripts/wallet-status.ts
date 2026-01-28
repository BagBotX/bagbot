#!/usr/bin/env ts-node
/**
 * BagBot Wallet Status
 * Checks wallet balance and token holdings
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

const WALLET = 'bL7yksLLAUZDhSXvxhMEVpruqhUNn8T8C4jWzdnVChm';
const RPC = 'https://api.mainnet-beta.solana.com';

async function main() {
  const connection = new Connection(RPC, 'confirmed');
  const pubkey = new PublicKey(WALLET);
  
  console.log('=== BagBot Wallet Status ===\n');
  console.log(`Address: ${WALLET}`);
  console.log(`Network: mainnet-beta\n`);
  
  // Get SOL balance
  const balance = await connection.getBalance(pubkey);
  const solBalance = balance / LAMPORTS_PER_SOL;
  console.log(`SOL Balance: ${solBalance.toFixed(6)} SOL`);
  
  // Get token accounts
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
    programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
  });
  
  if (tokenAccounts.value.length > 0) {
    console.log('\n--- Token Holdings ---');
    for (const account of tokenAccounts.value) {
      const info = account.account.data.parsed.info;
      const amount = info.tokenAmount.uiAmount;
      if (amount > 0) {
        console.log(`${info.mint.slice(0, 8)}...: ${amount}`);
      }
    }
  } else {
    console.log('\nNo token holdings');
  }
  
  // Get recent transactions
  const sigs = await connection.getSignaturesForAddress(pubkey, { limit: 5 });
  if (sigs.length > 0) {
    console.log('\n--- Recent Transactions ---');
    for (const sig of sigs) {
      const status = sig.err ? '❌' : '✅';
      const time = sig.blockTime ? new Date(sig.blockTime * 1000).toISOString() : 'unknown';
      console.log(`${status} ${sig.signature.slice(0, 20)}... (${time})`);
    }
  } else {
    console.log('\nNo recent transactions');
  }
}

main().catch(console.error);
