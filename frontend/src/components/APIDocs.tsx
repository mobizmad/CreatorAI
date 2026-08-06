'use client';

import { useState } from 'react';
import { Copy, CheckCircle, Code, Terminal } from 'lucide-react';

interface APIDocsProps {
  agentId: string;
  agentName: string;
}

export default function APIDocs({ agentId, agentName }: APIDocsProps) {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<'curl' | 'python' | 'javascript'>('curl');

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';
  const baseUrl = apiUrl.replace('/agents', '');

  const copyToClipboard = (text: string, section: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const codeExamples = {
    curl: `# Chat with your agent
curl -X POST "${apiUrl}/v1/agents/${agentId}/chat" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY_HERE" \\
  -d '{
    "message": "Hello! What can you help me with?",
    "stream": false
  }'

# Get agent info
curl -X GET "${apiUrl}/v1/agents/${agentId}/info" \\
  -H "X-API-Key: YOUR_API_KEY_HERE"`,

    python: `import requests

# Configuration
API_URL = "${apiUrl}/v1"
AGENT_ID = "${agentId}"
API_KEY = "YOUR_API_KEY_HERE"

headers = {
    "Content-Type": "application/json",
    "X-API-Key": API_KEY
}

# Chat with agent
def chat(message: str) -> dict:
    response = requests.post(
        f"{API_URL}/agents/{AGENT_ID}/chat",
        headers=headers,
        json={
            "message": message,
            "stream": False
        }
    )
    response.raise_for_status()
    return response.json()

# Example usage
result = chat("What can you help me with?")
print(f"Response: {result['response']}")
print(f"Sources: {result['sources']}")

# Get agent info
def get_agent_info() -> dict:
    response = requests.get(
        f"{API_URL}/agents/{AGENT_ID}/info",
        headers=headers
    )
    response.raise_for_status()
    return response.json()

info = get_agent_info()
print(f"Agent: {info['name']}")`,

    javascript: `// Configuration
const API_URL = "${apiUrl}/v1";
const AGENT_ID = "${agentId}";
const API_KEY = "YOUR_API_KEY_HERE";

const headers = {
  "Content-Type": "application/json",
  "X-API-Key": API_KEY
};

// Chat with agent
async function chat(message) {
  const response = await fetch(\`\${API_URL}/agents/\${AGENT_ID}/chat\`, {
    method: "POST",
    headers: headers,
    body: JSON.stringify({
      message: message,
      stream: false
    })
  });
  
  if (!response.ok) {
    throw new Error(\`HTTP error! status: \${response.status}\`);
  }
  
  return await response.json();
}

// Example usage
chat("What can you help me with?")
  .then(result => {
    console.log("Response:", result.response);
    console.log("Sources:", result.sources);
  })
  .catch(error => {
    console.error("Error:", error);
  });

// Get agent info
async function getAgentInfo() {
  const response = await fetch(\`\${API_URL}/agents/\${AGENT_ID}/info\`, {
    headers: headers
  });
  
  if (!response.ok) {
    throw new Error(\`HTTP error! status: \${response.status}\`);
  }
  
  return await response.json();
}

getAgentInfo()
  .then(info => {
    console.log("Agent:", info.name);
  });`
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">API Documentation</h2>
        <p className="text-gray-600 mt-1">
          Integrate <strong>{agentName}</strong> into your applications
        </p>
      </div>

      {/* Base URL */}
      <div className="bg-white border rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Terminal className="w-5 h-5" />
          Base URL
        </h3>
        <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-between">
          <code className="text-sm font-mono">{apiUrl}/v1</code>
          <button
            onClick={() => copyToClipboard(`${apiUrl}/v1`, 'base-url')}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            {copiedSection === 'base-url' ? (
              <CheckCircle className="w-5 h-5 text-green-500" />
            ) : (
              <Copy className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Authentication */}
      <div className="bg-white border rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Authentication
        </h3>
        <p className="text-gray-600 mb-4">
          All API requests require authentication using an API key in the header:
        </p>
        <div className="bg-gray-50 rounded-lg p-4">
          <code className="text-sm font-mono">X-API-Key: YOUR_API_KEY_HERE</code>
        </div>
      </div>

      {/* Endpoints */}
      <div className="bg-white border rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Endpoints</h3>

        <div className="space-y-6">
          {/* POST /chat */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="px-2 py-1 bg-green-100 text-green-800 text-sm font-semibold rounded">
                POST
              </span>
              <code className="text-sm font-mono">/agents/{agentId}/chat</code>
            </div>
            <p className="text-gray-600 mb-3">Send a message to your agent</p>
            
            <div className="bg-gray-50 rounded-lg p-4 mb-3">
              <p className="text-sm font-semibold text-gray-700 mb-2">Request Body:</p>
              <pre className="text-sm font-mono overflow-x-auto">
{`{
  "message": "Your question here",
  "stream": false
}`}
              </pre>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm font-semibold text-gray-700 mb-2">Response:</p>
              <pre className="text-sm font-mono overflow-x-auto">
{`{
  "response": "Agent's response text",
  "sources": [
    {
      "text": "Relevant excerpt...",
      "source": "document.pdf"
    }
  ],
  "agent_name": "${agentName}"
}`}
              </pre>
            </div>
          </div>

          {/* GET /info */}
          <div className="pt-6 border-t">
            <div className="flex items-center gap-3 mb-3">
              <span className="px-2 py-1 bg-blue-100 text-blue-800 text-sm font-semibold rounded">
                GET
              </span>
              <code className="text-sm font-mono">/agents/{agentId}/info</code>
            </div>
            <p className="text-gray-600 mb-3">Get agent information</p>
            
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm font-semibold text-gray-700 mb-2">Response:</p>
              <pre className="text-sm font-mono overflow-x-auto">
{`{
  "id": "${agentId}",
  "name": "${agentName}",
  "description": "...",
  "llm_provider": "openai",
  "llm_model": "gpt-4",
  "created_at": "2024-01-01T00:00:00"
}`}
              </pre>
            </div>
          </div>
        </div>
      </div>

      {/* Code Examples */}
      <div className="bg-white border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Code className="w-5 h-5" />
            Code Examples
          </h3>
          <div className="flex gap-2">
            {(['curl', 'python', 'javascript'] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => setSelectedLanguage(lang)}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  selectedLanguage === lang
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {lang === 'curl' ? 'cURL' : lang.charAt(0).toUpperCase() + lang.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="relative">
          <button
            onClick={() => copyToClipboard(codeExamples[selectedLanguage], 'code')}
            className="absolute top-3 right-3 p-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
          >
            {copiedSection === 'code' ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <Copy className="w-5 h-5" />
            )}
          </button>
          <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm">
            <code>{codeExamples[selectedLanguage]}</code>
          </pre>
        </div>
      </div>

      {/* Error Codes */}
      <div className="bg-white border rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Error Codes</h3>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <code className="px-2 py-1 bg-red-100 text-red-800 text-sm font-semibold rounded">
              401
            </code>
            <div>
              <p className="font-medium text-gray-900">Unauthorized</p>
              <p className="text-sm text-gray-600">Invalid or missing API key</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <code className="px-2 py-1 bg-red-100 text-red-800 text-sm font-semibold rounded">
              404
            </code>
            <div>
              <p className="font-medium text-gray-900">Not Found</p>
              <p className="text-sm text-gray-600">Agent not found</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <code className="px-2 py-1 bg-red-100 text-red-800 text-sm font-semibold rounded">
              500
            </code>
            <div>
              <p className="font-medium text-gray-900">Internal Server Error</p>
              <p className="text-sm text-gray-600">Error processing request</p>
            </div>
          </div>
        </div>
      </div>

      {/* Rate Limiting */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">
          💡 Rate Limiting
        </h3>
        <p className="text-blue-800 text-sm">
          Rate limiting is currently not enforced. This feature will be added in a future update based on your subscription plan.
        </p>
      </div>
    </div>
  );
}
