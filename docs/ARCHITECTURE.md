# Architecture

## How BagBot Works

```
┌─────────────────────────────────────────────────────────────┐
│                         BagBot                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │ Scanner  │───▶│ Analyzer │───▶│ Executor │              │
│  └──────────┘    └──────────┘    └──────────┘              │
│       │               │               │                     │
│       ▼               ▼               ▼                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │DexScreen │    │ bags.fm  │    │ Jupiter  │              │
│  │   API    │    │   API    │    │   API    │              │
│  └──────────┘    └──────────┘    └──────────┘              │
│                                                              │
│  ┌──────────────────────────────────────────┐              │
│  │              Position Monitor             │              │
│  │  • Stop losses  • Take profits  • Health  │              │
│  └──────────────────────────────────────────┘              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### 1. Scanning
```
DexScreener API
    ↓
bags-scanner.ts (filter + score)
    ↓
Candidates (score >= 60)
    ↓
Dev verification (Twitter/GitHub)
    ↓
Entry decision
```

### 2. Execution
```
Decision: BUY
    ↓
jupiter-quote.ts (get quote)
    ↓
Price impact check (< 1%)
    ↓
execute-swap.ts (build tx)
    ↓
Simulate (preflight)
    ↓
Sign + Broadcast
    ↓
Confirm + Log
```

### 3. Monitoring
```
Position opened
    ↓
monitor.sh (every 2 min)
    ↓
Check P&L, ratios
    ↓
Trigger hit? → Exit
    ↓
No trigger → Continue
```

---

## Scripts Overview

### Core Loop

| Script | Frequency | Purpose |
|--------|-----------|---------|
| `bags-scanner.ts` | Every 7 min | Find opportunities |
| `monitor.sh` | Every 2 min | Check positions |
| Social engagement | Every 60 min | Community presence |

### On-Demand

| Script | When | Purpose |
|--------|------|---------|
| `execute-swap.ts` | Entry signal | Open position |
| `sell.ts` | Exit signal | Close position |
| `price-check.ts` | Ad-hoc | Quick lookup |

---

## External Services

### DexScreener API
- Token data, prices, volume
- Buy/sell counts
- Liquidity depth
- No auth required

### bags.fm API
- Creator info
- Royalty data
- Token metadata
- Requires API key

### Jupiter API
- Swap quotes
- Route optimization
- Transaction building
- MEV protection

### Jito Block Engine
- MEV-protected submission
- Bundle transactions
- Tip-based priority

---

## State Management

### In-Memory
- Current scan results
- Active positions

### On-Disk (Private)
- `memory/positions.json` — Portfolio state
- `memory/YYYY-MM-DD.md` — Daily logs
- `strategies/*.json` — Trading rules

### On-Chain (Public)
- All transactions
- Token balances
- Swap history

---

## Error Handling

### Swap Failures
1. Simulate first (catch errors before broadcast)
2. Retry with higher slippage (up to 100 bps)
3. Abort if price impact > 1%
4. Log failure, notify

### API Timeouts
1. DexScreener: Retry 3x, fallback to CoinGecko
2. Jupiter: Retry 3x, abort if persistent
3. bags.fm: Graceful degradation (skip dev check)

### Position Monitor
1. If can't fetch price: Skip cycle, log warning
2. If stop loss fails: Manual alert, retry
3. If orphaned position: Flag for review

---

## Security Model

### Protected (Never Exposed)
- Wallet keypair
- API keys
- Personal memories
- Strategy details

### Public (On-Chain/GitHub)
- Wallet address
- Transaction history
- Trading scripts
- Journal entries

### Principle
*Verify on-chain, don't trust claims.*
