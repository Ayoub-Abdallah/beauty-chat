# 🧪 Testing Guide - Intelligent Sales System

## Quick Test Scenarios

### 1. Arabic Greeting Test
**User:** السلام عليكم  
**Expected:** Warm Arabic greeting, introduction as beauty consultant, offer to help

### 2. Product Search (Darja)
**User:** نحتاج كريم للوجه  
**Expected:** 
- Detects `product_search` intent
- Calls recommendation API
- Returns product suggestions
- Persuasive sales pitch in Darja

### 3. Price Inquiry (French)
**User:** C'est combien la crème anti-âge?  
**Expected:**
- Detects `price_inquiry` intent
- Calls API for specific product
- Returns price in French
- Upsell related products

### 4. Skincare Concern (Darja)
**User:** عندي مشكل ديال البشرة الجافة  
**Expected:**
- Detects `skincare_concern` intent
- Analyzes dry skin issue
- Recommends appropriate products
- Usage instructions in Darja

### 5. Purchase Flow (Arabic)
**Step 1 - User:** باغي نشري هذا الكريم  
**Expected:** Confirms selection, asks for name

**Step 2 - User:** اسمي فاطمة  
**Expected:** Asks for phone number

**Step 3 - User:** 0612345678  
**Expected:** 
- Confirms order
- Saves lead to database
- Provides delivery information

### 6. Stock Check (French)
**User:** Vous avez le sérum en stock?  
**Expected:**
- Checks stock via API
- Confirms availability or suggests alternatives
- Encourages immediate purchase

### 7. General Question (Darja)
**User:** شنو الفرق بين الكريم والسيروم؟  
**Expected:**
- Detects `general_question` intent
- Expert explanation in Darja
- Product recommendations

### 8. Negative Response
**User:** لا شكرا  
**Expected:**
- Detects `negative` intent
- Polite acceptance
- Leaves door open for future contact

---

## Testing via Browser

1. **Open Chat Interface:**
   ```
   http://localhost:5678/chat.html
   ```

2. **Select Persona:** "Professional Consultant"

3. **Send Test Messages:** Use scenarios above

4. **Verify:**
   - Language detection is correct
   - Responses match expected language
   - Purchase flow works smoothly
   - Conversation history persists

---

## Testing via API (curl)

### Basic Chat Test
```bash
curl -X POST http://localhost:5678/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "السلام عليكم",
    "persona": "consultant"
  }' | jq
```

### With Session ID
```bash
SESSION_ID=$(uuidgen)
curl -X POST http://localhost:5678/api/chat \
  -H "Content-Type: application/json" \
  -d "{
    \"message\": \"نحتاج كريم للوجه\",
    \"persona\": \"consultant\",
    \"sessionId\": \"$SESSION_ID\"
  }" | jq
```

### Purchase Flow Test
```bash
# Step 1: Express purchase intent
curl -X POST http://localhost:5678/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "باغي نشري هاد الكريم",
    "persona": "consultant",
    "sessionId": "test-session-123"
  }' | jq -r '.reply'

# Step 2: Provide name
curl -X POST http://localhost:5678/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "اسمي فاطمة",
    "persona": "consultant",
    "sessionId": "test-session-123"
  }' | jq -r '.reply'

# Step 3: Provide phone
curl -X POST http://localhost:5678/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "0612345678",
    "persona": "consultant",
    "sessionId": "test-session-123"
  }' | jq -r '.reply'
```

---

## Testing Lead Management

### Get All Leads
```bash
curl http://localhost:5678/api/leads | jq
```

### Get Lead Statistics
```bash
curl http://localhost:5678/api/leads/stats | jq
```

### Filter Leads by Status
```bash
curl "http://localhost:5678/api/leads?status=new" | jq
```

### Update Lead Status
```bash
curl -X PUT http://localhost:5678/api/leads/LEAD_ID/status \
  -H "Content-Type: application/json" \
  -d '{
    "status": "contacted",
    "notes": "Called customer, confirmed order"
  }' | jq
```

---

## Testing Conversation History

### Get All Conversations
```bash
curl http://localhost:5678/api/conversations | jq
```

### Get Specific Conversation
```bash
curl http://localhost:5678/api/conversations/test-session-123 | jq
```

### Get Conversation Stats
```bash
curl http://localhost:5678/api/conversations/stats | jq
```

---

## Monitoring Server Logs

### Watch Real-Time Logs
```bash
# In the terminal where server is running, watch for:
🌐 Language detected: [Arabic/French]
🎯 Intent detected: [intent_type]
🤖 Attempting Gemini API call...
✅ Gemini API call successful
💾 Lead saved: [name]
```

### Expected Log Patterns

**Successful Request:**
```
🌐 Language detected: Arabic
🎯 Intent detected: product_search
📞 Calling recommendation API...
✅ Got 5 product recommendations
🤖 Attempting Gemini API call [Attempt 1/4, Model: gemini-2.5-flash]...
✅ Gemini API call successful with model: gemini-2.5-flash
```

**Purchase Flow:**
```
🌐 Language detected: Arabic
🎯 Intent detected: purchase
💳 Entering purchase flow: awaiting_name
💾 Lead saved: Fatima | 0612345678
```

---

## Validation Checklist

### Core Functionality
- [ ] Server starts without errors
- [ ] Chat endpoint responds
- [ ] Intent detection works for all 7 types
- [ ] Language detection accurate for AR/FR
- [ ] Gemini API calls succeed
- [ ] Responses are bilingual as appropriate

### Purchase Flow
- [ ] Purchase intent triggers name request
- [ ] Name collection triggers phone request
- [ ] Phone collection saves lead
- [ ] Lead appears in `/api/leads`
- [ ] Session state persists correctly
- [ ] Confirmation message sent

### API Integration
- [ ] Recommendation API called for product_search
- [ ] Stock check API works
- [ ] API errors handled gracefully
- [ ] Fallback responses work when API down

### Data Persistence
- [ ] Conversations saved to conversations.json
- [ ] Leads saved to leads.json
- [ ] Data persists across server restart
- [ ] Old conversations cleaned up properly

### Error Handling
- [ ] Missing message returns 400 error
- [ ] Invalid session handled gracefully
- [ ] API timeout handled with fallback
- [ ] Malformed JSON handled

### Performance
- [ ] Response time < 5 seconds
- [ ] Memory usage stable
- [ ] No memory leaks over multiple requests
- [ ] Cleanup runs periodically

---

## Expected Response Structure

```json
{
  "reply": "وعليكم السلام! 🌸\n\nكيف نقدر نساعدك اليوم؟...",
  "conversationLength": 2,
  "sessionId": "550e8400-e29b-41d0-a716-446655440000",
  "language": "Arabic",
  "intent": "greeting",
  "products": 0,
  "memoryStatus": "1 exchanges remembered",
  "apiCalled": false
}
```

---

## Troubleshooting

### Server Won't Start
```bash
# Check if port is in use
lsof -i :5678

# Kill existing process
pkill -f "node server.js"

# Restart
node server.js
```

### API Returns Empty Response
- Check `.env` file has `GOOGLE_API_KEY`
- Verify Gemini API quota not exceeded
- Check server logs for errors

### Recommendations Not Working
- Verify `RECOMMENDATION_URL` in `.env`
- Test recommendation service separately
- Check network connectivity

### Leads Not Saving
- Check `data/leads.json` file permissions
- Verify JSON is not corrupted
- Check server logs for write errors

---

## Success Criteria

✅ All test scenarios pass  
✅ Purchase flow completes successfully  
✅ Leads saved to database  
✅ Bilingual responses correct  
✅ API integrations work  
✅ No console errors  
✅ Response times acceptable  
✅ Memory usage stable  

---

**Ready to test!** 🚀

Start with the browser interface at: http://localhost:5678/chat.html
