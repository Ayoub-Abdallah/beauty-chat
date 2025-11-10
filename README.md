# Hind AI Chat - Multilingual Shopping Assistant

A sophisticated multilingual shopping assistant powered by Google Gemini, designed specifically for the Algerian beauty and wellness market. The assistant handles conversations in Arabic (Darja) and French, maintains conversation context, and guides users through complete purchase flows.

## Quick Setup

### 1. Install Dependencies
```bash
npm install
# or
pnpm install
```

### 2. Configure API Key
```bash
# Copy environment template
cp .env.example .env

# Edit .env file and add your Gemini API key:
GEMINI_API_KEY=your_actual_api_key_here
```

### 3. Start the Application
```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

### 4. Access the Application
Open your browser and go to: `http://localhost:3000`

## Features

### 🇩🇿 Algerian Market Focus
- **Bilingual Support**: Automatically detects and responds in Darja (Algerian Arabic) or French
- **Local Pricing**: All product prices in Algerian Dinar (DA)
- **Cultural Adaptation**: Natural, warm communication style familiar to Algerian customers

### 💄 Expert Knowledge
- **10,000+ Products**: Comprehensive database of cosmetics, skincare, haircare, and wellness products
- **Ingredient Analysis**: Detailed composition and compatibility information
- **Personalized Recommendations**: Based on skin type, age, budget, and specific needs

### 🛍️ Sales-Oriented
- **Natural Consultation**: Feels like talking to a real beauty consultant in an Algerian pharmacy or beauty center
- **Product Matching**: Suggests 2-3 products maximum with clear explanations
- **Gentle Upselling**: Recommends complementary products when genuinely helpful

## 🌟 Key Features

### 1. **Complete Shopping Assistant**
- **Full Purchase Flow**: From product discovery to order completion
- **Real-time Inventory**: Live stock checking and reservation system
- **Order Management**: Unique order IDs, customer details, payment tracking
- **Multi-user Safe**: Handles concurrent purchases with proper stock management

### 2. **Multilingual Intelligence**
- **Arabic/Darja Support**: Natural Algerian dialect responses
- **French Integration**: Localized French for broader accessibility
- **Auto Language Detection**: Responds in user's preferred language
- **Mixed Conversations**: Seamlessly handles language switching

### 3. **Advanced Memory System**
- **Persistent Sessions**: Conversations saved across browser sessions
- **Context Awareness**: Remembers skin concerns, preferences, previous products
- **Smart Cleanup**: Automatic optimization for performance
- **Session Continuity**: Pick up conversations where you left off

### 4. **Intent-Driven Interactions**
- **Purchase Detection**: Automatically starts checkout flow for buying intent
- **Price Inquiries**: Smart price responses with availability
- **Confirmation Handling**: Recognizes confirmations in both languages
- **Cancellation Support**: Graceful handling of order cancellations

### 5. **Intelligent Product Matching**
- **100+ Product Database**: Comprehensive Algerian beauty catalog
- **Context-Based Recommendations**: Matches products to skin concerns
- **Fallback Suggestions**: Always provides alternatives when needed
- **Stock Integration**: Only recommends available products

## Sample Conversations

### In Darja (Algerian Arabic):
**User:** "عندي بشرة جافة بزاف، واش تنصحني؟"

**Consultant:** "أهلا بيك حبيبتي 🌸 البشرة الجافة محتاجة ترطيب قوي. نقترحلك كريم نيفيا سوفت بـ1500 دج، خفيف بزاف وينشرب بسرعة، ولا سيروم الأردناري بالحمض الهيالوروني بـ2300 دج يعطي نتائج من أول أسبوع. أي واحد تفضلي؟"

### In French:
**User:** "Je cherche un démaquillant doux pour mes yeux sensibles."

**Consultant:** "Bonjour chère cliente! Pour les yeux sensibles, je recommande l'eau micellaire Garnier à 1200 DA - elle démaquille tout sans frotter, ou la Bioderma Sensibio H2O à 2200 DA qui est spécialement formulée pour les peaux délicates. Les deux conviennent même aux porteuses de lentilles. Qu'est-ce qui vous intéresse le plus?"

## Technical Details

### Architecture
- **Backend**: Node.js + Express.js
- **AI Engine**: Google Gemini 2.5 Flash
- **Frontend**: Vanilla JavaScript with responsive design
- **Data**: JSON-based knowledge base with 10 sample products

### API Endpoints
- `POST /api/chat` - Main conversation endpoint
- `GET /api/knowledge` - List all products
- `POST /api/knowledge` - Add new products
- `/action/*` - Executable actions (search, summarize, add knowledge)

### Configuration
The single consultant persona is defined in `config/personas.json` with:
- Professional role and expertise
- Communication behaviors and language policies
- Market-specific focus on Algeria
- Sales-oriented approach

## Adding New Products

Add products to `data/knowledge.json`:

```json
{
  "id": "unique-product-id",
  "title": "Product Name",
  "content": "Description including benefits, usage, price in DA",
  "tags": ["french", "arabic", "تاغ عربي", "category", "priceDA"],
  "category": "skincare|haircare|makeup|wellness"
}
```

## Troubleshooting

### API Key Issues
- Ensure your Gemini API key is valid and has credits
- Check the `.env` file is properly configured
- Restart the server after changing environment variables

### Language Detection
- Arabic characters (U+0600-U+06FF) trigger Darja responses
- Latin characters trigger French responses
- Mixed input uses the dominant script

### Product Recommendations
- The system finds top 3 relevant products based on keyword matching
- Tags should include both Arabic and French terms for better search
- Price format should always include "DA" suffix

## Support

For technical issues or feature requests, check the main documentation or contact the development team.

---

**Version**: 0.2.0  
**Market**: Algeria 🇩🇿  
**Languages**: Darja + French  
**Currency**: Algerian Dinar (DA)
