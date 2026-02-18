**ကုဒ်ရေးစရာမလိုဘဲ မိမိစိတ်ကြိုက် LLM agent များကို တည်ဆောက်ပါ၊ လေ့ကျင့်ပေးပါ၊ ပိုမိုကောင်းမွန်အောင် ပြုပြင်ပါ။**

AgentBuilder သည် နည်းပညာပိုင်းမကျွမ်းကျင်သော အသုံးပြုသူများကို LLM များဖြင့် အလုပ်လုပ်သည့် ကိုယ်ပိုင် AI agent များ ဖန်တီးနိုင်စေရန် စွမ်းဆောင်ပေးသော platform တစ်ခုဖြစ်ပါသည်။ သင့်၏ knowledge base ကို upload တင်ပါ၊ သင့် agent နှင့် စကားပြောပါ၊ အမှားပြင်ဆင်ချက်များမှတစ်ဆင့် ၎င်းကို ပိုမိုကောင်းမွန်အောင် ပြုပြင်ပါ၊ API မှတစ်ဆင့် မည်သည့် ပြင်ပစနစ်နှင့်မဆို ချိတ်ဆက်ပါ။ ယခုအခါ **အပြန်အလှန်ပြောဆိုမှု မှတ်ဉာဏ် (conversation memory)** ပါဝင်လာပြီဖြစ်၍ agent များသည် message များတစ်လျှောက် အကြောင်းအရာများကို မှတ်မိနေပြီ ဖြစ်ပါသည်။

<img src="https://github.com/user-attachments/assets/0d0fc5d0-f46b-4c08-b2ae-4f3df2821cf8" alt="Aung's Avatar" width="100" height="100"/>

## အထူးပြုလုပ်ဆောင်ချက်များ (Features)

### အဓိက လုပ်ဆောင်နိုင်စွမ်းများ (Core Capabilities)

- **No-Code Agent Creation**: ကုဒ်တစ်ကြောင်းမှ ရေးစရာမလိုဘဲ မိနစ်ပိုင်းအတွင်း မိမိစိတ်ကြိုက် AI agent များကို ဖန်တီးနိုင်ခြင်း
- **Knowledge Base Management**: သင့် agent များကို လေ့ကျင့်ပေးရန်အတွက် PDF, TXT နှင့် CSV ဖိုင်များကို upload တင်နိုင်ခြင်း
- **RAG (Retrieval Augmented Generation)**: Agent များသည် သင့် knowledge base ထဲမှ သက်ဆိုင်ရာ အချက်အလက်များကို အလိုအလျောက် ရှာဖွေထုတ်ယူပေးခြင်း
- **Correction & Feedback Loop**: သင့် agent အမှားလုပ်မိသောအခါ ၎င်းကို ပြင်ဆင်ပေးခြင်းဖြင့် agent သည် သင်၏ တုံ့ပြန်မှုမှတစ်ဆင့် သင်ယူမှတ်သားခြင်း
- **Few-Shot Learning**: အမှားပြင်ဆင်ချက်များကို "golden examples" (အကောင်းဆုံး ဥပမာများ) အဖြစ် သိမ်းဆည်းထားပြီး နောက်ပိုင်း prompt များတွင် အလိုအလျောက် ထည့်သွင်းပေးခြင်း
- **Multi-LLM Support**: OpenAI မော်ဒယ်များကို သုံးနိုင်သလို Ollama (Llama 3.2, စသည်) ဖြင့် Local မော်ဒယ်များကိုလည်း အသုံးပြုနိုင်ခြင်း
- **Agent Playground**: သင့် agent များကို စမ်းသပ်ရန်နှင့် ပြုပြင်ရန်အတွက် အပြန်အလှန်ပြောဆိုနိုင်သော chat မျက်နှာပြင်
- **Source Attribution**: အဖြေများထုတ်ပေးရန်အတွက် agent သည် မည်သည့် စာရွက်စာတမ်းများကို အသုံးပြုခဲ့သည်ကို ကြည့်ရှုနိုင်ခြင်း
- **API Generator**: ပြင်ပစနစ်များနှင့် ချိတ်ဆက်ရန် API key များ ထုတ်ပေးခြင်း
- **Conversation Memory**: Agent များသည် message များတစ်လျှောက် အကြောင်းအရာများကို မှတ်မိခြင်း (Web UI တွင်)
- **Public API Memory**: Session ID များမှတစ်ဆင့် ပြင်ပ application များတွင် စကားပြောဆိုမှု အကြောင်းအရာကို ဆက်လက်ထိန်းသိမ်းထားနိုင်ခြင်း
- **Chat Rating System**: အသုံးပြုသူများသည် ညံ့ဖျင်းသော အဖြေများကို အလွယ်တကူ မှတ်သားနိုင်ရန်နှင့် ပြင်ဆင်နိုင်ရန်အတွက် အဖြေများကို လက်မထောင် (👍) သို့မဟုတ် လက်မချ (👎) ဖြင့် အဆင့်သတ်မှတ်ပေးနိုင်ခြင်း


### အသုံးပြုထားသော နည်းပညာများ (Technical Stack)

**Backend:**
- Python 3.11+ နှင့် FastAPI
- Agent ချိတ်ဆက်လုပ်ဆောင်ရန် LangChain & LangGraph
- ဒေတာသိမ်းဆည်းရန် PostgreSQL
- Local vector embedding အတွက် FAISS (ပြင်ပ API မလိုပါ!)
- SQLAlchemy ORM

**Frontend:**
- Next.js 14 နှင့် React 18
- TypeScript
- Tailwind CSS

**LLM Providers:**
- OpenAI API (GPT-4, GPT-3.5)
- Ollama (Llama 3.2 နှင့် အခြား local မော်ဒယ်များ)
- အခြား provider များအတွက်လည်း ထပ်မံချဲ့ထွင်နိုင်ခြင်း

---

## အမြန်စတင်ရန် (Quick Start)

### လိုအပ်ချက်များ (Prerequisites)

- **Docker & Docker Compose** (အကြံပြုထားသည်)
- **OpenAI API Key** (OpenAI မော်ဒယ်များအတွက်)
- **Ollama** (အခမဲ့ local LLM အတွက် - ရွေးချယ်နိုင်သည်)

### Docker Compose ဖြင့်စတင်ခြင်း (အကြံပြုထားသည်)

1. **Repository ကို Clone လုပ်ပါ**
```bash
git clone https://github.com/yourusername/agentbuilder.git
cd agentbuilder
```
2. **Environment variables များ သတ်မှတ်ပါ**
```bash
cp .env.example .env
```
.env ကို ပြင်ဆင်ပါ - အောက်ပါ အချက် ၂ ချက်သာ လိုအပ်ပါသည်
```bash
OPENAI_API_KEY=sk-your-openai-key-here
SECRET_KEY=your-strong-random-secret-key
```

3. **Service များကို စတင်ပါ**
```Bash
docker-compose up --build
```

4. **Application သို့ ဝင်ရောက်ပါ**
Frontend: ```http://localhost:3000```
Backend API: ```http://localhost:8000```
API Documentation: ```http://localhost:8000/docs```

---

### အသုံးပြုနည်း လမ်းညွှန် (Usage Guide)

1. **အကောင့်တစ်ခု ဖန်တီးပါ**
    1. http://localhost:3000 သို့ ဝင်ပါ
    2. "Sign Up" ကို နှိပ်ပါ
    3. သင့် email နှင့် password ကို ထည့်ပါ

2. **သင့်၏ ပထမဆုံး Agent ကို ဖန်တီးပါ**
    1. "Create Agent" ကို နှိပ်ပါ
    2. အချက်အလက်များကို ဖြည့်ပါ
        - Name: သင့် agent အတွက် သင့်လျော်သော အမည်တစ်ခုပေးပါ
        - Description: သင့် agent ဘာလုပ်သလဲ?
        - LLM Provider: OpenAI သို့မဟုတ် Ollama ကို ရွေးပါ
        - Model: ဥပမာ gpt-4 သို့မဟုတ် llama3.2
        - Temperature: 0.0 (တိကျမှု) မှ 1.0 (ဖန်တီးနိုင်စွမ်း) ကြားထားပါ
    3. "Create Agent" ကို နှိပ်ပါ
3. **Knowledge Base ဖိုင်တင်ပါ**
    1. သင့် agent ကို နှိပ်ပါ → "Knowledge Base" tab ကို သွားပါ
    2. ဖိုင်များကို ဆွဲထည့်ပါ သို့မဟုတ် နှိပ်ပြီး တင်ပါ (PDF, TXT, CSV)
    3. ဖိုင်များကို အလိုအလျောက် ခွဲခြားပြီး FAISS ဖြင့် embed လုပ်ပါမည် (စက်ထဲတွင်သာ သိမ်းဆည်းသည်!)
4. **သင့် Agent နှင့် စကားပြောပါ**
    1. "Chat" tab သို့ သွားပါ
    2. သင့် knowledge base နှင့် ပတ်သက်သော မေးခွန်းများကို မေးပါ
    3. Agent သည် သက်ဆိုင်ရာ အချက်အလက်များကို ရှာဖွေပေးပြီး မည်သည့်နေရာမှ ရယူထားကြောင်း (sources) ကိုပါ ပြသပေးပါမည်
5. **Conversation Memory ကို အသုံးပြုပါ**
    Agent သည် session တစ်ခုချင်းစီအတွင်းရှိ အကြောင်းအရာများကို မှတ်မိနေပါမည်
    1. Memory ကို ပုံမှန်အားဖြင့် ဖွင့်ထားပါသည် — chat ၏ ဘေးဘက်ဘားရှိ 🧠 ဦးနှောက်ခလုတ်လေးကို နှိပ်ပါ
    2. စတင်ပြောဆိုပါ — agent သည် ထို session တွင် အစောပိုင်းက ပြောခဲ့သမျှကို မှတ်မိနေပါမည်
    3. စကားပြောအသစ်စရန် "+" ကို နှိပ်ပါ (session အသစ် = မှတ်ဉာဏ်အလွတ်)
    4. ယခင်စကားပြောဆိုမှုများကို ဘေးဘက်ဘားတွင် ပြသထားပြီး အချိန်မရွေး ပြန်ဖွင့်နိုင်ပါသည်
    5. Message တစ်ခုချင်းစီကို သီးခြားစီ သတ်မှတ်စေချင်ပါက memory ကို ပိတ် (off) ထားနိုင်ပါသည်
**ဥပမာ:**
```
သင်:     "ကျွန်တော့်နာမည်က Alex ပါ"
Agent: "မင်္ဂလာပါ Alex! ဘာများကူညီပေးရမလဲ?"
သင်:     "ကျွန်တော့်နာမည်ဘယ်လိုခေါ်လဲ?"
Agent: "သင့်နာမည်က Alex ပါ။"    ✅ Memory အလုပ်လုပ်နေပါသည်!
```

6. **အဆင့်သတ်မှတ်ပါ၊ ပြင်ဆင်ပါ၊ ပိုမိုကောင်းမွန်အောင်လုပ်ပါ** 

သင့် agent မှ အဖြေပေးသောအခါ:

    1. အဖြေ၏ အရည်အသွေးကို သတ်မှတ်ရန် လက်မထောင် (👍) သို့မဟုတ် လက်မချ (👎) ခလုတ်များကို အသုံးပြုပါ။
    2. အကယ်၍ agent အမှားလုပ်မိပါက (သို့မဟုတ် downvote ရရှိပါက)၊ "Correct this response" ကို နှိပ်ပါ။
    3. မှန်ကန်သော အဖြေကို ထည့်ပေးပါ။
    4. ထိုပြင်ဆင်ချက်ကို နောင်အဖြေများအတွက် "golden example" အဖြစ် သိမ်းဆည်းထားမည် ဖြစ်ပါသည်။

7. **API မှတစ်ဆင့် ချိတ်ဆက်ပါ**

    1. သင့် agent ၏ playground တွင် "API Integration" ခလုတ်ကို နှိပ်ပါ
    2. "API Keys" tab သို့ သွားပါ → "Create API Key" ကို နှိပ်ပါ
    3. သင့် key ကို သိမ်းဆည်းပါ (တစ်ကြိမ်သာ ပြသပါမည်!)
    4. ၎င်းကို အသုံးပြု၍ သင့် agent ကို မည်သည့် ပြင်ပစနစ်နှင့်မဆို ချိတ်ဆက်ပါ
    
---

## အပြန်အလှန်ပြောဆိုမှု မှတ်ဉာဏ် (Conversation Memory)

### အလုပ်လုပ်ပုံ (How It Works)
အသုံးပြုသူတစ်ဦး chat ကို ဖွင့်လိုက်တိုင်း session တစ်ခုကို ဖန်တီးပါသည်။ ထို session အတွင်းရှိ message အားလုံးကို ချိတ်ဆက်ထားပါသည်။ Agent မှ အဖြေပေးသောအခါ၊ ၎င်းသည် session မှ နောက်ဆုံး message ခုကို ယူဆောင်ပြီး LLM ထံသို့ စကားပြောမှတ်တမ်း (conversation history) အဖြစ် ပေးပို့ပါသည် — ထို့ကြောင့် LLM သည် အကြောင်းအရာအပြည့်အစုံကို သိရှိပါသည်။

```
User မှ message ပို့သည်
       ↓
Session မှ နောက်ဆုံး message 10 ခုကို ယူသည် (memory window)
       ↓
တည်ဆောက်ပုံ: [system prompt, ယခင် msgs များ..., လက်ရှိ message]
       ↓
LLM သည် အချက်အလက်အပြည့်အစုံဖြင့် အဖြေထုတ်ပေးသည်
       ↓
Message ကို သိမ်းဆည်းသည် + session ကို အပ်ဒိတ်လုပ်သည်
```

### Agent တစ်ခုချင်းစီအတွက် မှတ်ဉာဏ် ဆက်တင်များ (Memory Settings)
Agent model ရှိ အောက်ပါ အကွက် (၂) ခုသည် memory လုပ်ဆောင်ပုံကို ထိန်းချုပ်ပါသည်:
| Field | Default | Description |
| --------------- | --------------- | --------------- |
| ```memory_enabled```   | ```true```   | ဤ agent အတွက် memory ကို အဖွင့်/အပိတ် လုပ်ရန်  |
| ```memory_window```   | ```10```   | ယခင်စကားပြောထားသည့် အစုံ မည်မျှကို ထည့်သွင်းမည်နည်း   |

**Session API**

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| POST | `/agents/{id}/chat/sessions` | Session အသစ် ဖန်တီးရန် |
| GET | `/agents/{id}/chat/sessions` | Session အားလုံးကို ကြည့်ရန် |
| GET | `/agents/{id}/chat/sessions/{session_id}/messages` | Session အတွင်းရှိ message များကို ယူရန် |
| DELETE | `/agents/{id}/chat/sessions/{session_id}` | Session ကို ဖျက်ရန် |

**မှတ်ဉာဏ်ဖြင့် စကားပြောခြင်း(Internal API)**
 
 Memory ကို အသက်သွင်းရန် session_id ကို ထည့်သွင်းပေးပါ။ မထည့်သွင်းပါက၊ session အသစ်တစ်ခုကို အလိုအလျောက် ဖန်တီးပေးပါမည်:
 ```
 Bash# ပထမဆုံး message — session_id ထည့်ရန်မလိုပါ၊ အလိုအလျောက်ဖန်တီးပြီး ပြန်လည်ပေးပို့ပါမည်
curl -X POST http://localhost:8000/agents/AGENT_ID/chat \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "My name is Alex"}'

# အဖြေတွင် session_id ပါဝင်ပါမည်:
# {"response": "Hello Alex!", "session_id": "abc-123", "sources": [...]}

# နောက်ဆက်တွဲ — မှတ်ဉာဏ်ဖြင့် ဆက်လက်စကားပြောရန် session_id ကို ထည့်ပေးပါ
curl -X POST http://localhost:8000/agents/AGENT_ID/chat \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "What is my name?", "session_id": "abc-123"}'
```

**Message ကို အဆင့်သတ်မှတ်ခြင်း (Internal)**

```Bash
curl -X POST http://localhost:8000/agents/AGENT_ID/chat/MESSAGE_ID/rate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rating": -1}'  # လက်မထောင်ရန် 1 ကိုသုံးပါ၊ လက်မချရန် -1၊ ဖယ်ရှားရန် 0 ကိုသုံးပါ
```
---

##API ချိတ်ဆက်ခြင်း (API Integration)

### API Key ထုတ်ယူခြင်း
    1. သင့် agent ၏ playground သို့ သွားပါ
    2. အပေါ်ဘားရှိ "API Integration" ကို နှိပ်ပါ
    3. "Create API Key" ကို နှိပ်ပါ
    4. သင့် key ကို အမည်ပေးပါ (ဥပမာ - "Production") ပြီးနောက် သက်တမ်းကုန်ဆုံးမည့်အချိန် သတ်မှတ်လိုက သတ်မှတ်ပါ
    5. Key ကို ချက်ချင်း ကူးယူပြီး သိမ်းဆည်းပါ - ၎င်းကို ထပ်မံပြသမည် မဟုတ်ပါ!
    
### Public API ကို အသုံးပြုခြင်း
Public API request အားလုံးအတွက် သင့် API key ကို header တွင် ထည့်သွင်းရန် လိုအပ်ပါသည်
```bash
X-API-Key: ab_your_api_key_here
```

API သည် **Conversation Memory** ကို ထောက်ပံ့ပေးပါသည်။ session_id ကို ထည့်သွင်းပေးခြင်းဖြင့် စကားပြောဆိုမှု အကြောင်းအရာကို ဆက်လက်ထိန်းသိမ်းထားနိုင်ပါသည်။

### 1. အချက်အလက်မမှတ်သော စကားပြောဆိုမှု (တစ်ခါသုံး / Stateless Chat)

အကယ်၍ သင်သည် session_id ကို မထည့်သွင်းပါက၊ session အသစ်တစ်ခုကို အလိုအလျောက် ဖန်တီးပေးပါမည်။ အဖြေတွင် နောက်ပိုင်းအသုံးပြုရန်အတွက် သိမ်းဆည်းထားနိုင်သော session_id ပါဝင်ပါမည်။

```Bash
curl -X POST "http://localhost:8000/v1/agents/YOUR_AGENT_ID/chat" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ab_YOUR_API_KEY" \
  -d '{"message": "My name is Alice"}'
```
## Response:JSON
```jason
{
  "response": "Hello Alice! How can I help you?",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "agent_name": "Support Bot",
  "usage_remaining": 99
}
```
### 2. အချက်အလက်မှတ်သော စကားပြောဆိုမှု (မှတ်ဉာဏ်ဖြင့် / Stateful Chat)

စကားပြောဆိုမှုကို ဆက်လက်လုပ်ဆောင်ရန်၊ ယခင်တုံ့ပြန်မှုမှ ရရှိခဲ့သော session_id ကို ထည့်သွင်းပေးပါ။

```Bash
curl -X POST "http://localhost:8000/v1/agents/YOUR_AGENT_ID/chat" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ab_YOUR_API_KEY" \
  -d '{
    "message": "What is my name?",
    "session_id": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

## Response: ##
```JSON{
  "response": "Your name is Alice.",
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```
**Python ဥပမာ:**

```Python
import requests

url = "http://localhost:8000/v1/agents/YOUR_AGENT_ID/chat"
headers = {
    "X-API-Key": "ab_YOUR_KEY",
    "Content-Type": "application/json"
}

# 1. ပထမဆုံး message - session_id မလိုပါ
response1 = requests.post(url, headers=headers, json={
    "message": "My name is Alice"
})
data1 = response1.json()
session_id = data1["session_id"]  # ၎င်းကို သိမ်းဆည်းထားပါ!

print(f"Agent: {data1['response']}")

# 2. နောက်ဆက်တွဲ - မှတ်ဉာဏ်ဖြင့်
response2 = requests.post(url, headers=headers, json={
    "message": "What is my name?",
    "session_id": session_id  # ပြန်လည်ထည့်သွင်းပေးပါ
})
data2 = response2.json()

print(f"Agent: {data2['response']}") # Output: "Your name is Alice"
```

**JavaScript ဥပမာ:**
```JavaScript
const url = "http://localhost:8000/v1/agents/YOUR_AGENT_ID/chat";
const headers = {
  "Content-Type": "application/json",
  "X-API-Key": "ab_YOUR_KEY"
};

// 1. စကားစပြောခြင်း
const res1 = await fetch(url, {
  method: "POST",
  headers,
  body: JSON.stringify({ message: "My name is Alice" })
});
const data1 = await res1.json();
const sessionId = data1.session_id; // ၎င်းကို သိမ်းဆည်းထားပါ!

// 2. စကားပြောဆိုမှုကို ဆက်လုပ်ခြင်း
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
| POST | `/v1/agents/{agent_id}/chat` | chatAgent နှင့် စကားပြောရန် |
| GET | `/v1/agents/{agent_id}/info` | infoAgent ၏ အချက်အလက်များကို ယူရန် |
| GET | `/v1/health` | API လုပ်ဆောင်နိုင်စွမ်း စစ်ဆေးရန် |


### API Key Management Endpoints (User Auth လိုအပ်ပါသည်)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/agents/{agent_id}/api-keys` |API key အသစ် ဖန်တီးရန် |
| GET | `/agents/{agent_id}/api-keys` | API key အားလုံးကို ကြည့်ရန် |
| DELETE | `/agents/{agent_id}/api-keys/{key_id}` | API key ကို ရုပ်သိမ်းရန် |
| PATCH | `/agents/{agent_id}/api-keys/{key_id}/toggle` | Key ကို အဖွင့်/အပိတ် လုပ်ရန် |

---
## အတွင်းသုံး API မှတ်တမ်း (Internal API Documentation)

### Authentication

Internal သုံး endpoint အားလုံး (/auth/register နှင့် /auth/login မှလွဲ၍) အတွက် user JWT token လိုအပ်ပါသည်။

**Register (အကောင့်ဖွင့်ရန်)**

```Bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password123"}'
```

**Login (အကောင့်ဝင်ရန်)**
```Bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password123"}'
```

**Create Agent (Agent ဖန်တီးရန်)**
```Bash
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

**Upload Knowledge (အချက်အလက် တင်ရန်)**
```Bash
curl -X POST http://localhost:8000/agents/AGENT_ID/knowledge \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@document.pdf"
```

**Chat (Internal)**
```Bash
curl -X POST http://localhost:8000/agents/AGENT_ID/chat \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "What is the company policy?", "session_id": "optional-session-id"}'
```

API docs အပြည့်အစုံကို http://localhost:8000/docs တွင် ကြည့်ရှုနိုင်ပါသည်။

---

## တည်ဆောက်ပုံ (Architecture)

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
1. User Query (UI သို့မဟုတ် API မှတစ်ဆင့်)
   ↓
2. Load Conversation History (Memory)   ← အသစ်
   ↓
3. Retrieve Relevant Chunks (FAISS RAG ဖြင့်ရှာဖွေခြင်း)
   ↓
4. Load Corrections (Few-Shot ဖြင့်ပြင်ဆင်ချက်များရယူခြင်း)
   ↓
5. Build Message Array with History (မှတ်တမ်းများပါဝင်သော Message အစီအစဉ်တည်ဆောက်ခြင်း)
   ↓
6. Generate Response (LLM ဖြင့် အဖြေထုတ်ပေးခြင်း)
   ↓
7. Save to Session + Return Response (Session တွင်သိမ်းဆည်းပြီး အဖြေပြန်ပေးခြင်း)
```

### Database Schema

- users - အသုံးပြုသူ အကောင့်များ
- agents - Agent configurations (ဆက်တင်များ) (memory_enabled, memory_window ပါဝင်သည်)
- knowledge_bases - Upload တင်ထားသော ဖိုင်များ၏ metadata များ
- corrections - Few-shot ဥပမာများ
- conversation_sessions - မှတ်ဉာဏ်အတွက် message များကို session များအဖြစ် စုစည်းထားခြင်း
- chat_logs - Message တစ်ခုချင်းစီ (session နှင့်ချိတ်ဆက်ထားပြီး အသုံးပြုသူ၏ 👍/👎 အဆင့်သတ်မှတ်ချက်များ ပါဝင်သည်)
- agent_api_keys - ပြင်ပစနစ်များနှင့်ချိတ်ဆက်ရန် API key များ

---

## ပြင်ဆင်သတ်မှတ်ခြင်း (Configuration)

### Environment Variables

**Backend (backend/.env)**

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

## Ollama (အခမဲ့ Local LLM) အသုံးပြုခြင်း

1. **Ollama ကို Install လုပ်ပါ**
```Bash
curl [https://ollama.ai/install.sh](https://ollama.ai/install.sh) | sh
```

2. **Model ကို ဆွဲယူပါ**
```Bash
ollama pull llama3.2
```

3. **Ollama ဖြင့် agent တစ်ခုဖန်တီးပါ**
- LLM provider အဖြစ် "Ollama" ကို ရွေးပါ
- model တွင်: llama3.2 ဟု ရိုက်ထည့်ပါ
- လုံးဝ အခမဲ့ဖြစ်ပြီး မိမိစက်ထဲတွင်သာ အလုပ်လုပ်ပါသည်!

---

## ပရောဂျက် ဖွဲ့စည်းပုံ (Project Structure)
```
AgentBuilder/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth.py          # Authentication endpoints
│   │   │   ├── agents.py        # Agent management
│   │   │   ├── chat.py          # Chat + session endpoints
│   │   │   ├── knowledge.py     # File upload & management
│   │   │   ├── corrections.py   # Few-shot corrections
│   │   │   ├── api_keys.py      # API key management
│   │   │   └── public_api.py    # Public API endpoints
│   │   ├── core/
│   │   │   ├── agent_graph.py   # LangGraph agent executor (memory ပါဝင်သည်)
│   │   │   └── prompt_builder.py # Prompt builder (history ထောက်ပံ့မှုပါဝင်သည်)
│   │   ├── models/models.py     # Database models (ConversationSession ပါဝင်သည်)
│   │   ├── schemas/schemas.py   # Pydantic schemas (SessionResponse ပါဝင်သည်)
│   │   ├── services/
│   │   │   ├── llm_gateway.py   # OpenAI/Ollama gateway
│   │   │   ├── vector_store.py  # FAISS vector store
│   │   │   └── document_processor.py
│   │   └── main.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── agents/[id]/
│   │   │   │   ├── playground/  # Chat & training UI
│   │   │   │   └── api/         # API key management UI
│   │   │   └── dashboard/
│   │   ├── components/
│   │   │   ├── ChatInterface.tsx  # Memory sidebar ပါဝင်သော Chat UI
│   │   │   ├── FileUploader.tsx
│   │   │   ├── CorrectionModal.tsx
│   │   │   ├── AgentCard.tsx
│   │   │   ├── APIKeyManager.tsx  # API key UI
│   │   │   └── APIDocs.tsx        # API docs UI
│   │   └── lib/
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```
---

## ဆာဗာပေါ်တင်ခြင်း (Deployment)

### Production Checklist

- [ ] SECRET_KEY ကို ခန့်မှန်းရခက်သော string အဖြစ် ပြောင်းလဲရန်
- [ ] backend config တွင် DEBUG=False ဟု သတ်မှတ်ရန်
- [ ] Production PostgreSQL instance ကို အသုံးပြုရန်
- [ ] SSL/TLS (HTTPS) ထည့်သွင်းရန်
- [ ] docker-compose.yml တွင် CORS origins များကို သတ်မှတ်ရန်
- [ ] Database backup များကို စီစဉ်ထားရန်
- [ ] Public API အတွက် rate limiting သတ်မှတ်ရန်
- [ ] Production WSGI အတွက် Gunicorn ကို အသုံးပြုရန်

### Cloud ပေါ်တင်ခြင်း (Deploy to Cloud)

**Backend (Railway/Render/Fly.io)**

- Environment variables များကို သတ်မှတ်ပါ
- GitHub မှတစ်ဆင့် Deploy လုပ်ပါ
- PostgreSQL addon ကို ချိတ်ဆက်ထားရန် သေချာစေပါ

**Frontend (Vercel/Netlify)**

- GitHub repository ကို ချိတ်ဆက်ပါ
- NEXT_PUBLIC_API_URL ကို သင့် backend URL ဖြင့် သတ်မှတ်ပါ
- Deploy လုပ်ပါ

---
## ပြဿနာဖြေရှင်းခြင်း (Troubleshooting)

**"Database connection failed"**
- PostgreSQL စတင်ရန် စက္ကန့် ၃၀ ခန့် စောင့်ပါ
- `docker-compose restart` ကို စမ်းကြည့်ပါ

**"OpenAI API error"**
- OPENAI_API_KEY သည် sk- ဖြင့် စတင်ခြင်းရှိမရှိ စစ်ဆေးပါ
- API credits ကျန်ရှိမှု စစ်ဆေးပါ

**"Invalid API key"**
- (Public API)Key ကို မှန်ကန်စွာ ကူးယူထားခြင်းရှိမရှိ စစ်ဆေးပါ (ab_ ဖြင့် စရပါမည်)
- Key သည် active ဖြစ်နေပြီး သက်တမ်းမကုန်သေးကြောင်း သေချာစေပါ
- URL အတွင်းရှိ agent ID မှန်ကန်မှု စစ်ဆေးပါ

**"Port already in use"**
- Port 3000 သို့မဟုတ် 8000 တွင် တစ်ခုခု အလုပ်လုပ်နေပါသည်
- အခြား app များကို ရပ်ပါ သို့မဟုတ် docker-compose.yml တွင် port များကို ပြောင်းပါ

**"Ollama connection error"**

- Ollama အလုပ်လုပ်နေခြင်း ရှိမရှိ စစ်ဆေးပါ: ```ollama list```
- OLLAMA_ENDPOINT မှန်ကန်မှု စစ်ဆေးပါ

**"Agent doesn't remember previous messages"**
- Chat ဘေးဘက်ဘားရှိ 🧠 ဦးနှောက်ခလုတ်ကို ON (အဖွင့်) ထားကြောင်း သေချာစေပါ
- Chat အပေါ်ဘက်တွင် ခရမ်းရောင် "Memory active" စာသားပေါ်နေခြင်း ရှိမရှိ စစ်ဆေးပါ
- Migration လုပ်ထားခြင်းရှိမရှိ စစ်ဆေးပါ: `docker-compose exec postgres psql -U postgres -d agentbuilder -c "\dt"` — `conversation_sessions` ကို မြင်ရပါမည်

---

## ရှေ့ဆက်လုပ်ဆောင်မည့် အစီအစဉ်များ (Roadmap)

### v1.0 (Current)
- ✅ No-code agent creation
- ✅ Knowledge base uploads (PDF, TXT, CSV)
- ✅ Local FAISS vector store ဖြင့် RAG စနစ်
- ✅ Corrections နှင့် few-shot learning
- ✅ OpenAI နှင့် Ollama ကို ထောက်ပံ့မှု
- ✅ API Generator နှင့် key management
- ✅ ပြင်ပစနစ်များနှင့် ချိတ်ဆက်ရန် Public REST API
- ✅ အပြန်အလှန်အသုံးပြုနိုင်သော API documentation
- ✅ Session မှတ်တမ်းများပါဝင်သော Conversation Memory
- ✅ အရည်အသွေးကို ခြေရာခံရန် Chat Rating (👍/👎) 

### စနစ်v1.1 (Planned)
- [ ] API key တစ်ခုချင်းစီအတွက် Rate limiting ပြုလုပ်ခြင်း
- [ ] Usage analytics dashboard
- [ ] Webhook support
- [ ] Streaming API responses
- [ ] ဖိုင်များကို အများအပြား တစ်ပြိုင်တည်းတင်ခြင်း (Bulk file upload)

### v2.0 (Future)
- [ ] Agent များ အချင်းချင်း စကားပြောဆိုခြင်း (Multi-agent conversations)
- [ ] Agent marketplace
- [ ] အဖွဲ့လိုက် ပူးပေါင်းလုပ်ဆောင်ခြင်း (Team collaboration)
- [ ] Voice interface
- [ ] SDKs (Python, JavaScript)

---

## ပါဝင်ကူညီရန် (Contributing)

1. Repository ကို Fork လုပ်ပါ
2. Feature branch တစ်ခု ဖန်တီးပါ: `git checkout -b feature/amazing-feature`
3. သင်၏ ပြင်ဆင်ချက်များကို ပြုလုပ်ပါ
4. Commit လုပ်ပါ: `git commit -m 'Add amazing feature'`
5. Push လုပ်ပါ: `git push origin feature/amazing-feature`
6. Pull Request အသစ်ဖွင့်ပါ

---

## လိုင်စင် (License)

MIT License - အသေးစိတ်အတွက် LICENSE ကို ကြည့်ရှုပါ။

---

## အကူအညီရယူရန် (Support)

- **API Docs**: http://localhost:8000/docs
- **Issues**: [GitHub Issues](https://github.com/yourusername/agentbuilder/issues)
- **Discussion**: [Discussion](https://github.com/aungkaungpyaepaing/LLMAgentCreator/discussions)
- **Email**: aungkpp.dev@gmail.com

---

Acknowledgments

- [LangChain](https://langchain.com) နှင့် [LangGraph](https://github.com/langchain-ai/langgraph) တို့ဖြင့် တည်ဆောက်ထားပါသည်
- [OpenAI](https://openai.com) နှင့် [Ollama](https://ollama.ai) တို့က စွမ်းအားဖြည့်တင်းပေးထားပါသည်
- [FAISS](https://github.com/facebookresearch/faiss) ကို အသုံးပြု၍ local vector storage တည်ဆောက်ထားပါသည်
- UI component များသည် [Tailwind UI](https://tailwindui.com) မှ အတုယူထားခြင်းဖြစ်ပါသည်
