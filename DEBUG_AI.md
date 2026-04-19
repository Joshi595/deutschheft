# AI Debugging Guide

## Quick Test: Check Browser Console

**Important:** Browser console will show what's happening!

### Step 1: Open Browser Console
Press **F12** or **Ctrl+Shift+I** and click **Console** tab

### Step 2: Go to Chapter 1
Open: [german-a2/chapters/chapter1.html](german-a2/chapters/chapter1.html)

### Step 3: Look for these messages in Console:

✅ **Good messages** (means AI is active):
```
API Key status: Found ✅
API Key starts with: gsk_VG3Zq...
groqValidator status: Initialized ✅
Calling Groq API...
```

❌ **Bad messages** (means AI is NOT active):
```
API Key status: Not found ❌
groqValidator status: Not initialized ❌
```

---

## What Each Message Means:

### 1. API Key not found
- **Solution:** Run setup.html first!
- [Open setup.html](../german-a2/setup.html)
- Click "Start Learning" 
- Make sure page says ✅ "AI Setup Complete!"

### 2. groqValidator not initialized
- **Solution:** Same as above - run setup.html

### 3. "Calling Groq API..." but then error
- Might be CORS issue (API might not work from browser)
- Might be network issue
- **Try:** Refresh page and try again

---

## Test the AI:

1. **After setup**, go to Chapter 1
2. Open Console (F12)
3. Find **Exercise 2: Fill in the Blanks**
4. Type: `"ich bin"` (when answer is `"bin"`)
5. Click **Check Answer**
6. Look in Console for:
   - ⏳ "Checking your answer..."
   - Then either:
     - ✅ "Calling Groq API..." (AI is working!)
     - ❌ Error message (API issue)

---

## If API is Not Working:

The Groq API might have CORS restrictions from browsers. We might need to create a **backend** server to forward requests.

**Quick workaround for now:**
- Use basic validation (still works, just exact matching)
- Or contact support to enable CORS

---

## Test in Console:

```javascript
// Check if setup worked
console.log('API Key:', localStorage.getItem('groqApiKey') ? 'Stored ✅' : 'Missing ❌');

// Check if validator is initialized
console.log('Validator:', typeof groqValidator);
```

Run these in Console and share what it shows!
