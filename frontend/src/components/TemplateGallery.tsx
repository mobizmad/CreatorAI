'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2,
  Sparkles,
  Search,
  ArrowLeft, // NEW: Imported the ArrowLeft icon
} from 'lucide-react';

interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  system_prompt: string;
  output_template: string | null;
  usage_count: number;
}

export default function TemplateGallery() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);

  const categories = [
    { id: 'support', name: 'Customer Support', icon: '📞' },
    { id: 'hr', name: 'HR & Benefits', icon: '📚' },
    { id: 'education', name: 'Education', icon: '📖' },
    { id: 'ecommerce', name: 'E-commerce', icon: '🛒' },
    { id: 'finance', name: 'Finance', icon: '🏦' },
    { id: 'restaurant', name: 'Restaurant', icon: '🍕' },
    { id: 'it', name: 'IT Helpdesk', icon: '💻' },
    { id: 'legal', name: 'Legal', icon: '⚖️' },
  ];

  useEffect(() => {
    fetchTemplates();
  }, [selectedCategory]);

  const fetchTemplates = async () => {
    setIsLoading(true);
    try {
      const url = selectedCategory
        ? `${process.env.NEXT_PUBLIC_API_URL}/templates?category=${selectedCategory}`
        : `${process.env.NEXT_PUBLIC_API_URL}/templates`;

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setTemplates(data);
      }
    } catch (err) {
      console.error('Failed to fetch templates:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredTemplates = templates.filter((template) =>
    template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    template.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleUseTemplate = (template: Template) => {
    // Navigate to agent creation page with template pre-filled
    router.push(`/agents/new?template=${template.id}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* NEW: Replaced the old div with the Playground-style header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Choose a Template</h1>
              <p className="text-sm text-gray-600">
                Start with a pre-configured agent or create from scratch
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {/* Search and Filter */}
        <div className="mb-6 flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <button
            onClick={() => router.push('/agents/new')}
            className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2 font-medium"
          >
            <Sparkles className="w-4 h-4" />
            Start from Scratch
          </button>
        </div>

        {/* Category Filter */}
        <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
              selectedCategory === null
                ? 'bg-primary-500 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            All Categories
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap flex items-center gap-2 ${
                selectedCategory === cat.id
                  ? 'bg-primary-500 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              <span>{cat.icon}</span>
              {cat.name}
            </button>
          ))}
        </div>

        {/* Templates Grid */}
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTemplates.map((template) => (
              <div
                key={template.id}
                className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow cursor-pointer flex flex-col h-full"
                onClick={() => setSelectedTemplate(template)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="text-4xl">{template.icon}</div>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                    Used {template.usage_count}x
                  </span>
                </div>

                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  {template.name}
                </h3>
                <p className="text-sm text-gray-600 mb-6 line-clamp-3 flex-1">
                  {template.description}
                </p>

                <div className="flex gap-2 mt-auto">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUseTemplate(template);
                    }}
                    className="flex-1 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 text-sm font-medium transition-colors"
                  >
                    Use Template
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedTemplate(template);
                    }}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors"
                  >
                    Preview
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Preview Modal */}
        {selectedTemplate && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setSelectedTemplate(null)}
          >
            <div
              className="bg-white rounded-lg max-w-3xl w-full max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="text-4xl">{selectedTemplate.icon}</div>
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900">
                        {selectedTemplate.name}
                      </h2>
                      <p className="text-sm text-gray-600 font-medium text-primary-600">
                        {selectedTemplate.category.charAt(0).toUpperCase() + selectedTemplate.category.slice(1)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedTemplate(null)}
                    className="text-gray-400 hover:text-gray-600 p-1"
                  >
                    ✕
                  </button>
                </div>

                <p className="text-gray-700 mb-6 text-base">{selectedTemplate.description}</p>

                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary-500" />
                      System Prompt
                    </h3>
                    <pre className="bg-gray-50 p-4 rounded-lg text-sm text-gray-700 whitespace-pre-wrap border border-gray-100 font-mono">
                      {selectedTemplate.system_prompt}
                    </pre>
                  </div>

                  {selectedTemplate.output_template && (
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                        <Loader2 className="w-4 h-4 text-primary-500" />
                        Output Template
                      </h3>
                      <pre className="bg-gray-50 p-4 rounded-lg text-sm text-gray-700 whitespace-pre-wrap border border-gray-100 font-mono">
                        {selectedTemplate.output_template}
                      </pre>
                    </div>
                  )}
                </div>

                <div className="mt-8 flex gap-3 pt-6 border-t border-gray-100">
                  <button
                    onClick={() => handleUseTemplate(selectedTemplate)}
                    className="flex-1 px-6 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 font-medium transition-colors"
                  >
                    Use This Template
                  </button>
                  <button
                    onClick={() => setSelectedTemplate(null)}
                    className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}