# 🚀 Simple Setup Guide for AgentBuilder

This is the **simplest** way to get AgentBuilder running!

## What You Need

### ✅ Required (Only 2 things!)
1. **OpenAI API Key** - Get from [OpenAI Platform](https://platform.openai.com/api-keys)
2. **SECRET_KEY** - A random string for security

### ❌ NOT Required
- ~~Pinecone~~ (We use local FAISS vector database - no API key needed!)
- ~~Complex setup~~ (Just Docker!)

---

## Step-by-Step Setup

### 1️⃣ Get Your OpenAI API Key

1. Go to https://platform.openai.com/api-keys
2. Click "Create new secret key"
3. Copy the key (starts with `sk-...`)
4. Keep it safe!

### 2️⃣ Generate Your SECRET_KEY

**Option A: Use Python**
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

**Option B: Use This Random String**
```
abc123xyz789_ThisIsMySecretKey_ChangeMe_456def
```

### 3️⃣ Set Up Environment

```bash
cd AgentBuilder

# Copy the example file
cp .env.example .env

# Edit .env with your favorite editor
nano .env   # or: code .env  or: vim .env
```

**Edit these 2 lines:**
```env
OPENAI_API_KEY=sk-paste-your-real-key-here
SECRET_KEY=paste-your-secret-key-here
```

**Example:**
```env
OPENAI_API_KEY=sk-abc123xyz789yourrealkeyhere
SECRET_KEY=x8GH2kLp9nM3vC1qR7bN4jK0fW6tY5sZ
```

### 4️⃣ Start Everything

```bash
docker-compose up --build
```

Wait 30-60 seconds... ☕

### 5️⃣ Open Your Browser

Go to: **http://localhost:3000**

---

## ✨ That's It!

1. **Sign up** with any email/password
2. **Create an agent**
3. **Upload PDFs/documents**
4. **Start chatting!**

---

## 🎮 Using Ollama (Optional - Local LLM)

Want to use **free local models** like Llama 3.2?

### Install Ollama

**Mac/Linux:**
```bash
curl https://ollama.ai/install.sh | sh
```

**Or download from:** https://ollama.ai

### Pull a Model

```bash
ollama pull llama3.2
```

### Create Agent with Ollama

In AgentBuilder:
1. Create new agent
2. Select **"Ollama"** as provider
3. Enter model: **llama3.2**
4. Done! Your agent now uses local LLM (completely free!)

---

## 🆘 Troubleshooting

### "Cannot connect to OpenAI"
- Check your `OPENAI_API_KEY` is correct
- Make sure it starts with `sk-`
- Verify you have API credits

### "Database connection failed"
- Wait 30 seconds for PostgreSQL to start
- Try: `docker-compose restart`

### "Port already in use"
- Something is running on port 3000 or 8000
- Stop other apps or change ports in `docker-compose.yml`

---

## 🔑 Summary

**You only need:**
- ✅ OpenAI API Key (`sk-...`)
- ✅ Random SECRET_KEY string
- ✅ Docker installed

**You DON'T need:**
- ❌ Pinecone API Key
- ❌ Complicated setup
- ❌ Cloud services

**Storage:**
- 📁 Documents: Stored locally in `./backend/uploads`
- 🧠 Vectors: Stored locally in `./backend/vector_stores`
- 💾 Database: PostgreSQL in Docker

Everything runs on your computer! 🎉
