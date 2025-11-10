# 🌸 Hind Beauty Consultant - Setup Guide

## Overview
AI Beauty & Health Consultant specialized for the Algerian market. Expert in cosmetics, skincare, and wellness products with local pricing in Algerian Dinar (DA).

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
