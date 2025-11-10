# Test Scenarios for Multilingual Shopping Assistant

## 1. Basic Product Inquiry (Arabic)
**User Input**: "عندي بشرة دهنية"
**Expected Response**: 
- Detects Arabic language
- Recommends products for oily skin
- Includes specific product names and DA prices
- Ends with follow-up question

**Validation**: Check that response includes products from knowledge.json with oily skin tags

## 2. Price Inquiry Follow-up
**User Input 1**: "je cherche une crème hydratante"
**User Input 2**: "كم السعر" 
**Expected Response**:
- First response recommends moisturizers in French
- Second response remembers context and provides prices for previously mentioned products

**Validation**: Verify conversation memory works and price extraction is accurate

## 3. Complete Purchase Flow
**User Input 1**: "je veux acheter Acide Salicylique"
**Expected Flow**:
1. Product identification → "Lotion BHA Acide Salicylique 2% — 2300 DA, en stock (5). Voulez-vous l'acheter ?"
2. User: "oui" → "Combien d'unités souhaitez-vous ?"
3. User: "2" → Check stock, reserve items → "Adresse de livraison et numéro de téléphone ?"
4. User: "Hai Salam, Alger - 0555123456" → "Mode de paiement ? 1) Paiement à la livraison 2) Virement bancaire"
5. User: "1" → Order summary with total calculation
6. User: "oui" → Order confirmation with order ID

**Validation**: 
- Check inventory.json for stock reservation and confirmation
- Verify order creation in orders.json
- Confirm proper price calculation with shipping

## 4. Stock Limitation Handling
**User Input**: "نحب نشري 10 قطع من The Ordinary Niacinamide" (when only 5 available)
**Expected Response**:
- Arabic response indicating limited stock
- Suggests available quantity
- Asks for revised quantity

**Validation**: Proper stock checking and alternative suggestion

## 5. Ambiguous Product Search
**User Input**: "crème pour le visage"
**Expected Response**:
- Multiple product matches
- Lists 2-3 options with prices
- Asks user to choose specific product

**Validation**: Product search returns multiple relevant results

## 6. Language Switching Mid-Conversation
**User Input 1**: "Bonjour, je cherche un sérum"
**User Input 2**: "كم السعر تاع هذا المنتج"
**Expected Behavior**:
- First response in French with serum recommendations
- Second response in Arabic with remembered serum prices

**Validation**: Language detection works per message, context maintained

## 7. Order Cancellation
**User in Purchase Flow**: "ألغي الطلب" or "annule"
**Expected Response**:
- Cancellation confirmation in appropriate language
- Stock reservation released
- Shopping state reset to browsing

**Validation**: Check inventory.json for released reservations

## 8. Echo/Test Mode Prevention
**Scenario**: Gemini returns "Mode écho avec contexte" or similar fallback
**Expected Behavior**:
- System detects problematic response
- Automatically retries with enhanced prompt
- Provides meaningful response on retry

**Validation**: No echoing responses reach the user

## 9. Memory Persistence Across Sessions
**Steps**:
1. Start conversation, discuss products
2. Close browser/clear page
3. Return with same sessionId
**Expected**: Previous conversation context maintained

**Validation**: Check conversations.json persistence

## 10. Concurrent User Handling
**Scenario**: Two users try to buy the last item simultaneously
**Expected**:
- First user can reserve the item
- Second user gets "out of stock" message with alternatives
- No overselling occurs

**Validation**: Inventory remains consistent, no negative stock

## API Testing Commands

```bash
# Test product search endpoint
curl -X GET "http://localhost:3000/api/chat/test-products?query=niacinamide"

# Test basic conversation
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "عندي بشرة دهنية", "sessionId": "test-session-1"}'

# Test purchase intent
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "je veux acheter The Ordinary Niacinamide", "sessionId": "test-session-2"}'

# Test price inquiry
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "كم السعر", "sessionId": "test-session-1"}'
```

## Expected Response Structure

```json
{
  "reply": "Assistant response text",
  "sessionId": "unique-session-id",
  "conversationLength": 4,
  "memoryStatus": "2 exchanges remembered", 
  "purchaseState": "browsing|product_identified|quantity_requested|...",
  "shoppingCart": {
    "product": "Product Name",
    "quantity": 1,
    "state": "product_identified"
  },
  "debug": {
    "searchQuery": "search terms used",
    "foundProducts": 3,
    "productNames": ["Product 1", "Product 2"],
    "intent": "purchase|price_inquiry|browse|confirmation",
    "language": "ar|fr",
    "hasProductMention": true,
    "purchaseFlow": true
  }
}
```

## Files to Monitor During Testing

1. **data/conversations.json** - Check session persistence and message history
2. **data/inventory.json** - Verify stock levels and reservations
3. **data/orders.json** - Confirm order creation and details
4. **Console logs** - Debug information and error tracking

## Performance Checks

- **Response Time**: < 3 seconds for normal queries
- **Memory Usage**: Conversation history trimming works properly
- **Concurrent Handling**: No race conditions in inventory management
- **Error Recovery**: Graceful handling of API failures with fallbacks

## User Experience Validation

- **Natural Flow**: No repetitive or robotic responses
- **Cultural Appropriateness**: Proper Algerian dialect and French localization
- **Purchase Clarity**: Clear step-by-step guidance through checkout
- **Price Transparency**: Always show prices in DA with availability
- **Help Accessibility**: Easy to get product information and recommendations
