#!/bin/bash
# BagBot Price Monitor
# Logs prices to jsonl file every interval

INTERVAL=${1:-60}  # Default 60 seconds
LOG_FILE="$HOME/clawd-bagbot/market-data/prices.jsonl"

echo "BagBot Monitor started (interval: ${INTERVAL}s)"
echo "Logging to: $LOG_FILE"

while true; do
    # Get SOL price from DexScreener
    PRICE_DATA=$(curl -s "https://api.dexscreener.com/tokens/v1/solana/So11111111111111111111111111111111111111112" 2>/dev/null | head -c 2000)
    
    if [ -n "$PRICE_DATA" ]; then
        TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
        PRICE=$(echo "$PRICE_DATA" | grep -o '"priceUsd":"[^"]*"' | head -1 | cut -d'"' -f4)
        
        if [ -n "$PRICE" ]; then
            echo "{\"ts\":\"$TIMESTAMP\",\"token\":\"SOL\",\"price\":$PRICE}" >> "$LOG_FILE"
            echo "[$TIMESTAMP] SOL: \$$PRICE"
        fi
    fi
    
    sleep "$INTERVAL"
done
