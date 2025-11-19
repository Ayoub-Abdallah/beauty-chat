# 🚀 Quick Setup Guide - Fix "Mode écho" Issue

## ⚠️ Problem: Getting "[Mode écho avec contexte]" Message?

This means the Gemini AI is **not working** because the API key is missing or invalid.

---

## ✅ Solution (3 Steps):

### **Step 1: Get Your Free Gemini API Key**

1. Go to: **https://aistudio.google.com/app/apikey**
2. Sign in with your Google account
3. Click **"Create API Key"** or **"Get API Key"**
4. Copy the key (starts with `AIzaSy...`)

---

### **Step 2: Add the Key to Your `.env` File**

Open the `.env` file in your project and add:

```bash
GEMINI_API_KEY=AIzaSy...your_actual_key_here
GEMINI_MODEL=gemini-2.0-flash-exp
PORT=5678
NODE_ENV=development
```

**Important:** Replace `AIzaSy...your_actual_key_here` with your real API key!

---

### **Step 3: Restart the Server**

```bash
# Stop the server (Ctrl+C if running)
# Then restart:
npm start

# Or for development mode:
npm run dev
```

---

## ✅ Verification

After restarting, you should see:
- ✓ **Real AI responses** instead of echo messages
- ✓ **Personalized recommendations** in Arabic/French
- ✓ **Product suggestions** with prices in DA

---

## 🔍 Still Getting Echo Messages?

Check the terminal output for errors:

### Common Issues:

1. **Invalid API Key**
   ```
   Error: API key not valid. Please pass a valid API key.
   ```
   → Get a new key from https://aistudio.google.com/app/apikey

2. **API Key Not Set**
   ```
   Error: GEMINI_API_KEY not set
   ```
   → Make sure you saved the `.env` file with the key

3. **Wrong Model Name**
   ```
   Error: models/gemini-2.5-flash is not found
   ```
   → Use `gemini-2.0-flash-exp` or `gemini-pro` instead

4. **Rate Limit Exceeded**
   ```
   Error: Resource has been exhausted
   ```
   → Wait a few minutes or upgrade your API quota

---

## 🧪 Test the Setup

Try sending a message like:
- **Arabic**: `عندي بشرة جافة، شنو تنصحني؟`
- **French**: `J'ai la peau sèche, que me conseillez-vous?`

You should get a **real AI response** with product recommendations!

---

## 📞 Need Help?

- **Gemini API Documentation**: https://ai.google.dev/docs
- **Get API Key**: https://aistudio.google.com/app/apikey
- **Check Server Logs**: Look at the terminal where you ran `npm start`

---

**Last Updated**: November 18, 2025
