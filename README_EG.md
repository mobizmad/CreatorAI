# AgentBuilder

**Build, train, and refine custom LLM agents with no code.**

AgentBuilder is a platform that empowers non-technical users to create their own custom AI agents powered by LLMs. Upload your knowledge base, chat with your agent, improve it through corrections, integrate it into any external system via API, and now enjoy **conversation memory** so agents remember context across messages.

<img src="https://github.com/user-attachments/assets/0d0fc5d0-f46b-4c08-b2ae-4f3df2821cf8" alt="Aung's Avatar" width="100" height="100"/>

## Features

### Core Capabilities

- **No-Code Agent Creation**: Create custom AI agents in minutes without writing any code
- **Knowledge Base Management**: Upload PDF, TXT, and CSV files to train your agents
- **RAG (Retrieval Augmented Generation)**: Agents automatically retrieve relevant information from your knowledge base
- **Correction & Feedback Loop**: When your agent makes a mistake, correct it and the agent learns from your feedback
- **Few-Shot Learning**: Corrections are stored as "golden examples" and automatically injected into future prompts
- **Multi-LLM Support**: Use OpenAI models or run local models with Ollama (Llama 3.2, etc.)
- **Agent Playground**: Interactive chat interface to test and refine your agents
- **Source Attribution**: See which documents your agent used to generate responses
- **API Generator**: Generate API keys to integrate your agents into any external system
- **Conversation Memory**: Agents remember context across messages (Web UI)
- **Public API Memory**: Maintain conversation context in external applications via session IDs 
- **Chat Rating System**: Users can rate agent responses with a thumbs up (👍) or thumbs down (👎) to easily flag poor answers for correction.
- **Custom Fine-Tuning**: Train your agents on your specific datasets using OpenAI's Fine-Tuning API to improve tone, style, and accuracy.
- **A/B Testing Playground**: Compare your fine-tuned model and the factory model side-by-side to test and compare response quality.
- **Analytics Dashboard**: Visualize agent performance, track API usage, and discover the most frequently asked questions.
- **API Rate Limiting**: Production-ready token bucket rate limiting with predefined pricing tiers (Free, Basic, Pro) to protect your infrastructure.


### Technical Stack

**Backend:**
- Python 3.11+ with FastAPI (Fixed bcrypt==3.2.2 and passlib compatibility).
- LangChain & LangGraph for agent orchestration
- OpenAI Fine-Tuning integration for model training.
- PostgreSQL for data storage
- FAISS for local vector embeddings (no external API needed!)
- SQLAlchemy ORM

**Frontend:**
- Next.js 14 with React 18
- TypeScript
- A/B Comparison Dashboard with dual-chat synchronization.
- Tailwind CSS

**LLM Providers:**
- OpenAI API (GPT-4, GPT-3.5)
- Ollama (Llama 3.2, and other local models)
- Extensible for custom providers

---

## Quick Start

### Prerequisites

- **Docker & Docker Compose** (recommended)
- **OpenAI API Key** (for OpenAI models)
- **Ollama** (optional, for free local LLM)

### Docker Compose (Recommended)

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/agentbuilder.git
   cd agentbuilder
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` - you only need 2 things:
   ```env
   OPENAI_API_KEY=sk-your-openai-key-here
   SECRET_KEY=your-strong-random-secret-key
   ```

3. **Start the services**
   ```bash
   docker-compose up --build
   ```

4. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Documentation: http://localhost:8000/docs

---

## Usage Guide

### 1. Create an Account

1. Open http://localhost:3000
2. Click "Sign Up"
3. Enter your email and password

### 2. Create Your First Agent

1. Click "Create Agent"
2. Fill in the details:
   - **Name**: Give your agent a descriptive name
   - **Description**: What does your agent do?
   - **LLM Provider**: Choose OpenAI or Ollama
   - **Model**: e.g., `gpt-4` or `llama3.2`
   - **Temperature**: 0.0 (precise) to 1.0 (creative)
3. Click "Create Agent"

### 3. Upload Knowledge Base

1. Click on your agent → "Knowledge Base" tab
2. Drag & drop or click to upload files (PDF, TXT, CSV)
3. Files are automatically chunked and embedded using FAISS (stored locally!)

### 4. Chat with Your Agent

1. Go to "Chat" tab
2. Ask questions about your knowledge base
3. The agent retrieves relevant information and shows sources

### 5. Use Conversation Memory

The agent remembers context within each conversation session:

1. Memory is **on by default** — look for the 🧠 brain toggle in the chat sidebar
2. Start chatting — the agent remembers everything said earlier in the session
3. Click **"+"** to start a fresh conversation (new session = blank memory)
4. Past conversations appear in the sidebar and can be reloaded at any time
5. Toggle memory **off** if you want each message treated independently

**Example:**
```
You:   "My name is Alex"
Agent: "Hello Alex! How can I help you?"
You:   "What is my name?"
Agent: "Your name is Alex."   ✅ Memory working!
```

### 6. Rate, Correct & Improve

When your agent provides an answer:
1. Use the **Thumbs Up (👍)** or **Thumbs Down (👎)** buttons to rate the quality of the response.
2. If the agent makes a mistake (or receives a downvote), click "Correct this response".
3. Provide the correct answer.
4. The correction is saved as a "golden example" for future responses.

### 7. Integrate via API

1. In your agent's playground, click **"API Integration"** button
2. Go to **"API Keys"** tab → click "Create API Key"
3. Save your key (shown only once!)
4. Use it to integrate your agent into any external system

### 8. Fine-Tuning & A/B Testing Workflow   

Improve your agent's performance by training it on your specific "Golden Examples":

1. **Prepare Training Data**: Collect corrections and high-quality responses in the "Corrections" tab.
2. **Start Fine-Tuning**: Navigate to the "Fine-Tuning" tab and trigger a training job using your collected examples.
3. **Evaluate with A/B Testing**:
    - Open the **A/B Testing** tab.
    - Send a test message; the interface will query both the **Factory Default** model and your **Fine-Tuned** Agent simultaneously.
    - Compare responses side-by-side to ensure your fine-tuned model meets your quality standards before deployment.

---

## Conversation Memory

### How It Works

Each time a user opens a chat, a **session** is created. All messages in that session are linked together. When the agent responds, it loads the last N messages from the session and passes them to the LLM as conversation history — so the LLM has full context.

```
User sends message
       ↓
Load last 10 messages from session (memory window)
       ↓
Build: [system prompt, past msgs..., current message]
       ↓
LLM generates response with full context
       ↓
Save message + update session
```

### Memory Settings (per agent)

Two fields on the Agent model control memory behavior:

| Field | Default | Description |
|-------|---------|-------------|
| `memory_enabled` | `true` | Turn memory on/off for this agent |
| `memory_window` | `10` | How many past message pairs to include |

### Session API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/agents/{id}/chat/sessions` | Create new session |
| GET | `/agents/{id}/chat/sessions` | List all sessions |
| GET | `/agents/{id}/chat/sessions/{session_id}/messages` | Load session messages |
| DELETE | `/agents/{id}/chat/sessions/{session_id}` | Delete session |

### Chat with Memory (Internal API)

Pass `session_id` to enable memory. If omitted, a new session is created automatically:

```bash
# First message — no session_id needed, one is created and returned
curl -X POST http://localhost:8000/agents/AGENT_ID/chat \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "My name is Alex"}'

# Response includes session_id:
# {"response": "Hello Alex!", "session_id": "abc-123", "sources": [...]}

# Follow-up — pass session_id to continue with memory
curl -X POST http://localhost:8000/agents/AGENT_ID/chat \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "What is my name?", "session_id": "abc-123"}'
```
**Rate Message (Internal)**
```bash
curl -X POST http://localhost:8000/agents/AGENT_ID/chat/MESSAGE_ID/rate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rating": -1}'  # Use 1 for thumbs up, -1 for thumbs down, 0 to clear
```



---

## API Integration

### Generate an API Key

1. Navigate to your agent's playground
2. Click **"API Integration"** in the header
3. Click **"Create API Key"**
4. Name your key (e.g., "Production") and optionally set expiration
5. **Copy and save the key immediately** - it won't be shown again!

### Use the Public API

All public API requests require your API key in the header:
```
X-API-Key: ab_your_api_key_here
```

The API supports **Conversation Memory**. You can maintain a continuous chat session by passing a `session_id`.

#### 1. Stateless Chat (One-off)
If you don't pass a `session_id`, a new session is created automatically. The response will include a `session_id` that you can save for later.

```bash
curl -X POST "http://localhost:8000/v1/agents/YOUR_AGENT_ID/chat" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ab_YOUR_API_KEY" \
  -d '{"message": "My name is Alice"}'
```

## Response: ## 

```jason
{
  "response": "Hello Alice! How can I help you?",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "agent_name": "Support Bot",
  "usage_remaining": 99
}
```

### 2. Stateful Chat (With Memory)

To continue the conversation, pass the `session_id` received from the previous response.

```bash
curl -X POST "http://localhost:8000/v1/agents/YOUR_AGENT_ID/chat" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ab_YOUR_API_KEY" \
  -d '{
    "message": "What is my name?",
    "session_id": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

## Response: ##

```jason
{
  "response": "Your name is Alice.",
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Python example:**
```python
import requests

url = "http://localhost:8000/v1/agents/YOUR_AGENT_ID/chat"
headers = {
    "X-API-Key": "ab_YOUR_KEY",
    "Content-Type": "application/json"
}

# 1. First message - no session_id
response1 = requests.post(url, headers=headers, json={
    "message": "My name is Alice"
})
data1 = response1.json()
session_id = data1["session_id"]  # Save this!

print(f"Agent: {data1['response']}")

# 2. Follow-up with memory
response2 = requests.post(url, headers=headers, json={
    "message": "What is my name?",
    "session_id": session_id  # Pass it back
})
data2 = response2.json()

print(f"Agent: {data2['response']}") # Output: "Your name is Alice"
```

**JavaScript example:**
```javascript
const url = "http://localhost:8000/v1/agents/YOUR_AGENT_ID/chat";
const headers = {
  "Content-Type": "application/json",
  "X-API-Key": "ab_YOUR_KEY"
};

// 1. Start conversation
const res1 = await fetch(url, {
  method: "POST",
  headers,
  body: JSON.stringify({ message: "My name is Alice" })
});
const data1 = await res1.json();
const sessionId = data1.session_id; // Save this!

// 2. Continue conversation
const res2 = await fetch(url, {
  method: "POST",
  headers,
  body: JSON.stringify({ 
    message: "What is my name?", 
    session_id: sessionId 
  })
});
const data2 = await res2.json();
console.log(data2.response); // "Your name is Alice"
```

### Public API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/agents/{agent_id}/chat` | Chat with agent |
| GET | `/v1/agents/{agent_id}/info` | Get agent info |
| GET | `/v1/usage` | Get current API key usage stats & rate limits |
| GET | `/v1/health` | API health check |

### API Key Management Endpoints (Requires User Auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/agents/{agent_id}/api-keys` | Create new API key |
| GET | `/agents/{agent_id}/api-keys` | List all API keys |
| DELETE | `/agents/{agent_id}/api-keys/{key_id}` | Revoke API key |
| PATCH | `/agents/{agent_id}/api-keys/{key_id}/toggle` | Enable/disable key |

---

## Internal API Documentation

### Authentication

All internal endpoints (except `/auth/register` and `/auth/login`) require a user JWT token.

**Register**
```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password123"}'
```

**Login**
```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password123"}'
```

**Create Agent**
```bash
curl -X POST http://localhost:8000/agents \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Agent",
    "llm_provider": "openai",
    "llm_model": "gpt-4",
    "temperature": 0.7
  }'
```

**Upload Knowledge**
```bash
curl -X POST http://localhost:8000/agents/AGENT_ID/knowledge \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@document.pdf"
```

**Chat (Internal)**
```bash
curl -X POST http://localhost:8000/agents/AGENT_ID/chat \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "What is the company policy?", "session_id": "optional-session-id"}'
```

Full API docs available at: http://localhost:8000/docs

---

## Architecture

### System Overview

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Frontend  │─────▶│   Backend    │─────▶│  PostgreSQL │
│  (Next.js)  │      │   (FastAPI)  │      │             │
└─────────────┘      └──────────────┘      └─────────────┘
                            │
                            ├─────▶ FAISS (Local Vector DB)
                            ├─────▶ OpenAI API
                            └─────▶ Ollama (Local LLM)

External Apps
      │ (X-API-Key)
      ▼
Public API (/v1/...)
      │
      ▼
Agent Executor
```

### Agent Execution Flow

```
1. User Query (via UI or API)
   ↓
2. Load Conversation History (Memory)   ← NEW
   ↓
3. Retrieve Relevant Chunks (FAISS RAG)
   ↓
4. Load Corrections (Few-Shot)
   ↓
5. Build Message Array with History
   ↓
6. Generate Response (LLM)
   ↓
7. Save to Session + Return Response
```

### Database Schema

- `users` - User accounts
- `agents` - Agent configurations (includes `memory_enabled`, `memory_window`)
- `knowledge_bases` - Uploaded files metadata
- `corrections` - Few-shot examples
- `conversation_sessions` - Groups messages into sessions for memory
- `chat_logs` - Individual messages (linked to session, includes user 👍/👎 ratings)
- `agent_api_keys` - API keys for external integrations (includes `rate_limit_tier` and `usage_count`)

---

## Configuration

### Environment Variables

**Backend (`backend/.env`)**
```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentbuilder

# JWT
SECRET_KEY=your-secret-key
ACCESS_TOKEN_EXPIRE_MINUTES=10080

# OpenAI
OPENAI_API_KEY=sk-your-key

# Ollama (optional)
OLLAMA_ENDPOINT=http://localhost:11434

# File Upload
UPLOAD_DIR=./uploads
MAX_UPLOAD_SIZE=10485760  # 10MB
```

**Frontend (`frontend/.env.local`)**
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Using Ollama (Free Local LLM)

1. **Install Ollama**
   ```bash
   curl https://ollama.ai/install.sh | sh
   ```

2. **Pull a model**
   ```bash
   ollama pull llama3.2
   ```

3. **Create an agent with Ollama**
   - Select "Ollama" as LLM provider
   - Enter model: `llama3.2`
   - Completely free, runs locally!

---

## Project Structure

```
AgentBuilder/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── agents.py
│   │   │   ├── api_keys.py
│   │   │   ├── auth.py
│   │   │   ├── chat.py
│   │   │   ├── corrections.py
│   │   │   ├── knowledge.py
│   │   │   └── public_api.py
│   │   ├── core/
│   │   │   ├── agent_graph.py
│   │   │   └── prompt_builder.py
│   │   ├── db/
│   │   │   └── database.py
│   │   ├── models/
│   │   │   └── models.py
│   │   ├── schemas/
│   │   │   ├── schemas.py
│   │   │
│   │   ├── services/
│   │   │   ├── document_processor.py
│   │   │   ├── llm_gateway.py
│   │   │   └── vector_store.py
│   │   ├── config.py
│   │   └── main.py
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── agents/[id]/
│   │   │   │   ├── api/
│   │   │   │   └── playground/
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   ├── components/
│   │   │   ├── AgentCard.tsx
│   │   │   ├── APIDocs.tsx
│   │   │   ├── APIKeyManager.tsx
│   │   │   ├── ChatInterface.tsx
│   │   │   ├── CorrectionModal.tsx
│   │   │   ├── FileUploader.tsx
│   │   │   ├── FineTuneUploader.tsx
│   │   │   └── ModelComparison.tsx
│   │   ├── hooks/
│   │   └── styles/
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── Dockerfile
│
├── docker-compose.yml
├── README.md
└── README_EG.md

```

---

## Deployment

### Production Checklist

- [ ] Change `SECRET_KEY` to a strong random string
- [ ] Set `DEBUG=False` in backend config
- [ ] Use production PostgreSQL instance
- [ ] Set up SSL/TLS (HTTPS)
- [ ] Configure CORS origins in `docker-compose.yml`
- [ ] Set up database backups
- [ ] Configure rate limiting for public API
- [ ] Use Gunicorn for production WSGI

### Deploy to Cloud

**Backend (Railway/Render/Fly.io)**
- Set environment variables
- Deploy from GitHub
- Ensure PostgreSQL addon is configured

**Frontend (Vercel/Netlify)**
- Connect GitHub repository
- Set `NEXT_PUBLIC_API_URL` to your backend URL
- Deploy

---

## Troubleshooting

**"Database connection failed"**
- Wait 30 seconds for PostgreSQL to start
- Try: `docker-compose restart`

**"OpenAI API error"**
- Check `OPENAI_API_KEY` starts with `sk-`
- Verify API credits

**"Invalid API key" (Public API)**
- Check key is copied correctly (starts with `ab_`)
- Ensure key is active and not expired
- Verify correct agent ID in URL

**"Port already in use"**
- Something is running on port 3000 or 8000
- Stop other apps or change ports in `docker-compose.yml`

**"Ollama connection error"**
- Verify Ollama is running: `ollama list`
- Check `OLLAMA_ENDPOINT` is correct

**"Agent doesn't remember previous messages"**
- Check the 🧠 brain toggle is ON in the chat sidebar
- Look for the purple "Memory active" banner at the top of chat
- Verify migration ran: `docker-compose exec postgres psql -U postgres -d agentbuilder -c "\dt"` — you should see `conversation_sessions`

---

## Roadmap

### v1.0 (Current)
- ✅ No-code agent creation
- ✅ Knowledge base uploads (PDF, TXT, CSV)
- ✅ RAG with local FAISS vector store
- ✅ Corrections & few-shot learning
- ✅ OpenAI & Ollama support
- ✅ API Generator with key management
- ✅ Public REST API for external integrations
- ✅ Interactive API documentation
- ✅ Conversation Memory with session history
- ✅ Chat Rating (👍/👎) system for quality tracking
- ✅ Usage analytics dashboard
- ✅ Rate limiting per API key
- ✅ Streaming API responses

### v1.1 (Planned)
- [ ] Webhook support
- [ ] Bulk file upload

### v2.0 (Future)
- [ ] Multi-agent conversations
- [ ] Agent marketplace
- [ ] Team collaboration
- [ ] Voice interface
- [ ] SDKs (Python, JavaScript)

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Commit: `git commit -m 'Add amazing feature'`
5. Push: `git push origin feature/amazing-feature`
6. Open a Pull Request

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Support

- **API Docs**: http://localhost:8000/docs
- **Issues**: [GitHub Issues](https://github.com/yourusername/agentbuilder/issues)
- **Discussion**: [Discussion](https://github.com/aungkaungpyaepaing/LLMAgentCreator/discussions)
- **Email**: aungkpp.dev@gmail.com

---

## Acknowledgments

- Built with [LangChain](https://langchain.com) and [LangGraph](https://github.com/langchain-ai/langgraph)
- Powered by [OpenAI](https://openai.com) and [Ollama](https://ollama.ai)
- Local vector storage with [FAISS](https://github.com/facebookresearch/faiss)
- UI components inspired by [Tailwind UI](https://tailwindui.com)

---