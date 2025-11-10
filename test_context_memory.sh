#!/bin/bash

SESSION="memory_test_$(date +%s)"
API_URL="http://localhost:3000/api/chat"

echo "=== Testing Enhanced Context Memory ==="
echo "Session ID: $SESSION"
echo ""

# Function to send message and extract reply
send_message() {
    local message="$1"
    local step="$2"
    echo "Step $step: User says: '$message'"
    
    local response=$(curl -s -X POST "$API_URL" \
        -H "Content-Type: application/json" \
        -d "{\"message\": \"$message\", \"sessionId\": \"$SESSION\"}")
    
    local reply=$(echo "$response" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data['reply'])
except:
    print('Error parsing response')
")
    
    echo "         Bot replies: $reply"
    echo ""
    sleep 1
}

# Test conversation flow
send_message "salam" "1"
send_message "bachara hassasa" "2"  
send_message "wach tnshini" "3"
send_message "kif halek" "4"

echo "=== Context Memory Test Complete ==="
