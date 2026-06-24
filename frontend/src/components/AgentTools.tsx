'use client';

import { useState, useEffect } from 'react';
import { FileText, Image as ImageIcon, Plus, Trash2, Power, X, Globe, Settings } from 'lucide-react';

interface Tool {
  id: string;
  name: string;
  description: string;
  tool_type: string;
  api_url: string;
  method: string;
  request_body_template?: Record<string, string>;
  is_active: boolean;
}

interface StudioModel {
  id: string;
  label: string;
  type: 'image' | 'video' | 'speech';
  requires_image: boolean;
}

interface AgentToolsProps {
  agentId: string;
}

export default function AgentTools({ agentId }: AgentToolsProps) {
  const [tools, setTools] = useState<Tool[]>([]);
  const [imageModels, setImageModels] = useState<StudioModel[]>([]);
  const [selectedImageModel, setSelectedImageModel] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Form State for new tool
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [method, setMethod] = useState('GET');

  const builtInTools = [
    {
      tool_type: 'ai_image_generation',
      name: 'AI Image Generator',
      description: 'Generate images from chat requests using AI Studio.',
      icon: ImageIcon,
    },
    {
      tool_type: 'pdf_generator',
      name: 'PDF Generator',
      description: 'Create downloadable PDF files from chat responses.',
      icon: FileText,
    },
  ];

  useEffect(() => {
    fetchTools();
    fetchAvailableTools();
  }, [agentId]);

  const fetchAvailableTools = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/agents/${agentId}/tools/available`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) return;
      const data = await response.json();
      const imageTool = data.find((tool: any) => tool.tool_type === 'ai_image_generation');
      const models = imageTool?.models || [];
      setImageModels(models);
      if (models[0]) setSelectedImageModel((current) => current || models[0].id);
    } catch (err) {
      console.error('Failed to fetch available tools:', err);
    }
  };

  const fetchTools = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/agents/${agentId}/tools`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        setTools(data);
      }
    } catch (err) {
      console.error('Failed to fetch tools:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddTool = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/agents/${agentId}/tools`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          name,
          description,
          tool_type: 'custom_api',
          api_url: apiUrl,
          method
        }),
      });

      if (response.ok) {
        setShowAddModal(false);
        setName('');
        setDescription('');
        setApiUrl('');
        fetchTools();
      }
    } catch (err) {
      alert('Failed to add tool');
    }
  };

  const addBuiltInTool = async (toolType: string) => {
    const definition = builtInTools.find((tool) => tool.tool_type === toolType);
    if (!definition) return;

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/agents/${agentId}/tools`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          name: definition.name,
          description: definition.description,
          tool_type: definition.tool_type,
          request_body_template: toolType === 'ai_image_generation' ? { model_id: selectedImageModel || imageModels[0]?.id } : undefined,
        }),
      });

      if (!response.ok) throw new Error('Failed to add tool');
      fetchTools();
    } catch (err) {
      alert('Failed to add tool');
    }
  };

  const toggleTool = async (toolId: string) => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/agents/${agentId}/tools/${toolId}/toggle`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      fetchTools();
    } catch (err) {
      alert('Failed to toggle tool');
    }
  };

  const deleteTool = async (toolId: string) => {
    if (!confirm('Delete this tool?')) return;
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/agents/${agentId}/tools/${toolId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      fetchTools();
    } catch (err) {
      alert('Failed to delete tool');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary-500" />
            Agent Tools
          </h2>
          <p className="text-sm text-gray-600 mt-1">Enable built-in tools or connect your agent to external APIs.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Tool
        </button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        {builtInTools.map(({ tool_type, name, description, icon: Icon }) => {
          const existing = tools.find((tool) => tool.tool_type === tool_type);
          return (
            <div key={tool_type} className="rounded-lg border border-gray-200 p-4">
              <div className="mb-3 flex items-start gap-3">
                <Icon className="mt-0.5 h-5 w-5 text-primary-500" />
                <div>
                  <h3 className="font-semibold text-gray-900">{name}</h3>
                  <p className="mt-1 text-sm text-gray-600">{description}</p>
                </div>
              </div>
              {tool_type === 'ai_image_generation' && !existing && (
                <select
                  value={selectedImageModel}
                  onChange={(event) => setSelectedImageModel(event.target.value)}
                  className="mb-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {imageModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
                </select>
              )}
              {existing ? (
                <button
                  onClick={() => toggleTool(existing.id)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium ${
                    existing.is_active
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {existing.is_active ? 'Enabled' : 'Disabled'}
                </button>
              ) : (
                <button
                  onClick={() => addBuiltInTool(tool_type)}
                  className="rounded-lg bg-primary-500 px-3 py-2 text-sm font-medium text-white hover:bg-primary-600"
                >
                  Enable
                </button>
              )}
            </div>
          );
        })}
      </div>

      {isLoading ? (
        <div className="text-center py-6">Loading tools...</div>
      ) : tools.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
          <Globe className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No tools configured</p>
          <p className="text-sm text-gray-400">Add tools to let your agent interact with external services.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tools.map((tool) => (
            <div key={tool.id} className={`border rounded-lg p-4 transition-all ${tool.is_active ? 'border-green-200 bg-green-50' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900">{tool.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${tool.is_active ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-600'}`}>
                      {tool.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{tool.description}</p>
                  {tool.tool_type === 'custom_api' ? (
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-500">{tool.method} {tool.api_url}</code>
                  ) : (
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-500">
                      {tool.tool_type}
                      {tool.tool_type === 'ai_image_generation' && tool.request_body_template?.model_id
                        ? ` / ${tool.request_body_template.model_id}`
                        : ''}
                    </code>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleTool(tool.id)} className="p-2 text-gray-500 hover:text-primary-600 rounded-lg hover:bg-white transition-colors" title="Toggle Status">
                    <Power className="w-4 h-4" />
                  </button>
                  <button onClick={() => deleteTool(tool.id)} className="p-2 text-red-400 hover:text-red-600 rounded-lg hover:bg-white transition-colors" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal for adding new tool */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Add Custom API Tool</h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleAddTool} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tool Name (no spaces)</label>
                <input required type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="get_inventory" className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-primary-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Check stock for products" className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-primary-500 outline-none" rows={2} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API URL</label>
                <input required type="url" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://api.example.com/v1/data" className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-primary-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Method</label>
                <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-primary-500 outline-none">
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors">Save Tool</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
