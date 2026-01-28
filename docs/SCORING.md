# Token Scoring System

The scanner assigns each token a score from 0-100 based on multiple factors.

## Scoring Breakdown

### Volume/MCap Ratio (25 points)
How actively is this token trading relative to its size?

| Ratio | Points | Meaning |
|-------|--------|---------|
| > 10x | 25 | Extremely active |
| 5-10x | 20 | Very active |
| 2-5x | 15 | Active |
| 1-2x | 10 | Moderate |
| < 1x | 5 | Low activity |

**Why it matters:** High vol/mcap means money is flowing. Low means stagnant.

---

### Buy/Sell Ratio (25 points)
Are buyers or sellers winning?

| Ratio | Points | Meaning |
|-------|--------|---------|
| > 2.0 | 25 | Strong buying |
| 1.5-2.0 | 20 | Buyers winning |
| 1.2-1.5 | 15 | Slight buy pressure |
| 0.8-1.2 | 10 | Neutral |
| < 0.8 | 5 | Sellers winning |

**Why it matters:** Buy pressure = momentum. Sell pressure = exit liquidity.

---

### Momentum (20 points)
What's the recent price action?

| Change (1h) | Points | Meaning |
|-------------|--------|---------|
| > +50% | 20 | Pumping hard |
| +20-50% | 15 | Strong up |
| +5-20% | 12 | Mild up |
| -5 to +5% | 8 | Flat |
| -5 to -20% | 5 | Dipping |
| < -20% | 2 | Dumping |

**Why it matters:** Momentum attracts attention. But beware chasing.

---

### Liquidity (15 points)
Can I exit cleanly?

| Liquidity | Points | Meaning |
|-----------|--------|---------|
| > $100K | 15 | Very liquid |
| $50-100K | 12 | Liquid |
| $20-50K | 8 | Moderate |
| $10-20K | 5 | Low |
| < $10K | 2 | Danger zone |

**Why it matters:** Low liquidity = trapped. Can't exit = lost money.

---

### Token Age (15 points)
How long has this been trading?

| Age | Points | Meaning |
|-----|--------|---------|
| 1-24h | 15 | Fresh, early |
| 24h-7d | 12 | Established |
| 7d-30d | 8 | Mature |
| > 30d | 5 | Old |
| < 1h | 10 | Too new (rug risk) |

**Why it matters:** Sweet spot is 1-24h. Early enough to catch moves, old enough to not be an obvious rug.

---

## Score Interpretation

### 80-100: Strong Opportunity
All signals aligned. If dev is verified, likely entry.

### 60-79: Worth Investigating
Good metrics but something missing. Dig deeper.

### 40-59: Caution Zone
Mixed signals. Usually pass unless compelling reason.

### 0-39: Hard Pass
Poor metrics. Don't even consider.

---

## Example Scores

### $HENRY (Day 1 Winner)
```
Vol/MCap: 7.5x    → 20 pts
Buy/Sell: 1.38    → 15 pts
Momentum: +102%   → 20 pts
Liquidity: $80K   → 12 pts
Age: 4h           → 15 pts
─────────────────────────
Total: 82/100 ✅
```
Result: +960%

### $SLASHBOT (Day 1 Loser)
```
Vol/MCap: 15x     → 25 pts
Buy/Sell: 0.6     → 5 pts  ⚠️
Momentum: +1200%  → 20 pts (but already pumped!)
Liquidity: $40K   → 8 pts
Age: 6h           → 15 pts
─────────────────────────
Total: 73/100
```
Result: -63% (chased the pump, no dev verification)

---

## The Dev Override

**A high score means nothing without dev verification.**

I've seen 90+ score tokens rug in minutes. The score tells you the market likes it. It doesn't tell you if it's a scam.

**Rule:** Score gets you interested. Dev verification gets you in.
