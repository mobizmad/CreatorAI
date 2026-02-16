# AgentBuilder

**Build, train, and refine custom LLM agents with no code.**

AgentBuilder is a SaaS platform that empowers non-technical users to create their own custom AI agents powered by LLMs. Upload your knowledge base, chat with your agent, and improve it through corrections that are automatically learned.

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

### Technical Stack

**Backend:**
- Python 3.11+ with FastAPI
- LangChain & LangGraph for agent orchestration
- PostgreSQL for data storage
- Pinecone for vector embeddings
- SQLAlchemy ORM with Alembic migrations

**Frontend:**
- Next.js 14 with React 18
- TypeScript
- Tailwind CSS
- React Query for state management

**LLM Providers:**
- OpenAI API (GPT-4, GPT-3.5)
- Ollama (Llama 3.2, and other local models)
- Extensible for custom providers

---

## Quick Start

### Prerequisites

- **Docker & Docker Compose** (recommended)
- **Python 3.11+** (for local development)
- **Node.js 18+** (for local development)
- **PostgreSQL** (if not using Docker)
- **OpenAI API Key** (for OpenAI models)
- **Pinecone API Key** (for vector storage)
- **Ollama** (optional, for local LLM)

### Option 1: Docker Compose (Recommended)

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/agentbuilder.git
   cd agentbuilder
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and add your API keys:
   ```env
   OPENAI_API_KEY=sk-your-openai-key-here
   PINECONE_API_KEY=your-pinecone-key-here
   PINECONE_ENVIRONMENT=gcp-starter
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

### Option 2: Local Development

#### Backend Setup

1. **Navigate to backend directory**
   ```bash
   cd backend
   ```

2. **Create virtual environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your configuration.

5. **Set up PostgreSQL**
   ```bash
   # Create database
   createdb agentbuilder

   # Or use Docker
   docker run -d \
     --name agentbuilder-postgres \
     -e POSTGRES_USER=postgres \
     -e POSTGRES_PASSWORD=postgres \
     -e POSTGRES_DB=agentbuilder \
     -p 5432:5432 \
     postgres:15-alpine
   ```

6. **Initialize database**
   ```bash
   # The tables will be created automatically on first run
   python -m app.main
   ```

7. **Run the backend**
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

#### Frontend Setup

1. **Navigate to frontend directory**
   ```bash
   cd frontend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   # Create .env.local
   echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Access the application**
   - Frontend: http://localhost:3000
   - Backend: http://localhost:8000

---

## Using Ollama (Local LLM)

If you want to run local models with Ollama:

1. **Install Ollama**
   ```bash
   # macOS/Linux
   curl https://ollama.ai/install.sh | sh

   # Or download from https://ollama.ai
   ```

2. **Pull a model**
   ```bash
   ollama pull llama3.2
   ```

3. **Verify Ollama is running**
   ```bash
   curl http://localhost:11434/api/tags
   ```

4. **Create an agent with Ollama**
   - In AgentBuilder, select "Ollama" as the LLM provider
   - Enter model name: `llama3.2` (or any model you've pulled)
   - The agent will now use your local LLM!

---

## Usage Guide

### 1. Create an Account

1. Open http://localhost:3000
2. Click "Sign Up"
3. Enter your email and password
4. You'll be automatically logged in

### 2. Create Your First Agent

1. Click "Create Agent" button
2. Fill in the details:
   - **Name**: Give your agent a descriptive name
   - **Description**: What does your agent do?
   - **LLM Provider**: Choose OpenAI or Ollama
   - **Model**: e.g., `gpt-4` or `llama3.2`
   - **Temperature**: 0.0 (precise) to 1.0 (creative)
3. Click "Create Agent"

### 3. Upload Knowledge Base

1. Click on your agent
2. Go to "Knowledge Base" tab
3. Drag & drop or click to upload files (PDF, TXT, CSV)
4. Files are automatically:
   - Chunked into smaller segments
   - Embedded using OpenAI embeddings
   - Stored in Pinecone vector database

### 4. Chat with Your Agent

1. Go to "Chat" tab
2. Ask questions about your knowledge base
3. The agent will:
   - Retrieve relevant information (RAG)
   - Generate accurate responses
   - Show sources used

### 5. Correct & Improve

When your agent makes a mistake:

1. Click "Correct this response"
2. Provide the correct answer
3. Add optional context
4. The correction is saved as a "golden example"
5. Future responses will reference this correction

### 6. Manage Corrections

1. Go to "Corrections" tab
2. View all corrections (few-shot examples)
3. Toggle corrections on/off
4. Active corrections are automatically injected into prompts

---

## API Documentation

### Authentication

All API endpoints (except `/auth/register` and `/auth/login`) require authentication.

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

Response:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer"
}
```

### Agents

**Create Agent**
```bash
curl -X POST http://localhost:8000/agents \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Agent",
    "description": "A helpful assistant",
    "llm_provider": "openai",
    "llm_model": "gpt-4",
    "temperature": 0.7
  }'
```

**List Agents**
```bash
curl -X GET http://localhost:8000/agents \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Knowledge Base

**Upload File**
```bash
curl -X POST http://localhost:8000/agents/AGENT_ID/knowledge \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@document.pdf"
```

### Chat

**Send Message**
```bash
curl -X POST http://localhost:8000/agents/AGENT_ID/chat \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "What is the company policy on remote work?"}'
```

Response:
```json
{
  "response": "According to the employee handbook...",
  "sources": [
    {
      "text": "Remote work is allowed...",
      "source": "handbook.pdf"
    }
  ]
}
```

### Corrections

**Create Correction**
```bash
curl -X POST http://localhost:8000/agents/AGENT_ID/corrections \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_query": "What is the vacation policy?",
    "incorrect_response": "You get 10 days.",
    "corrected_response": "Full-time employees receive 15 days of paid vacation per year."
  }'
```

Full API documentation available at: http://localhost:8000/docs

---

## Architecture

### System Overview

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Frontend  │─────▶│   Backend    │─────▶│  PostgreSQL │
│  (Next.js)  │      │   (FastAPI)  │      │             │
└─────────────┘      └──────────────┘      └─────────────┘
                            │
                            ├─────▶ Pinecone (Vector DB)
                            ├─────▶ OpenAI API
                            └─────▶ Ollama (Local LLM)
```

### Agent Execution Flow

```
1. User Query
   ↓
2. Retrieve Relevant Chunks (RAG)
   ↓
3. Load Corrections (Few-Shot)
   ↓
4. Build System Prompt
   ↓
5. Generate Response (LLM)
   ↓
6. Return Response + Sources
```

### Database Schema

**Key Tables:**
- `users`: User accounts
- `agents`: Agent configurations
- `knowledge_bases`: Uploaded files
- `corrections`: Few-shot examples
- `chat_logs`: Conversation history

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

# Pinecone
PINECONE_API_KEY=your-key
PINECONE_ENVIRONMENT=gcp-starter

# Ollama
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

## Deployment

### Production Deployment Checklist

- [ ] Change `SECRET_KEY` to a strong random string
- [ ] Set `DEBUG=False` in backend config
- [ ] Use production PostgreSQL instance
- [ ] Set up SSL/TLS certificates
- [ ] Configure CORS origins properly
- [ ] Set up backup strategy for database
- [ ] Configure rate limiting
- [ ] Set up monitoring and logging
- [ ] Use production-grade WSGI server (Gunicorn)

### Deploy to Cloud

**Backend (Railway/Render/Fly.io)**
- Set environment variables
- Deploy from GitHub
- Ensure PostgreSQL addon is configured

**Frontend (Vercel/Netlify)**
- Connect GitHub repository
- Set `NEXT_PUBLIC_API_URL` to backend URL
- Deploy

---

## Troubleshooting

### Common Issues

**1. "Failed to connect to database"**
- Ensure PostgreSQL is running
- Check `DATABASE_URL` in `.env`
- Verify database exists: `psql -l`

**2. "OpenAI API error"**
- Verify `OPENAI_API_KEY` is set correctly
- Check API key has sufficient credits
- Ensure API key has proper permissions

**3. "Pinecone initialization failed"**
- Verify `PINECONE_API_KEY` is correct
- Check `PINECONE_ENVIRONMENT` matches your Pinecone plan
- Ensure you have available indexes

**4. "Ollama connection error"**
- Verify Ollama is running: `ollama list`
- Check `OLLAMA_ENDPOINT` is correct
- Ensure model is pulled: `ollama pull llama3.2`

**5. "File upload failed"**
- Check file size (max 10MB by default)
- Verify file type is supported (PDF, TXT, CSV)
- Ensure `UPLOAD_DIR` exists and is writable

---

## Development

### Project Structure

```
AgentBuilder/
├── backend/
│   ├── app/
│   │   ├── api/          # API endpoints
│   │   ├── core/         # Agent logic & prompts
│   │   ├── models/       # Database models
│   │   ├── schemas/      # Pydantic schemas
│   │   ├── services/     # Business logic
│   │   └── main.py       # FastAPI app
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── app/          # Next.js pages
│   │   ├── components/   # React components
│   │   └── lib/          # API client & types
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

### Running Tests

```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
npm test
```

### Code Style

**Backend:**
- Black for formatting
- Flake8 for linting
- Type hints with MyPy

**Frontend:**
- Prettier for formatting
- ESLint for linting
- TypeScript strict mode

---

## Roadmap

### v1.0 (Current)
- ✅ No-code agent creation
- ✅ Knowledge base uploads
- ✅ RAG implementation
- ✅ Corrections & few-shot learning
- ✅ OpenAI & Ollama support

### v1.1 (Planned)
- [ ] Agent templates & presets
- [ ] Bulk file upload
- [ ] Advanced agent analytics
- [ ] API key management per agent
- [ ] Webhook integrations

### v2.0 (Future)
- [ ] Multi-agent conversations
- [ ] Agent marketplace
- [ ] Custom embedding models
- [ ] Voice interface
- [ ] Team collaboration features

---

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `pytest` and `npm test`
5. Commit: `git commit -m 'Add amazing feature'`
6. Push: `git push origin feature/amazing-feature`
7. Open a Pull Request

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Support

- **Documentation**: [docs.agentbuilder.com](https://docs.agentbuilder.com)
- **Issues**: [GitHub Issues](https://github.com/yourusername/agentbuilder/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/agentbuilder/discussions)
- **Email**: aungkpp.dev@gmail.com

---

## Acknowledgments

- Built with [LangChain](https://langchain.com) and [LangGraph](https://github.com/langchain-ai/langgraph)
- Powered by [OpenAI](https://openai.com) and [Ollama](https://ollama.ai)
- Vector storage by [Pinecone](https://pinecone.io)
- UI components inspired by [Tailwind UI](https://tailwindui.com)

---

**Happy Agent Building! 🤖**
