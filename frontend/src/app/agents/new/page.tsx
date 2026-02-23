'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';

// NEW: Define the shape of a Template so TypeScript knows what to expect
interface Template {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  output_template: string | null;
  llm_provider: string;
  llm_model: string;
  temperature: number;
}

export default function NewAgentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams.get('template');

  // FIXED: Tell TypeScript that this state can be a Template OR null
  const [template, setTemplate] = useState<Template | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    system_prompt: '',
    output_template: '',
    llm_provider: 'openai',
    llm_model: 'gpt-4',
    temperature: 0.7,
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (templateId) {
      fetchTemplate(templateId);
    }
  }, [templateId]);

  const fetchTemplate = async (id: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/templates`
      );
      const templates = await response.json();
      const found = templates.find((t: any) => t.id === id);

      if (found) {
        setTemplate(found);
        setFormData({
          name: '', // User must provide name
          description: found.description,
          system_prompt: found.system_prompt,
          output_template: found.output_template || '',
          llm_provider: found.llm_provider,
          llm_model: found.llm_model,
          temperature: found.temperature,
        });
      }
    } catch (err) {
      console.error('Failed to fetch template:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      const url = templateId
        ? `${process.env.NEXT_PUBLIC_API_URL}/templates/create-from-template`
        : `${process.env.NEXT_PUBLIC_API_URL}/agents`;
      const body = templateId
        ? { template_id: templateId, ...formData }
        : formData;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error('Failed to create agent');
      const agent = await response.json();
      router.push(`/agents/${agent.id}/playground`);
    } catch (err) {
      alert('Failed to create agent');
    } finally {
      setIsCreating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">
            {template ? `Create from: ${template.name}` : 'Create New Agent'}
          </h1>
          <form onSubmit={handleCreate} className="space-y-6">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Agent Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="My Support Bot"
              />
            </div>
            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="What does this agent do?"
              />
            </div>
            {/* System Prompt */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                System Prompt
              </label>
              <textarea
                value={formData.system_prompt}
                onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
                rows={8}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
                placeholder="You are a helpful assistant..."
              />
              <p className="text-xs text-gray-500 mt-1">
                Instructions for how the agent should behave
              </p>
            </div>
            {/* Output Template */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Output Template (Optional)
              </label>
              <textarea
                value={formData.output_template}
                onChange={(e) => setFormData({ ...formData, output_template: e.target.value })}
                rows={6}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
                placeholder="**Summary**: [Brief overview]&#10;**Answer**: [Detailed response]&#10;**Next Steps**: [Action items]"
              />
              <p className="text-xs text-gray-500 mt-1">
                Format for structuring agent responses
              </p>
            </div>
            {/* LLM Settings */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Provider
                </label>
                <select
                  value={formData.llm_provider}
                  onChange={(e) => setFormData({ ...formData, llm_provider: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="openai">OpenAI</option>
                  <option value="ollama">Ollama</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Model
                </label>
                <input
                  type="text"
                  value={formData.llm_model}
                  onChange={(e) => setFormData({ ...formData, llm_model: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
            {/* Temperature */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Temperature: {formData.temperature}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={formData.temperature}
                onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Focused</span>
                <span>Creative</span>
              </div>
            </div>
            {/* Buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => router.back()}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreating || !formData.name}
                className="flex-1 px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Agent'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}