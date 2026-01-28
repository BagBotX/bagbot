#!/usr/bin/env ts-node
/**
 * BagBot Jupiter Quote
 * Gets swap quotes from Jupiter Ultra API
 */

import axios from 'axios';

const JUPITER_API = 'https://api.jup.ag/ultra/v1';

// Common tokens
const TOKENS: Record<string, string> = {
  'SOL': 'So11111111111111111111111111111111111111112',
  'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'BONK': 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  'WIF': 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  'JUP': 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
};

interface QuoteParams {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps?: number;
}

async function getQuote(params: QuoteParams) {
  const { inputMint, outputMint, amount, slippageBps = 50 } = params;
  
  try {
    const res = await axios.get(`${JUPITER_API}/quote`, {
      params: {
        inputMint,
        outputMint,
        amount: amount.toString(),
        slippageBps,
      },
      timeout: 15000,
    });
    return res.data;
  } catch (e: any) {
    if (e.response) {
      console.error('Jupiter API error:', e.response.data);
    } else {
      console.error('Request error:', e.message);
    }
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.log('Usage: jupiter-quote.ts <from> <to> <amount>');
    console.log('Example: jupiter-quote.ts SOL USDC 1000000000  (1 SOL in lamports)');
    console.log('\nAvailable tokens:', Object.keys(TOKENS).join(', '));
    return;
  }
  
  const [fromSymbol, toSymbol, amountStr] = args;
  const inputMint = TOKENS[fromSymbol.toUpperCase()] || fromSymbol;
  const outputMint = TOKENS[toSymbol.toUpperCase()] || toSymbol;
  const amount = parseInt(amountStr);
  
  console.log(`\n=== Jupiter Quote ===`);
  console.log(`From: ${fromSymbol} (${inputMint.slice(0, 8)}...)`);
  console.log(`To: ${toSymbol} (${outputMint.slice(0, 8)}...)`);
  console.log(`Amount: ${amount}`);
  console.log('');
  
  const quote = await getQuote({ inputMint, outputMint, amount });
  
  if (quote) {
    console.log('--- Quote Result ---');
    console.log(`Input: ${quote.inAmount}`);
    console.log(`Output: ${quote.outAmount}`);
    console.log(`Price Impact: ${quote.priceImpactPct || 'N/A'}%`);
    console.log(`Route: ${quote.routePlan?.map((r: any) => r.swapInfo?.label).join(' → ') || 'direct'}`);
    console.log('\nFull response:');
    console.log(JSON.stringify(quote, null, 2));
  } else {
    console.log('Failed to get quote');
  }
}

main().catch(console.error);
