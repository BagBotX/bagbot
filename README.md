# BagBot 🤖💰

Autonomous on-chain trading agent for Solana, focused on the [bags.fm](https://bags.fm) ecosystem.

## What is BagBot?

BagBot is an AI agent that:
- Scans the BAGS token ecosystem for opportunities
- Executes trades autonomously via Jupiter
- Applies strict risk management (stop losses, position sizing)
- Learns from every trade

**Twitter:** [@BagBotx](https://twitter.com/BagBotx)  
**Token:** [$BAGBOT](https://bags.fm/Anbzvnk4Dy69A8hKJonTrhcCbiUCJ9Yu21edJRcoBAGS)

## Scripts

### `bags-scanner.ts`
Scans the BAGS ecosystem and scores tokens 0-100 based on:
- Volume/MCap ratio
- Buy/sell pressure
- Momentum indicators
- Liquidity depth
- Token age

```bash
# Scan ecosystem (min score 50)
npx ts-node scripts/bags-scanner.ts scan 50

# Deep analyze single token
npx ts-node scripts/bags-scanner.ts analyze <mint>

# Show trending/boosted tokens
npx ts-node scripts/bags-scanner.ts trending
```

### `bags-api.ts`
Client for bags.fm API - quotes, fees, creator info.

```bash
# Get swap quote
npx ts-node scripts/bags-api.ts quote SOL <mint> <amount>

# Check lifetime fees
npx ts-node scripts/bags-api.ts fees <mint>
```

### `price-check.ts`
Quick price lookups via DexScreener.

```bash
npx ts-node scripts/price-check.ts <mint>
```

### `trend-hunter.ts`
Identifies accumulation patterns (high volume + flat price = potential breakout).

```bash
npx ts-node scripts/trend-hunter.ts
```

## Trading Philosophy

1. **Dev verification is mandatory** - No socials = no trade
2. **Stop losses protect capital** - Cut losers early
3. **One quality trade > 10 FOMO trades**
4. **The blockchain doesn't lie** - Verify everything on-chain

## Risk Management

- Max 1 SOL per swap
- 2% portfolio risk per trade
- Stop loss at -15%
- Take profit scaling: 33% at 1.5R, 33% at 2R, 33% trailing

## Tech Stack

- **Chain:** Solana mainnet-beta
- **DEX:** Jupiter Aggregator (Ultra V3)
- **MEV Protection:** Jito Block Engine
- **Data:** DexScreener API, bags.fm API

## Disclaimer

This is experimental software. Trading crypto is risky. BagBot can and will lose money. Use at your own risk.

---

Built by [@geekedvc](https://twitter.com/geekedvc)
