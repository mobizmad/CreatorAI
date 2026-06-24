'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Clock3,
  Download,
  ExternalLink,
  Heart,
  History,
  Image as ImageIcon,
  Loader2,
  Lock,
  Music,
  Play,
  SlidersHorizontal,
  Sparkles,
  UserCircle,
  Wand2,
  X,
} from 'lucide-react';

type StudioType = 'image' | 'video' | 'speech';
type StudioTab = 'create' | 'history' | 'templates';
type TemplateSort = 'popular' | 'latest';

interface StudioModel {
  id: string;
  label: string;
  type: StudioType;
  mode: 'text-to-image' | 'image-edit' | 'text-to-video' | 'image-to-video' | 'text-to-speech' | 'local-text-to-image';
  requires_image: boolean;
  price_label?: string;
  price_note?: string;
  options?: Record<string, string[]>;
  defaults?: Record<string, string>;
  supports_prompt_adherence?: boolean;
  supports_generate_audio?: boolean;
}

interface StudioMedia {
  type: 'image' | 'video' | 'audio' | 'file';
  url: string;
  content_type?: string;
  width?: number;
  height?: number;
}

interface StudioGeneration {
  id: string;
  model_id: string;
  type: StudioType;
  prompt: string;
  quality?: string;
  source_image_url?: string;
  request_id?: string;
  result: Record<string, any>;
  media: StudioMedia[];
  visibility: 'private' | 'public';
  creator_email: string;
  creator_name?: string;
  creator_username?: string;
  user_name?: string;
  username?: string;
  created_at: string;
  published_at?: string;
  like_count: number;
  liked_by_me: boolean;
}

interface StudioGenerationJob {
  job_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  message?: string;
  generation?: StudioGeneration | null;
  error?: string | null;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'https://aicreateback.ibechamp.com';

function getErrorMessage(detail: any, fallback: string) {
  if (!detail) return fallback;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => item?.msg || item?.message || JSON.stringify(item))
      .filter(Boolean)
      .join(', ');
  }
  return detail.message || JSON.stringify(detail);
}

function modelOptionLabel(model: StudioModel) {
  return model.price_label ? `${model.label} - ${model.price_label}` : model.label;
}

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image dimensions.'));
    };
    image.src = url;
  });
}

export default function AIStudio() {
  const [activeTab, setActiveTab] = useState<StudioTab>('create');
  const [models, setModels] = useState<StudioModel[]>([]);
  const [historyItems, setHistoryItems] = useState<StudioGeneration[]>([]);
  const [templateItems, setTemplateItems] = useState<StudioGeneration[]>([]);
  const [templateSort, setTemplateSort] = useState<TemplateSort>('popular');
  const [selectedType, setSelectedType] = useState<StudioType>('image');
  const [selectedModelId, setSelectedModelId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [quality, setQuality] = useState('medium');
  const [imageSize, setImageSize] = useState('landscape_4_3');
  const [imageAspectRatio, setImageAspectRatio] = useState('1:1');
  const [imageResolution, setImageResolution] = useState('768');
  const [promptAdherence, setPromptAdherence] = useState<'relaxed' | 'balanced' | 'strict'>('strict');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [resolution, setResolution] = useState('720p');
  const [duration, setDuration] = useState('5');
  const [generateAudio, setGenerateAudio] = useState(true);
  const [voice, setVoice] = useState('');
  const [seed, setSeed] = useState('');
  const [result, setResult] = useState<StudioGeneration | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingLists, setIsLoadingLists] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generationStatusMessage, setGenerationStatusMessage] = useState('');

  const filteredModels = useMemo(
    () => models.filter((model) => model.type === selectedType),
    [models, selectedType]
  );

  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) || filteredModels[0],
    [models, filteredModels, selectedModelId]
  );

  const modelLabelById = useMemo(
    () => new Map(models.map((model) => [model.id, model.label])),
    [models]
  );

  const sortedTemplateItems = useMemo(
    () => sortTemplateItems(templateItems, templateSort),
    [templateItems, templateSort]
  );

  useEffect(() => {
    loadModels();
    loadStudioLists();
  }, []);

  useEffect(() => {
    if (!filteredModels.some((model) => model.id === selectedModelId)) {
      setSelectedModelId(filteredModels[0]?.id || '');
    }
  }, [filteredModels, selectedModelId]);

  useEffect(() => {
    if (!selectedModel) return;
    const options = selectedModel.options || {};
    const defaults = selectedModel.defaults || {};

    if (options.qualities?.length) setQuality(defaults.quality || options.qualities[0]);
    if (options.image_sizes?.length) setImageSize(defaults.image_size || options.image_sizes[0]);
    if (options.aspect_ratios?.length) {
      const nextAspect = defaults.aspect_ratio || options.aspect_ratios[0];
      if (selectedModel.type === 'image') setImageAspectRatio(nextAspect);
      if (selectedModel.type === 'video') setAspectRatio(nextAspect);
    }
    if (options.resolutions?.length) {
      const nextResolution = defaults.resolution || options.resolutions[0];
      if (selectedModel.type === 'image') setImageResolution(nextResolution);
      if (selectedModel.type === 'video') setResolution(nextResolution);
    }
    if (options.durations?.length) setDuration(defaults.duration || options.durations[0]);
    if (selectedModel.supports_generate_audio) setGenerateAudio(true);
  }, [selectedModel?.id]);

  const authHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  });

  const loadModels = async () => {
    try {
      const response = await fetch(`${API}/ai-studio/models`, { headers: authHeaders() });
      if (!response.ok) throw new Error('Failed to load AI Studio models');
      setModels(await response.json());
    } catch (err) {
      console.error(err);
      setError('Failed to load AI Studio models.');
    }
  };

  const loadStudioLists = async () => {
    setIsLoadingLists(true);
    try {
      const [historyRes, templatesRes] = await Promise.all([
        fetch(`${API}/ai-studio/history`, { headers: authHeaders() }),
        fetch(`${API}/ai-studio/templates`, { headers: authHeaders() }),
      ]);

      if (historyRes.ok) setHistoryItems(await historyRes.json());
      if (templatesRes.ok) setTemplateItems(await templatesRes.json());
    } finally {
      setIsLoadingLists(false);
    }
  };

  const handleImageUpload = async () => {
    if (!selectedFile || isUploadingImage) return;

    setIsUploadingImage(true);
    setError(null);

    try {
      const dimensions = await readImageDimensions(selectedFile);
      if (dimensions.width < 300 || dimensions.height < 300) {
        throw new Error(`Image is ${dimensions.width}x${dimensions.height}px. Fal requires at least 300x300px for source images.`);
      }

      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch(`${API}/ai-studio/upload-image`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(data.detail, 'Upload failed'));
      setImageUrl(data.url);
    } catch (err: any) {
      setError(err.message || 'Upload failed.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const pollGenerationJob = async (jobId: string): Promise<StudioGeneration> => {
    for (let attempt = 0; attempt < 360; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 1500 : 5000));

      const response = await fetch(`${API}/ai-studio/generate-jobs/${jobId}`, { headers: authHeaders() });
      const data: StudioGenerationJob = await response.json();
      if (!response.ok) throw new Error(getErrorMessage((data as any).detail, 'Failed to check generation status'));

      if (data.status === 'completed' && data.generation) {
        return data.generation;
      }

      if (data.status === 'failed') {
        throw new Error(data.error || 'Generation failed.');
      }

      setGenerationStatusMessage(data.status === 'running' ? 'Generating media...' : 'Queued for generation...');
    }

    throw new Error('Generation is still running. Check History in a few minutes.');
  };

  const handleGenerate = async () => {
    if (!selectedModel || !prompt.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);
    setResult(null);
    setGenerationStatusMessage('Starting generation...');

    try {
      const response = await fetch(`${API}/ai-studio/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({
          model_id: selectedModel.id,
          prompt,
          image_url: imageUrl || undefined,
          quality,
          image_size: selectedType === 'image' ? imageSize : undefined,
          aspect_ratio: selectedType === 'image' ? imageAspectRatio : selectedType === 'video' ? aspectRatio : undefined,
          resolution: selectedType === 'image' ? imageResolution : selectedType === 'video' ? resolution : undefined,
          duration: selectedType === 'video' ? duration : undefined,
          generate_audio: selectedType === 'video' ? generateAudio : undefined,
          voice: selectedType === 'speech' ? voice || undefined : undefined,
          seed: seed ? Number(seed) : undefined,
          prompt_adherence: selectedType === 'image' ? promptAdherence : undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(data.detail, 'Generation failed'));

      const completedGeneration = data.job_id ? await pollGenerationJob(data.job_id) : data;
      setResult(completedGeneration);
      await loadStudioLists();
    } catch (err: any) {
      setError(err.message || 'Generation failed.');
    } finally {
      setIsLoading(false);
      setGenerationStatusMessage('');
    }
  };

  const updateVisibility = async (generationId: string, visibility: 'private' | 'public') => {
    const response = await fetch(`${API}/ai-studio/generations/${generationId}/visibility`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify({ visibility }),
    });

    if (!response.ok) return;
    await loadStudioLists();
  };

  const toggleLike = async (generationId: string) => {
    const response = await fetch(`${API}/ai-studio/generations/${generationId}/like`, {
      method: 'POST',
      headers: authHeaders(),
    });

    if (!response.ok) return;
    const updated = await response.json();
    setTemplateItems((items) =>
      items.map((item) => (item.id === generationId ? updated : item))
    );
  };

  const typeIcon = {
    image: ImageIcon,
    video: Play,
    speech: Music,
  }[selectedType];

  const ActiveIcon = typeIcon;
  const selectedOptions = selectedModel?.options || {};
  const hasImageControls =
    selectedType === 'image' &&
    Boolean(
      selectedOptions.image_sizes?.length ||
        selectedOptions.aspect_ratios?.length ||
        selectedOptions.resolutions?.length ||
        selectedModel?.supports_prompt_adherence
    );
  const hasVideoControls =
    selectedType === 'video' &&
    Boolean(
      selectedOptions.aspect_ratios?.length ||
        selectedOptions.resolutions?.length ||
        selectedOptions.durations?.length ||
        selectedModel?.supports_generate_audio
    );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI Studio</h1>
            <p className="mt-1 text-gray-600">Generate, save, publish, and remix creative AI outputs.</p>
          </div>
          <div className="flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
            {[
              { id: 'create', label: 'Create', icon: Wand2 },
              { id: 'history', label: 'History', icon: History },
              { id: 'templates', label: 'Templates', icon: Sparkles },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id as StudioTab)}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === id ? 'bg-primary-500 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'create' && (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
            <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-5 grid grid-cols-3 gap-2">
                {(['image', 'video', 'speech'] as StudioType[]).map((type) => {
                  const Icon = type === 'image' ? ImageIcon : type === 'video' ? Play : Music;
                  return (
                    <button
                      key={type}
                      onClick={() => setSelectedType(type)}
                      className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-colors ${
                        selectedType === type
                          ? 'border-primary-500 bg-primary-500 text-white'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {type}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Model</label>
                  <select
                    value={selectedModel?.id || ''}
                    onChange={(event) => setSelectedModelId(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {filteredModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {modelOptionLabel(model)}
                      </option>
                    ))}
                  </select>
                  {selectedModel?.price_label && (
                    <p className="mt-1 text-xs text-gray-500">
                      {selectedModel.price_label}
                      {selectedModel.price_note ? ` - ${selectedModel.price_note}` : ''}
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {selectedType === 'speech' ? 'Text' : 'Prompt'}
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    rows={7}
                    placeholder={selectedType === 'speech' ? 'Type the speech text...' : 'Describe what you want to create...'}
                    className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                {selectedModel?.requires_image && (
                  <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Source Image URL</label>
                      <input
                        value={imageUrl}
                        onChange={(event) => setImageUrl(event.target.value)}
                        placeholder="https://..."
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Or Upload Image</label>
                      <div className="flex gap-2">
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                          className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                        />
                        <button
                          type="button"
                          onClick={handleImageUpload}
                          disabled={!selectedFile || isUploadingImage}
                          className="shrink-0 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isUploadingImage ? 'Uploading...' : 'Upload'}
                        </button>
                      </div>
                    </div>
                    {imageUrl && (
                      <div className="rounded-lg border border-gray-200 bg-white p-2">
                        <p className="mb-2 truncate text-xs text-gray-500">{imageUrl}</p>
                        <img src={imageUrl} alt="Source preview" className="max-h-40 w-full rounded object-contain" />
                      </div>
                    )}
                  </div>
                )}

                {hasImageControls && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {selectedOptions.image_sizes?.length ? (
                      <SelectField label="Size" value={imageSize} onChange={setImageSize} options={selectedOptions.image_sizes} />
                    ) : null}
                    {selectedOptions.aspect_ratios?.length ? (
                      <SelectField label="Aspect" value={imageAspectRatio} onChange={setImageAspectRatio} options={selectedOptions.aspect_ratios} />
                    ) : null}
                    {selectedOptions.resolutions?.length ? (
                      <SelectField label="Resolution" value={imageResolution} onChange={setImageResolution} options={selectedOptions.resolutions} />
                    ) : null}
                    {selectedModel?.supports_prompt_adherence ? (
                      <SelectField label="Prompt Match" value={promptAdherence} onChange={(value) => setPromptAdherence(value as 'relaxed' | 'balanced' | 'strict')} options={['strict', 'balanced', 'relaxed']} />
                    ) : null}
                  </div>
                )}

                {hasVideoControls && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {selectedOptions.aspect_ratios?.length ? (
                      <SelectField label="Aspect" value={aspectRatio} onChange={setAspectRatio} options={selectedOptions.aspect_ratios} />
                    ) : null}
                    {selectedOptions.resolutions?.length ? (
                      <SelectField label="Resolution" value={resolution} onChange={setResolution} options={selectedOptions.resolutions} />
                    ) : null}
                    {selectedOptions.durations?.length ? (
                      <SelectField label="Duration" value={duration} onChange={setDuration} options={selectedOptions.durations} />
                    ) : null}
                    {selectedModel?.supports_generate_audio ? (
                      <label className="flex min-h-[58px] items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={generateAudio}
                          onChange={(event) => setGenerateAudio(event.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                        />
                        Generate audio
                      </label>
                    ) : null}
                  </div>
                )}

                {selectedType === 'speech' && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Voice</label>
                    <input
                      value={voice}
                      onChange={(event) => setVoice(event.target.value)}
                      placeholder="Optional voice name"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                )}

                {selectedOptions.qualities?.length ? (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Quality</label>
                    <select
                      value={quality}
                      onChange={(event) => setQuality(event.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      {selectedOptions.qualities.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Seed</label>
                  <div className="flex gap-2">
                    <input
                      value={seed}
                      onChange={(event) => setSeed(event.target.value.replace(/[^\d]/g, ''))}
                      placeholder="Optional"
                      className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <button
                      type="button"
                      title="A seed is a number that helps make generation more repeatable. Reuse the same prompt, model, settings, and seed to get more similar outputs."
                      className="h-10 w-10 shrink-0 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-600 hover:bg-gray-50"
                    >
                      ?
                    </button>
                  </div>
                </div>

                {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

                <button
                  onClick={handleGenerate}
                  disabled={isLoading || !prompt.trim() || !selectedModel}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  {isLoading ? 'Generating...' : 'Generate'}
                </button>
              </div>
            </section>

            <section className="min-h-[620px] rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              {!result && !isLoading && (
                <div className="flex h-full min-h-[540px] flex-col items-center justify-center text-center text-gray-400">
                  <ActiveIcon className="mb-3 h-12 w-12" />
                  <p className="text-sm">Your output will appear here and be saved to History as private.</p>
                </div>
              )}

              {isLoading && (
                <div className="flex h-full min-h-[540px] flex-col items-center justify-center text-center text-gray-500">
                  <Loader2 className="mb-3 h-10 w-10 animate-spin text-primary-500" />
                  <p className="text-sm">{generationStatusMessage || 'Generation is running in the background.'}</p>
                </div>
              )}

              {result && (
                <GenerationCard
                  item={result}
                  modelLabelById={modelLabelById}
                  onPublish={(visibility) => updateVisibility(result.id, visibility)}
                  showOwnerControls
                />
              )}
            </section>
          </div>
        )}

        {activeTab === 'history' && (
          <GenerationGrid
            items={historyItems}
            isLoading={isLoadingLists}
            emptyText="No AI Studio history yet."
            modelLabelById={modelLabelById}
            onPublish={updateVisibility}
            showOwnerControls
          />
        )}

        {activeTab === 'templates' && (
          <TemplateMasonryGallery
            items={sortedTemplateItems}
            isLoading={isLoadingLists}
            emptyText="No published templates yet."
            sort={templateSort}
            onSortChange={setTemplateSort}
            modelLabelById={modelLabelById}
            onLike={toggleLike}
          />
        )}
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </div>
  );
}

function TemplateMasonryGallery({
  items,
  isLoading,
  emptyText,
  sort,
  onSortChange,
  modelLabelById,
  onLike,
}: {
  items: StudioGeneration[];
  isLoading: boolean;
  emptyText: string;
  sort: TemplateSort;
  onSortChange: (sort: TemplateSort) => void;
  modelLabelById?: ReadonlyMap<string, string>;
  onLike?: (generationId: string) => void;
}) {
  const [selectedItem, setSelectedItem] = useState<StudioGeneration | null>(null);
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0);

  useEffect(() => {
    if (!selectedItem) return;
    const updatedItem = items.find((item) => item.id === selectedItem.id);
    if (updatedItem) {
      setSelectedItem(updatedItem);
      return;
    }
    setSelectedItem(null);
  }, [items, selectedItem?.id]);

  const openDetails = (item: StudioGeneration, mediaIndex = 0) => {
    setSelectedItem(item);
    setSelectedMediaIndex(mediaIndex);
  };

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Template Gallery</h2>
          <p className="mt-1 text-sm text-gray-500">
            {isLoading ? 'Loading published templates...' : `${items.length} published templates`}
          </p>
        </div>
        <div className="inline-flex w-full rounded-lg border border-gray-200 bg-white p-1 shadow-sm sm:w-auto">
          {([
            { id: 'popular', label: 'Popular', icon: Heart },
            { id: 'latest', label: 'Latest', icon: Clock3 },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onSortChange(id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors sm:flex-none ${
                sort === id ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white py-16 text-center text-gray-500">
          {emptyText}
        </div>
      ) : (
        <div className="columns-1 gap-5 sm:columns-2 xl:columns-3 2xl:columns-4">
          {items.map((item, index) => (
            <TemplateMasonryCard
              key={item.id}
              item={item}
              index={index}
              modelLabelById={modelLabelById}
              onOpen={openDetails}
              onLike={() => onLike?.(item.id)}
            />
          ))}
        </div>
      )}

      {selectedItem && (
        <GenerationDetailModal
          item={selectedItem}
          mediaIndex={selectedMediaIndex}
          onMediaIndexChange={setSelectedMediaIndex}
          onClose={() => setSelectedItem(null)}
          modelLabelById={modelLabelById}
          onLike={() => onLike?.(selectedItem.id)}
        />
      )}
    </>
  );
}

function TemplateMasonryCard({
  item,
  index,
  modelLabelById,
  onOpen,
  onLike,
}: {
  item: StudioGeneration;
  index: number;
  modelLabelById?: ReadonlyMap<string, string>;
  onOpen: (item: StudioGeneration, mediaIndex?: number) => void;
  onLike?: () => void;
}) {
  const mediaItems = getGenerationMedia(item);
  const mediaIndex = getPrimaryMediaIndex(mediaItems);
  const media = mediaIndex >= 0 ? mediaItems[mediaIndex] : null;

  return (
    <article className="mb-5 break-inside-avoid overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      {media ? (
        <button
          type="button"
          onClick={() => onOpen(item, mediaIndex)}
          className="group relative block w-full overflow-hidden bg-gray-100 text-left"
          style={{ aspectRatio: getMasonryAspectRatio(media, index) }}
          aria-label="Open template details"
        >
          <MasonryMedia media={media} />
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-xs font-medium capitalize text-gray-700 shadow-sm backdrop-blur">
            {media.type === 'video' ? <Play className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
            {item.type}
          </span>
          {media.type === 'video' && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/10 opacity-90 transition-opacity group-hover:opacity-100">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-gray-900 shadow">
                <Play className="h-5 w-5 fill-gray-900" />
              </span>
            </span>
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onOpen(item, 0)}
          className="block w-full bg-gray-100 text-left"
          style={{ aspectRatio: '4 / 3' }}
          aria-label="Open template details"
        >
          <GenerationMediaPlaceholder item={item} compact />
        </button>
      )}

      <div className="space-y-3 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-gray-900">
              {getModelDisplayName(item.model_id, modelLabelById)}
            </h3>
            <p className="mt-1 truncate text-xs text-gray-500">Generated by {getCreatorName(item)}</p>
          </div>
          <button
            type="button"
            onClick={onLike}
            className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium transition-colors ${
              item.liked_by_me
                ? 'border-red-200 bg-red-50 text-red-600'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
            aria-label="Like template"
          >
            <Heart className={`h-3.5 w-3.5 ${item.liked_by_me ? 'fill-red-500' : ''}`} />
            {item.like_count}
          </button>
        </div>

        <p className="line-clamp-3 text-sm leading-5 text-gray-700">{item.prompt}</p>

        <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-3 text-xs text-gray-500">
          <span className="inline-flex min-w-0 items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{formatShortDate(item.published_at || item.created_at)}</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gray-100 px-2 py-1 capitalize text-gray-600">
            <SlidersHorizontal className="h-3 w-3" />
            {mediaItems.length || 1}
          </span>
        </div>
      </div>
    </article>
  );
}

function GenerationDetailModal({
  item,
  mediaIndex,
  onMediaIndexChange,
  onClose,
  modelLabelById,
  onLike,
}: {
  item: StudioGeneration;
  mediaIndex: number;
  onMediaIndexChange: (index: number) => void;
  onClose: () => void;
  modelLabelById?: ReadonlyMap<string, string>;
  onLike?: () => void;
}) {
  const mediaItems = getGenerationMedia(item);
  const safeMediaIndex = mediaItems[mediaIndex] ? mediaIndex : 0;
  const selectedMedia = mediaItems[safeMediaIndex] || null;
  const details = getGenerationDetails(item, selectedMedia, modelLabelById);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-gray-950/75 p-3 backdrop-blur-sm sm:p-5"
      onClick={onClose}
    >
      <div
        className="mx-auto flex max-h-[calc(100vh-1.5rem)] max-w-6xl overflow-hidden rounded-lg bg-white shadow-2xl sm:max-h-[calc(100vh-2.5rem)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="grid w-full lg:grid-cols-[minmax(0,1.4fr)_390px]">
          <div className="relative flex min-h-[320px] items-center justify-center bg-gray-950 p-3 sm:min-h-[520px]">
            <button
              type="button"
              onClick={onClose}
              title="Close"
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow hover:bg-white lg:hidden"
            >
              <X className="h-4 w-4" />
            </button>

            {selectedMedia ? (
              <ModalMedia media={selectedMedia} />
            ) : (
              <GenerationMediaPlaceholder item={item} tone="dark" />
            )}

            {mediaItems.length > 1 && (
              <div className="absolute bottom-3 left-3 right-3 flex gap-2 overflow-x-auto rounded-lg bg-gray-950/65 p-2 backdrop-blur">
                {mediaItems.map((media, index) => (
                  <button
                    key={`${media.url}-${index}`}
                    type="button"
                    onClick={() => onMediaIndexChange(index)}
                    className={`h-14 w-16 shrink-0 overflow-hidden rounded border ${
                      safeMediaIndex === index ? 'border-white' : 'border-white/20 opacity-70 hover:opacity-100'
                    }`}
                    aria-label={`Show media ${index + 1}`}
                  >
                    <MasonryMedia media={media} />
                  </button>
                ))}
              </div>
            )}
          </div>

          <aside className="max-h-[calc(100vh-1.5rem)] overflow-y-auto border-t border-gray-200 bg-white p-5 sm:max-h-[calc(100vh-2.5rem)] lg:border-l lg:border-t-0">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{item.type} template</p>
                <h2 className="mt-1 text-lg font-semibold leading-6 text-gray-900">
                  {getModelDisplayName(item.model_id, modelLabelById)}
                </h2>
                {getModelDisplayName(item.model_id, modelLabelById) !== item.model_id && (
                  <p className="mt-1 break-all text-xs text-gray-500">{item.model_id}</p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                title="Close"
                className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 lg:flex"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="flex min-w-0 items-center gap-3">
                <UserCircle className="h-9 w-9 shrink-0 text-gray-400" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">{getCreatorName(item)}</p>
                  <p className="truncate text-xs text-gray-500">{item.creator_email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onLike}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  item.liked_by_me
                    ? 'border-red-200 bg-red-50 text-red-600'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Heart className={`h-4 w-4 ${item.liked_by_me ? 'fill-red-500' : ''}`} />
                {item.like_count}
              </button>
            </div>

            <section className="mb-5">
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Prompt</h3>
              <p className="whitespace-pre-wrap rounded-lg border border-gray-200 bg-white p-3 text-sm leading-6 text-gray-700">
                {item.prompt}
              </p>
            </section>

            <section className="mb-5">
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Generation Details</h3>
              <dl className="grid grid-cols-1 gap-2">
                {details.map((detail) => (
                  <DetailRow key={`${detail.label}-${detail.value}`} detail={detail} />
                ))}
              </dl>
            </section>

            {selectedMedia && (
              <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4">
                <a
                  href={selectedMedia.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
                >
                  <Download className="h-4 w-4" />
                  Open Output
                </a>
                {item.source_image_url && (
                  <a
                    href={item.source_image_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Source Image
                  </a>
                )}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function MasonryMedia({ media }: { media: StudioMedia }) {
  if (media.type === 'image') {
    return <img src={media.url} alt="Generated output" className="h-full w-full object-cover" loading="lazy" />;
  }

  if (media.type === 'video') {
    return <video src={media.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />;
  }

  if (media.type === 'audio') {
    return (
      <div className="flex h-full min-h-[140px] w-full items-center justify-center bg-gray-900 text-white">
        <Music className="h-10 w-10" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[140px] w-full items-center justify-center bg-gray-900 text-white">
      <Download className="h-10 w-10" />
    </div>
  );
}

function ModalMedia({ media }: { media: StudioMedia }) {
  if (media.type === 'image') {
    return <img src={media.url} alt="Generated output" className="max-h-[78vh] max-w-full rounded-lg object-contain" />;
  }

  if (media.type === 'video') {
    return <video src={media.url} controls autoPlay className="max-h-[78vh] max-w-full rounded-lg bg-black" />;
  }

  if (media.type === 'audio') {
    return (
      <div className="w-full max-w-xl rounded-lg bg-white p-4">
        <audio src={media.url} controls className="w-full" />
      </div>
    );
  }

  return (
    <a
      href={media.url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-medium text-gray-900 hover:bg-gray-100"
    >
      <Download className="h-4 w-4" />
      Open Output
    </a>
  );
}

function GenerationMediaPlaceholder({
  item,
  compact = false,
  tone = 'light',
}: {
  item: StudioGeneration;
  compact?: boolean;
  tone?: 'light' | 'dark';
}) {
  const status = getGenerationStatus(item);
  const isDark = tone === 'dark';
  const isProcessing = status === 'queued' || status === 'running';
  const isFailed = status === 'failed';
  const errorMessage = getGenerationError(item);

  return (
    <div
      className={`flex h-full min-h-[180px] w-full flex-col items-center justify-center rounded-lg px-4 py-6 text-center ${
        isDark
          ? 'bg-gray-900 text-gray-200'
          : isFailed
            ? 'border border-red-100 bg-red-50 text-red-700'
            : 'border border-gray-200 bg-gray-50 text-gray-500'
      }`}
    >
      {isProcessing ? (
        <Loader2 className={`${compact ? 'mb-2 h-6 w-6' : 'mb-3 h-8 w-8'} animate-spin text-primary-500`} />
      ) : isFailed ? (
        <X className={`${compact ? 'mb-2 h-6 w-6' : 'mb-3 h-8 w-8'} text-red-500`} />
      ) : (
        <ImageIcon className={`${compact ? 'mb-2 h-6 w-6' : 'mb-3 h-8 w-8'} ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
      )}

      <p className={`${compact ? 'text-sm' : 'text-base'} font-semibold ${isDark ? 'text-white' : ''}`}>
        {isProcessing ? 'Generation still processing' : isFailed ? 'Generation failed' : 'No media available'}
      </p>
      {!compact && (
        <p className={`mt-1 max-w-sm text-sm ${isDark ? 'text-gray-400' : isFailed ? 'text-red-600' : 'text-gray-500'}`}>
          {isProcessing
            ? 'The output is not ready yet. Refresh the list in a moment.'
            : isFailed
              ? errorMessage || 'The generation did not finish successfully.'
              : 'This record does not include a generated image, video, or audio URL.'}
        </p>
      )}
    </div>
  );
}

function DetailRow({ detail }: { detail: { label: string; value: string; href?: string } }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">{detail.label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-gray-800">
        {detail.href ? (
          <a
            href={detail.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700"
          >
            {detail.value}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : (
          detail.value
        )}
      </dd>
    </div>
  );
}

function getGenerationMedia(item: StudioGeneration): StudioMedia[] {
  const existingMedia = (item.media || []).filter((media) => Boolean(media?.url));
  if (existingMedia.length) return existingMedia;

  const result = item.result || {};
  const media: StudioMedia[] = [];

  const addMedia = (candidate: any, fallbackType: StudioMedia['type']) => {
    if (!candidate) return;

    if (typeof candidate === 'string') {
      media.push({ type: inferMediaType(candidate, fallbackType), url: candidate });
      return;
    }

    if (typeof candidate !== 'object') return;

    const url = candidate.url || candidate.uri || candidate.download_url || candidate.file_url;
    if (typeof url !== 'string' || !url) return;

    const candidateType = isStudioMediaType(candidate.type)
      ? candidate.type
      : inferMediaType(url, fallbackType, candidate.content_type);

    media.push({
      ...candidate,
      type: candidateType,
      url,
    });
  };

  if (Array.isArray(result.images)) {
    result.images.forEach((image: any) => addMedia(image, 'image'));
  }
  if (Array.isArray(result.videos)) {
    result.videos.forEach((video: any) => addMedia(video, 'video'));
  }
  if (Array.isArray(result.audios)) {
    result.audios.forEach((audio: any) => addMedia(audio, 'audio'));
  }

  addMedia(result.image, 'image');
  addMedia(result.image_url, 'image');
  addMedia(result.video, 'video');
  addMedia(result.video_url, 'video');
  addMedia(result.audio, 'audio');
  addMedia(result.audio_url, 'audio');
  addMedia(result.url, 'file');

  return media;
}

function isStudioMediaType(value: unknown): value is StudioMedia['type'] {
  return value === 'image' || value === 'video' || value === 'audio' || value === 'file';
}

function inferMediaType(url: string, fallbackType: StudioMedia['type'], contentType?: string): StudioMedia['type'] {
  if (contentType?.startsWith('image/')) return 'image';
  if (contentType?.startsWith('video/')) return 'video';
  if (contentType?.startsWith('audio/')) return 'audio';

  const cleanUrl = url.split('?')[0].toLowerCase();
  if (/\.(png|jpe?g|webp|gif|avif)$/.test(cleanUrl)) return 'image';
  if (/\.(mp4|webm|mov|m4v)$/.test(cleanUrl)) return 'video';
  if (/\.(mp3|wav|m4a|ogg)$/.test(cleanUrl)) return 'audio';
  return fallbackType;
}

function getGenerationStatus(item: StudioGeneration) {
  const status = item.result?.status;
  if (status === 'queued' || status === 'running' || status === 'completed' || status === 'failed') {
    return status;
  }
  if (item.result?.error) return 'failed';
  return undefined;
}

function getGenerationError(item: StudioGeneration) {
  const error = item.result?.error || item.result?.detail || item.result?.message;
  return typeof error === 'string' ? error : undefined;
}

function sortTemplateItems(items: StudioGeneration[], sort: TemplateSort) {
  return [...items].sort((a, b) => {
    if (sort === 'popular') {
      const likes = b.like_count - a.like_count;
      if (likes !== 0) return likes;
    }

    return getGenerationTime(b) - getGenerationTime(a);
  });
}

function getGenerationTime(item: StudioGeneration) {
  const value = item.published_at || item.created_at;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function getPrimaryMediaIndex(mediaItems: StudioMedia[]) {
  const richMediaIndex = mediaItems.findIndex((media) => media.type === 'image' || media.type === 'video');
  if (richMediaIndex >= 0) return richMediaIndex;
  return mediaItems.length ? 0 : -1;
}

function getMasonryAspectRatio(media: StudioMedia, index: number) {
  if (media.width && media.height) {
    return `${media.width} / ${media.height}`;
  }

  if (media.type === 'video') {
    return '16 / 9';
  }

  const fallbackRatios = ['4 / 5', '1 / 1', '3 / 4', '5 / 6', '4 / 3'];
  return fallbackRatios[index % fallbackRatios.length];
}

function getCreatorName(item: StudioGeneration) {
  const explicitName = item.creator_name || item.creator_username || item.user_name || item.username;
  if (explicitName?.trim()) return explicitName.trim();
  if (item.creator_email && item.creator_email.includes('@')) return item.creator_email.split('@')[0];
  return item.creator_email || 'Unknown user';
}

function getModelDisplayName(modelId: string, modelLabelById?: ReadonlyMap<string, string>) {
  return modelLabelById?.get(modelId) || modelId;
}

function formatShortDate(value?: string) {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDateTime(value?: string) {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function titleCase(value: string) {
  return value
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDetailValue(value: unknown) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return titleCase(value);
  return String(value);
}

function getResultMetadata(result: Record<string, any>) {
  const labels: Record<string, string> = {
    aspect_ratio: 'Aspect Ratio',
    image_size: 'Image Size',
    resolution: 'Resolution',
    duration: 'Duration',
    generate_audio: 'Audio',
    seed: 'Seed',
    prompt_adherence: 'Prompt Match',
    output_format: 'Output Format',
    num_images: 'Images',
    width: 'Width',
    height: 'Height',
    steps: 'Steps',
    guidance_scale: 'Guidance Scale',
    max_sequence_length: 'Max Sequence',
    status: 'Status',
    voice: 'Voice',
    quality: 'Result Quality',
  };

  return Object.entries(labels)
    .filter(([key]) => result?.[key] !== undefined && result?.[key] !== null && result?.[key] !== '')
    .map(([key, label]) => ({
      label,
      value: formatDetailValue(result[key]),
    }));
}

function getGenerationDetails(
  item: StudioGeneration,
  media: StudioMedia | null,
  modelLabelById?: ReadonlyMap<string, string>
) {
  const details: { label: string; value: string; href?: string }[] = [
    { label: 'Model', value: getModelDisplayName(item.model_id, modelLabelById) },
    { label: 'Model ID', value: item.model_id },
    { label: 'Type', value: titleCase(item.type) },
    { label: 'Visibility', value: titleCase(item.visibility) },
    { label: 'Likes', value: String(item.like_count) },
    { label: 'Created', value: formatDateTime(item.created_at) },
  ];

  if (item.published_at) details.push({ label: 'Published', value: formatDateTime(item.published_at) });
  if (item.quality) details.push({ label: 'Quality', value: titleCase(item.quality) });
  if (media?.type) details.push({ label: 'Media Type', value: titleCase(media.type) });
  if (media?.content_type) details.push({ label: 'Content Type', value: media.content_type });
  if (media?.width && media?.height) details.push({ label: 'Dimensions', value: `${media.width} x ${media.height}` });
  if (item.source_image_url) details.push({ label: 'Source Image', value: 'Open source image', href: item.source_image_url });
  if (item.request_id) details.push({ label: 'Request ID', value: item.request_id });

  getResultMetadata(item.result || {}).forEach((detail) => {
    if (!details.some((itemDetail) => itemDetail.label === detail.label)) {
      details.push(detail);
    }
  });

  return details;
}

function GenerationGrid({
  items,
  isLoading,
  emptyText,
  modelLabelById,
  showOwnerControls = false,
  showLikes = false,
  onPublish,
  onLike,
}: {
  items: StudioGeneration[];
  isLoading: boolean;
  emptyText: string;
  modelLabelById?: ReadonlyMap<string, string>;
  showOwnerControls?: boolean;
  showLikes?: boolean;
  onPublish?: (generationId: string, visibility: 'private' | 'public') => void;
  onLike?: (generationId: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white py-16 text-center text-gray-500">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <GenerationCard
          key={item.id}
          item={item}
          modelLabelById={modelLabelById}
          showOwnerControls={showOwnerControls}
          showLikes={showLikes}
          onPublish={(visibility) => onPublish?.(item.id, visibility)}
          onLike={() => onLike?.(item.id)}
        />
      ))}
    </div>
  );
}

function GenerationCard({
  item,
  modelLabelById,
  showOwnerControls = false,
  showLikes = false,
  onPublish,
  onLike,
}: {
  item: StudioGeneration;
  modelLabelById?: ReadonlyMap<string, string>;
  showOwnerControls?: boolean;
  showLikes?: boolean;
  onPublish?: (visibility: 'private' | 'public') => void;
  onLike?: () => void;
}) {
  const mediaItems = getGenerationMedia(item);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-gray-400">{item.type}</p>
          <h2 className="mt-1 truncate font-semibold text-gray-900">{getModelDisplayName(item.model_id, modelLabelById)}</h2>
          <p className="mt-1 text-xs text-gray-500">Created by {getCreatorName(item)}</p>
          {item.quality && <p className="mt-1 text-xs text-gray-500">Quality: {item.quality}</p>}
          {item.source_image_url && <p className="mt-1 truncate text-xs text-gray-400">Source: {item.source_image_url}</p>}
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
            item.visibility === 'public' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {item.visibility === 'private' && <Lock className="h-3 w-3" />}
          {item.visibility}
        </span>
      </div>

      <p className="mb-4 line-clamp-4 text-sm leading-6 text-gray-700">{item.prompt}</p>

      <div className="space-y-3">
        {mediaItems.length === 0 ? (
          <GenerationMediaPlaceholder item={item} />
        ) : (
          mediaItems.map((media, index) => <MediaPreview key={`${media.url}-${index}`} media={media} />)
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {showOwnerControls && (
          <>
            {item.visibility === 'private' ? (
              <button
                onClick={() => onPublish?.('public')}
                className="rounded-lg bg-primary-500 px-3 py-2 text-sm font-medium text-white hover:bg-primary-600"
              >
                Publish
              </button>
            ) : (
              <button
                onClick={() => onPublish?.('private')}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Make Private
              </button>
            )}
          </>
        )}

        {showLikes && (
          <button
            onClick={onLike}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              item.liked_by_me
                ? 'border-red-200 bg-red-50 text-red-600'
                : 'border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Heart className={`h-4 w-4 ${item.liked_by_me ? 'fill-red-500' : ''}`} />
            {item.like_count}
          </button>
        )}

        <span className="ml-auto text-xs text-gray-400">
          {new Date(item.created_at).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}

function MediaPreview({ media }: { media: StudioMedia }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      {media.type === 'image' && (
        <img src={media.url} alt="Generated output" className="max-h-80 w-full rounded-lg object-contain" />
      )}
      {media.type === 'video' && (
        <video src={media.url} controls className="max-h-80 w-full rounded-lg bg-black" />
      )}
      {media.type === 'audio' && <audio src={media.url} controls className="w-full" />}
      <a
        href={media.url}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
      >
        <Download className="h-4 w-4" />
        Open Output
      </a>
    </div>
  );
}
