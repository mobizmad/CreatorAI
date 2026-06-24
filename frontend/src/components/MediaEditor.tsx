'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  Film,
  FolderOpen,
  LayoutGrid,
  List,
  Loader2,
  Music,
  Pause,
  Play,
  Plus,
  SkipBack,
  SkipForward,
  Trash2,
  Type,
  Upload,
  Volume2,
  Wand2,
  X,
  Download,
  RotateCw,
  Maximize2,
} from 'lucide-react';

type MediaKind = 'video' | 'audio' | 'text';
type EditorTab = 'upload' | 'ai-video' | 'ai-audio';
type StudioType = 'image' | 'video' | 'speech';

interface Clip {
  id: string;
  name: string;
  type: MediaKind;
  start: number;
  duration: number;
  trimStart: number;
  sourceDuration: number;
  fileUrl: string;
  color: string;
  textContent?: string;
  fontFamily?: string;
  fontSize?: number;
  textColor?: string;
  position?: { x: number; y: number };
  rotation?: number;
  scale?: number;
  fitMode?: 'contain' | 'cover' | 'fill';
  videoScale?: number;
  videoRotation?: number;
  videoFlipX?: boolean;
  videoFlipY?: boolean;
}

interface TimelineTrack {
  id: string;
  type: MediaKind;
  name: string;
  clips: Clip[];
}

interface LibraryAsset {
  id: string;
  name: string;
  type: MediaKind;
  duration: number;
  fileUrl: string;
  thumbnail?: string;
  source?: 'upload' | 'ai';
}

interface MediaProject {
  id: string;
  name: string;
  assets: LibraryAsset[];
  tracks: TimelineTrack[];
  playhead: number;
  created_at: string;
  updated_at: string;
}

interface StudioModel {
  id: string;
  label: string;
  type: StudioType;
  requires_image: boolean;
  price_label?: string;
  price_note?: string;
  options?: Record<string, string[]>;
  defaults?: Record<string, string>;
  supports_generate_audio?: boolean;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'https://aicreateback.ibechamp.com';
const PIXELS_PER_SECOND = 20;

const defaultTracks = (): TimelineTrack[] => [
  { id: 't3', type: 'text', name: 'Text Overlays', clips: [] },
  { id: 't1', type: 'video', name: 'Video Track 1', clips: [] },
  { id: 't2', type: 'audio', name: 'Voiceover', clips: [] },
];

function getErrorMessage(detail: any, fallback: string) {
  if (!detail) return fallback;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((item) => item?.msg || item?.message || JSON.stringify(item)).join(', ');
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

export default function MediaEditor() {
  const [projects, setProjects] = useState<MediaProject[]>([]);
  const [activeProject, setActiveProject] = useState<MediaProject | null>(null);
  const [projectName, setProjectName] = useState('Untitled Project');
  const [newProjectName, setNewProjectName] = useState('');
  const [models, setModels] = useState<StudioModel[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState<EditorTab>('upload');
  const [playhead, setPlayhead] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [libraryAssets, setLibraryAssets] = useState<LibraryAsset[]>([]);
  const [libraryViewMode, setLibraryViewMode] = useState<'list' | 'grid'>('grid');
  const [tracks, setTracks] = useState<TimelineTrack[]>(defaultTracks);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [selectedVideoModel, setSelectedVideoModel] = useState('');
  const [selectedAudioModel, setSelectedAudioModel] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [sourceImageFile, setSourceImageFile] = useState<File | null>(null);
  const [isUploadingSourceImage, setIsUploadingSourceImage] = useState(false);
  const [quality, setQuality] = useState('medium');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [resolution, setResolution] = useState('720p');
  const [duration, setDuration] = useState('5');
  const [generateAudio, setGenerateAudio] = useState(true);
  const [voice, setVoice] = useState('');
  const [seed, setSeed] = useState('');
  const [dragState, setDragState] = useState<{
    clipId: string;
    trackId: string;
    type: 'move' | 'trimLeft' | 'trimRight';
    startX: number;
    initialClip: Clip;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; trackId: string; clipId: string } | null>(null);
  const [textMenu, setTextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingTextMenu, setIsDraggingTextMenu] = useState(false);
  const [menuDragOffset, setMenuDragOffset] = useState({ x: 0, y: 0 });
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportResolution, setExportResolution] = useState('1080p');
  const [exportProgress, setExportProgress] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportComplete, setExportComplete] = useState(false);
  const [exportVideoUrl, setExportVideoUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState('New Text');
  const [textFont, setTextFont] = useState('Arial');
  const [textColor, setTextColor] = useState('#ffffff');
  const [textSize, setTextSize] = useState(48);
  const [selectedTextClipId, setSelectedTextClipId] = useState<string | null>(null);
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale' | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const animationRef = useRef<number>();
  const timelineRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<number>();
  const isHydratingRef = useRef(false);

  const videoModels = useMemo(() => models.filter((model) => model.type === 'video'), [models]);
  const audioModels = useMemo(() => models.filter((model) => model.type === 'speech'), [models]);
  const currentGenerateType: MediaKind = activeTab === 'ai-audio' ? 'audio' : 'video';
  const currentModel = currentGenerateType === 'audio' ? audioModels.find((model) => model.id === selectedAudioModel) : videoModels.find((model) => model.id === selectedVideoModel);
  const currentOptions = currentModel?.options || {};

  const authHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  });

  useEffect(() => {
    loadProjects();
    loadModels();
  }, []);

  useEffect(() => {
    if (!selectedVideoModel && videoModels[0]) setSelectedVideoModel(videoModels[0].id);
    if (!selectedAudioModel && audioModels[0]) setSelectedAudioModel(audioModels[0].id);
  }, [audioModels, selectedAudioModel, selectedVideoModel, videoModels]);

  useEffect(() => {
    if (!currentModel) return;
    const options = currentModel.options || {};
    const defaults = currentModel.defaults || {};

    if (options.qualities?.length) setQuality(defaults.quality || options.qualities[0]);
    if (options.aspect_ratios?.length) setAspectRatio(defaults.aspect_ratio || options.aspect_ratios[0]);
    if (options.resolutions?.length) setResolution(defaults.resolution || options.resolutions[0]);
    if (options.durations?.length) setDuration(defaults.duration || options.durations[0]);
    if (currentModel.supports_generate_audio) setGenerateAudio(true);
  }, [currentModel?.id]);

  useEffect(() => {
    const handleClick = () => {
      if (contextMenu) setContextMenu(null);
      if (textMenu) setTextMenu(null);
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [contextMenu, textMenu]);

  useEffect(() => {
    if (!activeProject || isHydratingRef.current) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveProject({
        name: projectName,
        assets: libraryAssets,
        tracks,
        playhead,
      });
    }, 600);

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [activeProject?.id, libraryAssets, playhead, projectName, tracks]);

  useEffect(() => {
    let lastTime = performance.now();
    
    const updatePlayhead = () => {
      const now = performance.now();
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      
      setPlayhead((prev) => {
        const maxDuration = Math.max(...tracks.flatMap(t => t.clips.map(c => c.start + c.duration)), 5);
        const next = prev + delta;
        if (next >= maxDuration) {
          setIsPlaying(false);
          return maxDuration;
        }
        return next;
      });
      
      animationRef.current = requestAnimationFrame(updatePlayhead);
    };

    if (isPlaying) {
      lastTime = performance.now();
      animationRef.current = requestAnimationFrame(updatePlayhead);
    } else if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, tracks]);

  useEffect(() => {
    if (!videoRef.current) return;
    const activeClip = getActiveVideoClip(playhead);
    
    if (isPlaying) {
      if (activeClip) {
         if (!videoRef.current.src.endsWith(activeClip.fileUrl)) {
           videoRef.current.src = activeClip.fileUrl;
           videoRef.current.currentTime = activeClip.trimStart + (playhead - activeClip.start);
           videoRef.current.play().catch(e => console.error(e));
         } else if (videoRef.current.paused) {
           videoRef.current.play().catch(e => console.error(e));
         }
         
         const targetTime = activeClip.trimStart + (playhead - activeClip.start);
         if (Math.abs(videoRef.current.currentTime - targetTime) > 0.25) {
           videoRef.current.currentTime = targetTime;
         }
      } else {
         if (!videoRef.current.paused) videoRef.current.pause();
      }
    } else {
      if (activeClip) {
         if (!videoRef.current.src.endsWith(activeClip.fileUrl)) {
           videoRef.current.src = activeClip.fileUrl;
         }
         const targetTime = activeClip.trimStart + (playhead - activeClip.start);
         if (Math.abs(videoRef.current.currentTime - targetTime) > 0.1) {
           videoRef.current.currentTime = targetTime;
         }
         if (!videoRef.current.paused) videoRef.current.pause();
      } else {
         if (!videoRef.current.paused) videoRef.current.pause();
      }
    }
  }, [playhead, isPlaying, tracks]);

  const loadProjects = async () => {
    setIsLoadingProjects(true);
    try {
      const response = await fetch(`${API}/media-editor/projects`, { headers: authHeaders() });
      if (!response.ok) throw new Error('Failed to load projects');
      setProjects(await response.json());
    } finally {
      setIsLoadingProjects(false);
    }
  };

  const loadModels = async () => {
    try {
      const response = await fetch(`${API}/ai-studio/models`, { headers: authHeaders() });
      if (response.ok) setModels(await response.json());
    } catch (err) {
      console.error('Failed to load AI Studio models', err);
    }
  };

  const openProject = (project: MediaProject) => {
    isHydratingRef.current = true;
    setActiveProject(project);
    setProjectName(project.name);
    setLibraryAssets(project.assets || []);
    setTracks(project.tracks?.length ? project.tracks : defaultTracks());
    setPlayhead(project.playhead || 0);
    setTimeout(() => {
      isHydratingRef.current = false;
    }, 0);
  };

  const createProject = async () => {
    setIsCreatingProject(true);
    try {
      const response = await fetch(`${API}/media-editor/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ name: newProjectName.trim() || 'Untitled Project' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(data.detail, 'Failed to create project'));
      setProjects((current) => [data, ...current]);
      setNewProjectName('');
      openProject(data);
    } catch (err: any) {
      alert(err.message || 'Failed to create project');
    } finally {
      setIsCreatingProject(false);
    }
  };

  const saveProject = async (payload: Partial<MediaProject>) => {
    if (!activeProject) return;
    try {
      const response = await fetch(`${API}/media-editor/projects/${activeProject.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(payload),
      });
      if (!response.ok) return;
      const updated = await response.json();
      setActiveProject(updated);
      setProjects((current) => current.map((project) => (project.id === updated.id ? updated : project)));
    } catch (err) {
      console.error('Failed to save media project', err);
    }
  };

  const deleteProject = async (project: MediaProject) => {
    const shouldDelete = window.confirm(`Delete "${project.name}"? This will remove the project, media library, and timeline.`);
    if (!shouldDelete) return;

    try {
      const response = await fetch(`${API}/media-editor/projects/${project.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error('Failed to delete project');
      setProjects((current) => current.filter((item) => item.id !== project.id));
      if (activeProject?.id === project.id) setActiveProject(null);
    } catch (err: any) {
      alert(err.message || 'Failed to delete project');
    }
  };

  const getActiveVideoClip = (time: number) => {
    const videoTrack = tracks.find((track) => track.type === 'video');
    if (!videoTrack) return null;
    return videoTrack.clips.find((clip) => time >= clip.start && time < clip.start + clip.duration);
  };

  const handlePlayPause = () => {
    if (!isPlaying) {
      const activeClip = getActiveVideoClip(playhead);
      if (activeClip && videoRef.current) {
        if (videoRef.current.src !== activeClip.fileUrl) {
          videoRef.current.src = activeClip.fileUrl;
          videoRef.current.currentTime = activeClip.trimStart + (playhead - activeClip.start);
        }
        videoRef.current.play().catch((err) => console.error(err));
      }
    } else if (videoRef.current) {
      videoRef.current.pause();
    }
    setIsPlaying(!isPlaying);
  };

  const measureAsset = (asset: LibraryAsset): Promise<LibraryAsset> => {
    return new Promise((resolve) => {
      const media = asset.type === 'audio' ? document.createElement('audio') : document.createElement('video');
      media.crossOrigin = 'anonymous';
      media.preload = 'metadata';
      media.src = asset.fileUrl;
      media.onloadedmetadata = () => {
        const measured = { ...asset, duration: Number.isFinite(media.duration) && media.duration > 0 ? media.duration : asset.duration };
        if (asset.type === 'video') {
          const video = media as HTMLVideoElement;
          video.currentTime = Math.min(0.1, measured.duration || 0);
          video.onseeked = () => {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth || 160;
            canvas.height = video.videoHeight || 90;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              try {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                measured.thumbnail = canvas.toDataURL('image/jpeg');
              } catch (err) {
                console.warn('Video thumbnail capture was blocked by the browser.', err);
                measured.thumbnail = '';
              }
            }
            resolve(measured);
          };
        } else {
          resolve(measured);
        }
      };
      media.onerror = () => resolve(asset);
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !activeProject) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`${API}/media-editor/projects/${activeProject.id}/upload`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(data.detail, 'Upload failed'));

      const measured = await measureAsset(data.asset);
      const nextAssets = data.project.assets.map((asset: LibraryAsset) => (asset.id === measured.id ? measured : asset));
      setLibraryAssets(nextAssets);
      setProjects((current) => current.map((project) => (project.id === data.project.id ? { ...data.project, assets: nextAssets } : project)));
      setActiveProject({ ...data.project, assets: nextAssets });
      await saveProject({ assets: nextAssets });
    } catch (err: any) {
      alert(err.message || 'Failed to upload media');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSourceImageUpload = async () => {
    if (!sourceImageFile || isUploadingSourceImage) return;

    setIsUploadingSourceImage(true);
    setGenerationError(null);

    try {
      const dimensions = await readImageDimensions(sourceImageFile);
      if (dimensions.width < 300 || dimensions.height < 300) {
        throw new Error(`Image is ${dimensions.width}x${dimensions.height}px. Fal requires at least 300x300px for source images.`);
      }

      const formData = new FormData();
      formData.append('file', sourceImageFile);

      const response = await fetch(`${API}/ai-studio/upload-image`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(data.detail, 'Upload failed'));

      setImageUrl(data.url);
    } catch (err: any) {
      setGenerationError(err.message || 'Failed to upload source image.');
    } finally {
      setIsUploadingSourceImage(false);
    }
  };

  const handleGenerate = async () => {
    if (!activeProject || !prompt.trim() || isGenerating) return;
    const modelId = currentGenerateType === 'audio' ? selectedAudioModel : selectedVideoModel;
    if (!modelId) return;

    setIsGenerating(true);
    setGenerationError(null);
    try {
      const response = await fetch(`${API}/media-editor/projects/${activeProject.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          type: currentGenerateType,
          model_id: modelId,
          prompt,
          image_url: imageUrl || undefined,
          quality,
          aspect_ratio: currentGenerateType === 'video' ? aspectRatio : undefined,
          resolution: currentGenerateType === 'video' ? resolution : undefined,
          duration: currentGenerateType === 'video' ? duration : undefined,
          generate_audio: currentGenerateType === 'video' ? generateAudio : undefined,
          voice: currentGenerateType === 'audio' ? voice || undefined : undefined,
          seed: seed ? Number(seed) : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(data.detail, 'Generation failed'));
      const measured = await measureAsset(data.asset);
      const nextAssets = data.project.assets.map((asset: LibraryAsset) => (asset.id === measured.id ? measured : asset));
      setLibraryAssets(nextAssets);
      setActiveProject({ ...data.project, assets: nextAssets });
      setProjects((current) => current.map((project) => (project.id === data.project.id ? { ...data.project, assets: nextAssets } : project)));
      setPrompt('');
      await saveProject({ assets: nextAssets });
    } catch (err: any) {
      setGenerationError(err.message || 'Generation failed.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddText = () => {
    if (!activeProject || !textContent.trim()) return;
    
    let currentTracks = [...tracks];
    let textTrack = currentTracks.find(t => t.type === 'text');
    
    if (!textTrack) {
      textTrack = {
        id: `t_text_${Date.now()}`,
        name: 'Text Overlays',
        type: 'text',
        clips: []
      };
      currentTracks.push(textTrack);
    }
    
    const newClip: Clip = {
      id: `c_${Date.now()}`,
      name: 'Text Overlay',
      type: 'text',
      start: playhead,
      duration: 5,
      trimStart: 0,
      sourceDuration: 5,
      fileUrl: '',
      color: 'bg-amber-500',
      textContent,
      fontFamily: textFont,
      fontSize: textSize,
      textColor,
    };
    
    setTracks(currentTracks.map((item) => (item.id === textTrack!.id ? { ...item, clips: [...item.clips, newClip] } : item)));
    setTextMenu(null);
  };

  const handleDragStartAsset = (e: React.DragEvent, asset: LibraryAsset) => {
    e.dataTransfer.setData('application/json', JSON.stringify(asset));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDropOnTrack = (e: React.DragEvent, trackId: string) => {
    e.preventDefault();
    const assetData = e.dataTransfer.getData('application/json');
    if (!assetData) return;

    try {
      const asset: LibraryAsset = JSON.parse(assetData);
      const track = tracks.find((item) => item.id === trackId);
      if (!track || track.type !== asset.type) {
        alert(`Drop ${asset.type} assets on a ${asset.type} track.`);
        return;
      }

      const trackElement = e.currentTarget as HTMLElement;
      const rect = trackElement.getBoundingClientRect();
      const dropX = Math.max(0, e.clientX - rect.left);
      const startSeconds = dropX / PIXELS_PER_SECOND;
      const newClip: Clip = {
        id: `c_${Date.now()}`,
        name: asset.name,
        type: asset.type,
        start: startSeconds,
        duration: asset.duration || 5,
        trimStart: 0,
        sourceDuration: asset.duration || 5,
        fileUrl: asset.fileUrl,
        color: asset.type === 'audio' ? 'bg-emerald-500' : 'bg-indigo-500',
      };

      setTracks((current) => current.map((item) => (item.id === trackId ? { ...item, clips: [...item.clips, newClip] } : item)));
    } catch (err) {
      console.error('Failed to parse dropped asset', err);
    }
  };

  const handleMouseDownTimeline = (e: React.MouseEvent, clip: Clip, trackId: string, type: 'move' | 'trimLeft' | 'trimRight') => {
    e.stopPropagation();
    if (e.button === 2) return;
    if (contextMenu) setContextMenu(null);
    setDragState({ clipId: clip.id, trackId, type, startX: e.clientX, initialClip: { ...clip } });
  };

  const handleMouseMoveTimeline = useCallback((e: MouseEvent) => {
    if (!dragState) return;
    const deltaX = e.clientX - dragState.startX;
    const deltaSeconds = deltaX / PIXELS_PER_SECOND;

    setTracks((current) =>
      current.map((track) => {
        if (track.id !== dragState.trackId) return track;
        return {
          ...track,
          clips: track.clips.map((clip) => {
            if (clip.id !== dragState.clipId) return clip;
            const init = dragState.initialClip;
            let newStart = init.start;
            let newDuration = init.duration;
            let newTrimStart = init.trimStart;

            if (dragState.type === 'move') newStart = Math.max(0, init.start + deltaSeconds);
            else if (dragState.type === 'trimLeft') {
              const possibleDelta = Math.max(-init.trimStart, Math.min(init.duration - 0.5, deltaSeconds));
              newStart = init.start + possibleDelta;
              newTrimStart = init.trimStart + possibleDelta;
              newDuration = init.duration - possibleDelta;
            } else if (dragState.type === 'trimRight') {
              const maxDelta = init.type === 'text' ? Infinity : init.sourceDuration - init.trimStart - init.duration;
              const possibleDelta = Math.max(-init.duration + 0.5, Math.min(maxDelta, deltaSeconds));
              newDuration = init.duration + possibleDelta;
            }

            return { ...clip, start: newStart, duration: newDuration, trimStart: newTrimStart };
          }),
        };
      })
    );
  }, [dragState]);

  const handleMouseUpTimeline = useCallback(() => {
    if (dragState) setDragState(null);
  }, [dragState]);

  useEffect(() => {
    if (dragState) {
      window.addEventListener('mousemove', handleMouseMoveTimeline);
      window.addEventListener('mouseup', handleMouseUpTimeline);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMoveTimeline);
      window.removeEventListener('mouseup', handleMouseUpTimeline);
    };
  }, [dragState, handleMouseMoveTimeline, handleMouseUpTimeline]);

  const handleMenuDragStart = (e: React.MouseEvent) => {
    if (!textMenu) return;
    setIsDraggingTextMenu(true);
    setMenuDragOffset({ x: e.clientX - textMenu.x, y: e.clientY - textMenu.y });
  };

  const handleMenuDrag = useCallback((e: MouseEvent) => {
    if (!isDraggingTextMenu) return;
    setTextMenu({ x: e.clientX - menuDragOffset.x, y: e.clientY - menuDragOffset.y });
  }, [isDraggingTextMenu, menuDragOffset]);

  const handleMenuDragEnd = useCallback(() => {
    setIsDraggingTextMenu(false);
  }, []);

  useEffect(() => {
    if (isDraggingTextMenu) {
      window.addEventListener('mousemove', handleMenuDrag);
      window.addEventListener('mouseup', handleMenuDragEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleMenuDrag);
      window.removeEventListener('mouseup', handleMenuDragEnd);
    };
  }, [isDraggingTextMenu, handleMenuDrag, handleMenuDragEnd]);

  useEffect(() => {
    const handleTextDrag = (e: MouseEvent) => {
      if (!selectedTextClipId || !transformMode || !videoContainerRef.current) return;
      const rect = videoContainerRef.current.getBoundingClientRect();
      
      setTracks((current) => current.map(track => {
        if (track.type === 'text') {
          return {
            ...track,
            clips: track.clips.map(c => {
              if (c.id !== selectedTextClipId) return c;
              
              if (transformMode === 'translate') {
                const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
                const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
                return { ...c, position: { x, y } };
              }
              
              const posX = c.position?.x ?? 50;
              const posY = c.position?.y ?? 50;
              const centerXPx = rect.left + (posX / 100) * rect.width;
              const centerYPx = rect.top + (posY / 100) * rect.height;
              
              if (transformMode === 'rotate') {
                const angle = Math.atan2(e.clientY - centerYPx, e.clientX - centerXPx);
                let rotation = (angle * 180) / Math.PI + 90;
                return { ...c, rotation };
              }
              
              if (transformMode === 'scale') {
                const dist = Math.hypot(e.clientX - centerXPx, e.clientY - centerYPx);
                const scale = Math.max(0.2, dist / 50);
                return { ...c, scale };
              }
              
              return c;
            })
          };
        }
        return track;
      }));
    };
    
    const handleTextDragEnd = () => {
      setTransformMode(null);
    };
    
    if (transformMode) {
      window.addEventListener('mousemove', handleTextDrag);
      window.addEventListener('mouseup', handleTextDragEnd);
    }
    
    return () => {
      window.removeEventListener('mousemove', handleTextDrag);
      window.removeEventListener('mouseup', handleTextDragEnd);
    };
  }, [selectedTextClipId, transformMode]);

  const handleExport = async () => {
    setIsExporting(true);
    setExportProgress(0);
    setExportComplete(false);
    if (exportVideoUrl) URL.revokeObjectURL(exportVideoUrl);
    setExportVideoUrl(null);

    const maxDuration = Math.max(...tracks.flatMap(t => t.clips.map(c => c.start + c.duration)), 5);
    
    const canvas = document.createElement('canvas');
    let width = 1920; let height = 1080;
    if (exportResolution === '480p') { width = 854; height = 480; }
    else if (exportResolution === '720p') { width = 1280; height = 720; }
    else if (exportResolution === '4K') { width = 3840; height = 2160; }
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    
    const videoTrack = tracks.find(t => t.type === 'video');
    const firstClip = videoTrack?.clips?.sort((a, b) => a.start - b.start)[0];
    const hiddenVideo = document.createElement('video');
    hiddenVideo.crossOrigin = 'anonymous';
    hiddenVideo.muted = true;
    hiddenVideo.playsInline = true;
    
    if (firstClip && firstClip.fileUrl) {
      hiddenVideo.src = firstClip.fileUrl;
      try {
        await hiddenVideo.play();
        hiddenVideo.pause();
      } catch (e) {
        console.error("Video load error:", e);
      }
    }
    
    const stream = canvas.captureStream(30);
    let mediaRecorder: MediaRecorder;
    try {
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/mp4' });
    } catch (e) {
      try {
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
      } catch (e) {
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      }
    }
    const chunks: BlobPart[] = [];
    
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: mediaRecorder.mimeType });
      setExportVideoUrl(URL.createObjectURL(blob));
      setExportComplete(true);
      setIsExporting(false);
    };
    
    mediaRecorder.start();
    
    const startTime = performance.now();
    let currentVideoClipId: string | null = null;
    
    const renderFrame = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      const progress = Math.min(100, Math.floor((elapsed / maxDuration) * 100));
      setExportProgress(progress);
      
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, width, height);
      
      const currentActiveClip = getActiveVideoClip(elapsed);
      if (currentActiveClip) {
         if (currentActiveClip.id !== currentVideoClipId) {
            hiddenVideo.src = currentActiveClip.fileUrl;
            hiddenVideo.currentTime = currentActiveClip.trimStart || 0;
            hiddenVideo.play().catch(e => console.error("Export play error", e));
            currentVideoClipId = currentActiveClip.id;
         }
         try {
           let drawW = width;
           let drawH = height;
           let drawX = 0;
           let drawY = 0;

           const fitMode = currentActiveClip.fitMode || 'contain';
           if (hiddenVideo.videoWidth > 0 && hiddenVideo.videoHeight > 0 && (fitMode === 'contain' || fitMode === 'cover')) {
             const vRatio = hiddenVideo.videoWidth / hiddenVideo.videoHeight;
             const cRatio = width / height;
             if ((fitMode === 'contain' && vRatio > cRatio) || (fitMode === 'cover' && vRatio <= cRatio)) {
               drawW = width;
               drawH = width / vRatio;
               drawY = (height - drawH) / 2;
             } else {
               drawH = height;
               drawW = height * vRatio;
               drawX = (width - drawW) / 2;
             }
           }

           ctx.save();
           ctx.translate(width / 2, height / 2);
           if (currentActiveClip.videoRotation) {
             ctx.rotate((currentActiveClip.videoRotation * Math.PI) / 180);
           }
           const scaleX = (currentActiveClip.videoFlipX ? -1 : 1) * (currentActiveClip.videoScale || 1);
           const scaleY = (currentActiveClip.videoFlipY ? -1 : 1) * (currentActiveClip.videoScale || 1);
           ctx.scale(scaleX, scaleY);

           ctx.drawImage(hiddenVideo, drawX - width / 2, drawY - height / 2, drawW, drawH);
           ctx.restore();
         } catch (e) {}
      } else if (currentVideoClipId) {
         hiddenVideo.pause();
         currentVideoClipId = null;
      }
      
      const textTrack = tracks.find(t => t.type === 'text');
      if (textTrack) {
        for (const clip of textTrack.clips) {
          if (elapsed >= clip.start && elapsed < clip.start + clip.duration) {
            const scale = height / 500;
            const scaledFontSize = Math.floor((clip.fontSize || 48) * scale);
            ctx.font = `bold ${scaledFontSize}px ${clip.fontFamily || 'Arial'}`;
            ctx.fillStyle = clip.textColor || '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
            const posX = (clip.position?.x ?? 50) / 100 * width;
            const posY = (clip.position?.y ?? 50) / 100 * height;
            
            ctx.save();
            ctx.translate(posX, posY);
            if (clip.rotation) ctx.rotate((clip.rotation * Math.PI) / 180);
            if (clip.scale) ctx.scale(clip.scale, clip.scale);
            
            const lines = (clip.textContent || '').split('\n');
            const lineHeight = scaledFontSize * 1.2;
            const startY = 0 - ((lines.length - 1) * lineHeight) / 2;
            
            lines.forEach((line, index) => {
              ctx.fillText(line, 0, startY + index * lineHeight);
            });
            ctx.restore();
          }
        }
      }
      
      if (elapsed < maxDuration) {
        requestAnimationFrame(renderFrame);
      } else {
        hiddenVideo.pause();
        mediaRecorder.stop();
      }
    };
    
    requestAnimationFrame(renderFrame);
  };

  const handleDeleteClip = (trackId: string, clipId: string) => {
    setTracks((current) => current.map((track) => (track.id === trackId ? { ...track, clips: track.clips.filter((clip) => clip.id !== clipId) } : track)));
  };

  const updateClipProperty = (trackId: string, clipId: string, property: keyof Clip, value: any) => {
    setTracks((current) =>
      current.map((track) =>
        track.id === trackId
          ? {
              ...track,
              clips: track.clips.map((clip) => (clip.id === clipId ? { ...clip, [property]: value } : clip)),
            }
          : track
      )
    );
  };

  const handleDeleteAsset = (asset: LibraryAsset) => {
    const shouldDelete = window.confirm(`Delete "${asset.name}" from this project? Timeline clips using it will also be removed.`);
    if (!shouldDelete) return;

    setLibraryAssets((current) => current.filter((item) => item.id !== asset.id));
    setTracks((current) =>
      current.map((track) => ({
        ...track,
        clips: track.clips.filter((clip) => clip.fileUrl !== asset.fileUrl),
      }))
    );
  };

  const activeVideoClip = getActiveVideoClip(playhead);

  const activeTextClips = useMemo(() => {
    const textTrack = tracks.find((track) => track.type === 'text');
    if (!textTrack) return [];
    return textTrack.clips.filter((clip) => playhead >= clip.start && playhead < clip.start + clip.duration);
  }, [playhead, tracks]);

  if (!activeProject) {
    return (
      <div className="h-full overflow-y-auto bg-gray-50 p-6 dark:bg-gray-900">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6">
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
              <Film className="h-6 w-6 text-primary-500" />
              Media Editor
            </h1>
            <p className="mt-1 text-sm text-gray-500">Create a new editing project or continue a saved one.</p>
          </div>

          <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
            <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Create New Project</h2>
              <input
                value={newProjectName}
                onChange={(event) => setNewProjectName(event.target.value)}
                placeholder="Project name"
                className="mt-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              />
              <button
                onClick={createProject}
                disabled={isCreatingProject}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
              >
                {isCreatingProject ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Create Project
              </button>
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Projects</h2>
                <button onClick={loadProjects} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">
                  Refresh
                </button>
              </div>
              {isLoadingProjects ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
                </div>
              ) : projects.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 bg-white py-16 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-950">
                  No saved projects yet.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {projects.map((project) => (
                    <div
                      key={project.id}
                      onClick={() => openProject(project)}
                      className="group relative cursor-pointer rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-primary-500 dark:border-gray-800 dark:bg-gray-950"
                    >
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteProject(project);
                        }}
                        className="absolute right-3 top-3 rounded bg-white/90 p-1.5 text-gray-500 opacity-0 shadow-sm transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 dark:bg-gray-900/90"
                        title="Delete project"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <div className="flex items-start gap-3">
                        <FolderOpen className="mt-0.5 h-5 w-5 text-primary-500" />
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold text-gray-900 dark:text-white">{project.name}</h3>
                          <p className="mt-1 text-xs text-gray-500">{project.assets?.length || 0} assets</p>
                          <p className="mt-1 text-xs text-gray-400">Updated {new Date(project.updated_at).toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full select-none flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col border-r border-gray-200 dark:border-gray-800">
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
            <div className="flex items-center gap-3">
              <button onClick={() => setActiveProject(null)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-900" title="Back to projects">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <Film className="h-5 w-5 text-primary-500" />
              <div>
                <input
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  onBlur={() => saveProject({ name: projectName })}
                  className="w-72 rounded border border-transparent bg-transparent text-lg font-bold text-gray-900 outline-none focus:border-gray-300 focus:bg-white focus:px-2 dark:text-white dark:focus:border-gray-700 dark:focus:bg-gray-900"
                />
                <p className="text-xs text-gray-500">Video, audio, upload, and AI generation workspace</p>
              </div>
            </div>
            <button onClick={() => setIsExportModalOpen(true)} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">
              Export Preview
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-gray-100 p-6 dark:bg-gray-900">
            <div 
              ref={videoContainerRef} 
              className="relative flex aspect-video w-full max-w-4xl items-center justify-center overflow-hidden rounded-lg bg-black shadow-lg"
              onMouseDown={() => setSelectedTextClipId(null)}
            >
              {!activeVideoClip && activeTextClips.length === 0 && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-gray-600">
                  <Film className="mb-4 h-16 w-16 opacity-50" />
                  <p className="text-sm font-medium">No media at current playhead</p>
                </div>
              )}
              <video 
                ref={videoRef} 
                className={`h-full w-full ${activeVideoClip?.fitMode === 'cover' ? 'object-cover' : activeVideoClip?.fitMode === 'fill' ? 'object-fill' : 'object-contain'} ${activeVideoClip ? 'opacity-100' : 'opacity-0'}`} 
                style={{
                  transform: `rotate(${activeVideoClip?.videoRotation || 0}deg) scaleX(${activeVideoClip?.videoFlipX ? -1 : 1}) scaleY(${activeVideoClip?.videoFlipY ? -1 : 1}) scale(${activeVideoClip?.videoScale || 1})`
                }}
                playsInline 
                muted 
              />
              {activeTextClips.map(clip => {
                const posX = clip.position?.x ?? 50;
                const posY = clip.position?.y ?? 50;
                const isSelected = clip.id === selectedTextClipId;
                return (
                  <div 
                    key={clip.id} 
                    className={`absolute z-20 flex items-center justify-center whitespace-pre-wrap select-none p-4 ${isSelected ? 'ring-2 ring-dashed ring-blue-500' : ''}`}
                    style={{ 
                      left: `${posX}%`, 
                      top: `${posY}%`, 
                      transform: `translate(-50%, -50%) rotate(${clip.rotation || 0}deg) scale(${clip.scale || 1})`,
                      cursor: isSelected ? 'move' : 'pointer'
                    }}
                    onMouseDown={(e) => { e.stopPropagation(); setSelectedTextClipId(clip.id); setTransformMode('translate'); }}
                  >
                    <span style={{ fontFamily: clip.fontFamily, fontSize: `${clip.fontSize}px`, color: clip.textColor, textAlign: 'center', textShadow: '2px 2px 4px rgba(0,0,0,0.8)' }}>
                      {clip.textContent}
                    </span>
                    {isSelected && (
                      <>
                        <div 
                          className="absolute -top-7 left-1/2 flex h-6 w-6 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border border-blue-500 bg-white text-blue-500 shadow-sm"
                          onMouseDown={(e) => { e.stopPropagation(); setTransformMode('rotate'); }}
                        >
                          <RotateCw className="h-3 w-3" />
                        </div>
                        <div className="absolute -top-4 left-1/2 h-4 w-[1px] -translate-x-1/2 bg-blue-500" />
                        <div 
                          className="absolute -bottom-3 -right-3 flex h-6 w-6 cursor-nwse-resize items-center justify-center rounded-full border border-blue-500 bg-white text-blue-500 shadow-sm"
                          onMouseDown={(e) => { e.stopPropagation(); setTransformMode('scale'); }}
                        >
                          <Maximize2 className="h-3 w-3" />
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
              <div className="absolute bottom-4 left-4 right-4 z-20 flex items-center justify-center gap-4 rounded-lg bg-gray-900/80 p-2 text-white backdrop-blur">
                <button className="rounded-full p-2 transition-colors hover:bg-white/20" onClick={() => setPlayhead(Math.max(0, playhead - 5))}>
                  <SkipBack className="h-5 w-5" />
                </button>
                <button className="rounded-full bg-primary-500 p-3 transition-colors hover:bg-primary-600" onClick={handlePlayPause}>
                  {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </button>
                <button className="rounded-full p-2 transition-colors hover:bg-white/20" onClick={() => setPlayhead(playhead + 5)}>
                  <SkipForward className="h-5 w-5" />
                </button>
                <div className="w-24 text-center font-mono text-xs">{new Date(playhead * 1000).toISOString().substr(11, 8)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex w-80 shrink-0 flex-col bg-white dark:bg-gray-950 lg:w-96">
          <div className="flex border-b border-gray-200 dark:border-gray-800">
            {[
              { id: 'upload', label: 'Upload' },
              { id: 'ai-video', label: 'AI Video' },
              { id: 'ai-audio', label: 'AI Audio' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as EditorTab)}
                className={`flex-1 border-b-2 py-3 text-sm font-medium ${
                  activeTab === tab.id ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto p-4">
            {activeTab === 'upload' && (
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-8 text-center transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900">
                {isUploading ? <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary-500" /> : <Upload className="mb-3 h-8 w-8 text-gray-400" />}
                <p className="text-sm font-medium text-gray-900 dark:text-white">{isUploading ? 'Processing media...' : 'Click to upload media'}</p>
                <p className="mt-1 text-xs text-gray-500">Video and audio files are supported</p>
                <input type="file" accept="video/*,audio/*" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
              </label>
            )}


            {(activeTab === 'ai-video' || activeTab === 'ai-audio') && (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Model</label>
                  <select
                    value={currentGenerateType === 'audio' ? selectedAudioModel : selectedVideoModel}
                    onChange={(event) => currentGenerateType === 'audio' ? setSelectedAudioModel(event.target.value) : setSelectedVideoModel(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  >
                    {(currentGenerateType === 'audio' ? audioModels : videoModels).map((model) => (
                      <option key={model.id} value={model.id}>{modelOptionLabel(model)}</option>
                    ))}
                  </select>
                  {currentModel?.price_label && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {currentModel.price_label}
                      {currentModel.price_note ? ` - ${currentModel.price_note}` : ''}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{currentGenerateType === 'audio' ? 'Text' : 'Prompt'}</label>
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    rows={5}
                    placeholder={currentGenerateType === 'audio' ? 'Type the speech text...' : 'Describe the video...'}
                    className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  />
                </div>
                {currentModel?.requires_image && (
                  <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900/60">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Source Image URL</label>
                      <input
                        value={imageUrl}
                        onChange={(event) => setImageUrl(event.target.value)}
                        placeholder="https://..."
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Or Upload Image</label>
                      <div className="flex gap-2">
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(event) => setSourceImageFile(event.target.files?.[0] || null)}
                          className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                        />
                        <button
                          type="button"
                          onClick={handleSourceImageUpload}
                          disabled={!sourceImageFile || isUploadingSourceImage}
                          className="shrink-0 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
                        >
                          {isUploadingSourceImage ? 'Uploading...' : 'Upload'}
                        </button>
                      </div>
                    </div>
                    {imageUrl && (
                      <div className="rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-950">
                        <p className="mb-2 truncate text-xs text-gray-500 dark:text-gray-400">{imageUrl}</p>
                        <img src={imageUrl} alt="Source preview" className="max-h-40 w-full rounded object-contain" />
                      </div>
                    )}
                  </div>
                )}
                {currentGenerateType === 'video' && (
                  <div className="grid grid-cols-2 gap-2">
                    {currentOptions.aspect_ratios?.length ? (
                      <SelectField label="Aspect" value={aspectRatio} onChange={setAspectRatio} options={currentOptions.aspect_ratios} />
                    ) : null}
                    {currentOptions.resolutions?.length ? (
                      <SelectField label="Resolution" value={resolution} onChange={setResolution} options={currentOptions.resolutions} />
                    ) : null}
                    {currentOptions.durations?.length ? (
                      <SelectField label="Duration" value={duration} onChange={setDuration} options={currentOptions.durations} />
                    ) : null}
                    {currentModel?.supports_generate_audio ? (
                      <label className="flex min-h-[58px] items-center gap-3 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300">
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
                {currentGenerateType === 'audio' && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Voice</label>
                    <input value={voice} onChange={(event) => setVoice(event.target.value)} placeholder="Optional voice name" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
                  </div>
                )}
                <div className={`grid gap-2 ${currentOptions.qualities?.length ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {currentOptions.qualities?.length ? (
                    <SelectField label="Quality" value={quality} onChange={setQuality} options={currentOptions.qualities} />
                  ) : null}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Seed</label>
                    <input value={seed} onChange={(event) => setSeed(event.target.value.replace(/[^\d]/g, ''))} placeholder="Optional" className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
                  </div>
                </div>
                {generationError && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{generationError}</div>}
                <button onClick={handleGenerate} disabled={isGenerating || !prompt.trim()} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50">
                  {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  {isGenerating ? 'Generating...' : `Generate ${currentGenerateType === 'audio' ? 'Audio' : 'Video'}`}
                </button>
              </div>
            )}

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white">Media Library</h3>
                <button onClick={() => setLibraryViewMode((mode) => mode === 'list' ? 'grid' : 'list')} className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-white" title={libraryViewMode === 'list' ? 'Switch to Grid View' : 'Switch to List View'}>
                  {libraryViewMode === 'list' ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />}
                </button>
              </div>
              <p className="mb-3 text-xs text-gray-500">Drag items from here onto matching timeline tracks.</p>
              {libraryAssets.length === 0 && (
                <div className="rounded border border-dashed border-gray-200 bg-gray-50 p-4 text-center text-xs text-gray-400 dark:border-gray-800 dark:bg-gray-900">
                  Empty library
                </div>
              )}
              <div className={libraryViewMode === 'list' ? 'space-y-2' : 'grid grid-cols-2 gap-2'}>
                {libraryAssets.map((asset) => (
                  <div key={asset.id} draggable onDragStart={(event) => handleDragStartAsset(event, asset)} className={`group relative flex ${libraryViewMode === 'grid' ? 'flex-col' : 'items-center'} cursor-grab gap-3 rounded border border-gray-200 bg-white p-2 shadow-sm transition-colors hover:border-primary-500 active:cursor-grabbing dark:border-gray-800 dark:bg-gray-950`}>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeleteAsset(asset);
                      }}
                      onDragStart={(event) => event.preventDefault()}
                      className="absolute right-2 top-2 z-10 rounded bg-white/90 p-1 text-gray-500 opacity-0 shadow-sm transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 dark:bg-gray-900/90"
                      title="Delete from library"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    {libraryViewMode === 'grid' && asset.thumbnail ? (
                      <div className="aspect-video w-full overflow-hidden rounded bg-black">
                        <img src={asset.thumbnail} alt={asset.name} className="h-full w-full object-cover" />
                      </div>
                    ) : (
                      <div className={libraryViewMode === 'grid' ? 'flex aspect-video w-full items-center justify-center rounded bg-gray-100 dark:bg-gray-900' : ''}>
                        {asset.type === 'video' ? <Film className="h-5 w-5 text-indigo-500" /> : <Music className="h-5 w-5 text-emerald-500" />}
                      </div>
                    )}
                    <div className={`min-w-0 ${libraryViewMode === 'grid' ? 'w-full' : 'flex-1'}`}>
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-white" title={asset.name}>{asset.name}</p>
                      <p className="text-xs text-gray-500">{(asset.duration || 0).toFixed(1)}s {asset.source === 'ai' ? 'AI' : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="relative flex h-64 shrink-0 flex-col border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
        <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 p-2 dark:border-gray-800 dark:bg-gray-900">
          <span className="px-2 text-xs font-medium text-gray-500">Timeline</span>
          <div className="mx-2 h-4 w-px bg-gray-300 dark:bg-gray-700" />
          <button 
             onClick={(e) => {
               e.stopPropagation();
               setTextMenu({ x: Math.min(e.clientX, window.innerWidth - 280), y: Math.min(e.clientY, window.innerHeight - 350) });
             }}
             className="rounded p-1 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800"
             title="Add Text Overlay"
          >
            <Type className="h-4 w-4" />
          </button>
        </div>
        <div className="relative flex-1 overflow-auto bg-gray-100 dark:bg-gray-900" ref={timelineRef}>
          <div className="sticky top-0 z-10 flex h-6 cursor-pointer border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900" onClick={(event) => {
            if (timelineRef.current) {
              const rect = timelineRef.current.getBoundingClientRect();
              const x = Math.max(0, event.clientX - rect.left - 136);
              setPlayhead(x / PIXELS_PER_SECOND);
            }
          }}>
            <div className="w-[136px] shrink-0 border-r border-gray-300 dark:border-gray-700" />
            <div className="relative flex-1" />
          </div>
          <div className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-red-500" style={{ left: `${136 + playhead * PIXELS_PER_SECOND}px` }}>
            <div className="absolute -left-[3.5px] -top-[6px] h-0 w-0 border-l-[4px] border-r-[4px] border-t-[6px] border-l-transparent border-r-transparent border-t-red-500" />
          </div>
          <div className="space-y-2 p-2">
            {tracks.map((track) => (
              <div key={track.id} className="relative flex h-16 gap-2">
                <div className="sticky left-2 z-10 flex w-32 shrink-0 flex-col justify-center rounded border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                    {track.type === 'video' ? <Film className="h-3 w-3" /> : track.type === 'text' ? <Type className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                    <span className="truncate">{track.name}</span>
                  </div>
                </div>
                <div className="relative min-w-[2000px] flex-1 overflow-hidden rounded bg-gray-200 dark:bg-gray-800/50" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDropOnTrack(event, track.id)}>
                  <div className="pointer-events-none absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMTAwJSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMCAwdjEwMGgxVjB6IiBmaWxsPSJyZ2JhKDE1NiwgMTYzLCAxNzUsIDAuMSkiLz48L3N2Zz4=')]" />
                  {track.clips.map((clip) => (
                    <div key={clip.id} className={`absolute bottom-1 top-1 flex items-center rounded shadow-sm transition-shadow ${clip.color} ${dragState?.clipId === clip.id ? 'z-10 ring-2 ring-primary-500' : ''}`} style={{ left: `${clip.start * PIXELS_PER_SECOND}px`, width: `${clip.duration * PIXELS_PER_SECOND}px` }} onMouseDown={(event) => handleMouseDownTimeline(event, clip, track.id, 'move')} onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setContextMenu({ x: event.clientX, y: event.clientY, trackId: track.id, clipId: clip.id });
                    }}>
                      <div className="absolute bottom-0 left-0 top-0 flex w-2 cursor-ew-resize items-center justify-center rounded-l bg-black/20 hover:bg-black/40" onMouseDown={(event) => handleMouseDownTimeline(event, clip, track.id, 'trimLeft')}>
                        <div className="h-4 w-0.5 rounded-full bg-white/50" />
                      </div>
                      <span className="pointer-events-none truncate px-3 text-[10px] font-medium text-white drop-shadow-md">
                        {clip.name} ({clip.trimStart.toFixed(1)}s - {(clip.trimStart + clip.duration).toFixed(1)}s)
                      </span>
                      <div className="absolute bottom-0 right-0 top-0 flex w-2 cursor-ew-resize items-center justify-center rounded-r bg-black/20 hover:bg-black/40" onMouseDown={(event) => handleMouseDownTimeline(event, clip, track.id, 'trimRight')}>
                        <div className="h-4 w-0.5 rounded-full bg-white/50" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {contextMenu && (() => {
          const track = tracks.find(t => t.id === contextMenu.trackId);
          const clip = track?.clips.find(c => c.id === contextMenu.clipId);
          if (!track || !clip) return null;
          const isVideo = clip.type === 'video';
          
          return (
            <div 
              className="fixed z-50 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-800" 
              style={{ 
                ...(window.innerHeight - contextMenu.y < 400 ? { bottom: window.innerHeight - contextMenu.y } : { top: contextMenu.y }),
                ...(window.innerWidth - contextMenu.x < 250 ? { right: window.innerWidth - contextMenu.x } : { left: contextMenu.x })
              }}
            >
              {isVideo && (
                <>
                  <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Fit Mode</div>
                  <button className={`flex w-full px-4 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${clip.fitMode === 'contain' || !clip.fitMode ? 'font-bold text-primary-500' : 'text-gray-700 dark:text-gray-300'}`} onClick={() => updateClipProperty(track.id, clip.id, 'fitMode', 'contain')}>Fit (Contain)</button>
                  <button className={`flex w-full px-4 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${clip.fitMode === 'cover' ? 'font-bold text-primary-500' : 'text-gray-700 dark:text-gray-300'}`} onClick={() => updateClipProperty(track.id, clip.id, 'fitMode', 'cover')}>Fill (Cover)</button>
                  <button className={`flex w-full px-4 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${clip.fitMode === 'fill' ? 'font-bold text-primary-500' : 'text-gray-700 dark:text-gray-300'}`} onClick={() => updateClipProperty(track.id, clip.id, 'fitMode', 'fill')}>Stretch (Fill)</button>
                  
                  <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
                  
                  <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Transform</div>
                  <button className="flex w-full px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700" onClick={() => updateClipProperty(track.id, clip.id, 'videoRotation', ((clip.videoRotation || 0) + 90) % 360)}>Rotate 90°</button>
                  <button className="flex w-full px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700" onClick={() => updateClipProperty(track.id, clip.id, 'videoFlipX', !clip.videoFlipX)}>Flip Horizontal</button>
                  <button className="flex w-full px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700" onClick={() => updateClipProperty(track.id, clip.id, 'videoFlipY', !clip.videoFlipY)}>Flip Vertical</button>
                  
                  <div className="flex w-full items-center justify-between px-4 py-1.5 text-sm text-gray-700 dark:text-gray-300">
                    <span>Scale</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateClipProperty(track.id, clip.id, 'videoScale', Math.max(0.1, (clip.videoScale || 1) - 0.1))} className="rounded bg-gray-100 px-2 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600">-</button>
                      <span className="w-10 text-center text-xs">{Math.round((clip.videoScale || 1) * 100)}%</span>
                      <button onClick={() => updateClipProperty(track.id, clip.id, 'videoScale', (clip.videoScale || 1) + 0.1)} className="rounded bg-gray-100 px-2 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600">+</button>
                    </div>
                  </div>
                  
                  <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
                </>
              )}
              <button className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700" onClick={(event) => {
                event.stopPropagation();
                handleDeleteClip(contextMenu.trackId, contextMenu.clipId);
                setContextMenu(null);
              }}>
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          );
        })()}
        {textMenu && (
          <div 
            className="fixed z-50 w-64 rounded-lg border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-gray-800" 
            style={{ 
              ...(window.innerHeight - textMenu.y < 350 ? { bottom: window.innerHeight - textMenu.y } : { top: textMenu.y }),
              ...(window.innerWidth - textMenu.x < 280 ? { right: window.innerWidth - textMenu.x } : { left: textMenu.x })
            }} 
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 cursor-move text-sm font-semibold text-gray-900 dark:text-white" onMouseDown={handleMenuDragStart}>Add Text Overlay</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Text Content</label>
                <textarea
                  value={textContent}
                  onChange={(event) => setTextContent(event.target.value)}
                  rows={2}
                  placeholder="Enter text overlay..."
                  className="w-full resize-none rounded-md border border-gray-300 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <SelectField label="Font" value={textFont} onChange={setTextFont} options={['Arial', 'Times New Roman', 'Courier New', 'Impact', 'Georgia', 'Verdana']} />
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Size</label>
                  <input type="number" value={textSize} onChange={(event) => setTextSize(Number(event.target.value))} className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Color</label>
                <input type="color" value={textColor} onChange={(event) => setTextColor(event.target.value)} className="h-8 w-full cursor-pointer rounded border border-gray-300 p-0.5 dark:border-gray-700 dark:bg-gray-900" />
              </div>
              <button onClick={handleAddText} disabled={!textContent.trim()} className="flex w-full items-center justify-center gap-2 rounded-md bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50">
                <Type className="h-4 w-4" />
                Add to Timeline
              </button>
            </div>
          </div>
        )}
        {/* Export Modal */}
        {isExportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Export Video</h2>
                {!isExporting && (
                  <button onClick={() => setIsExportModalOpen(false)} className="rounded-full p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800">
                    <X className="h-5 w-5" />
                  </button>
                )}
              </div>
              
              <div className="mb-6 space-y-4">
                <SelectField 
                  label="Resolution" 
                  value={exportResolution} 
                  onChange={setExportResolution} 
                  options={['480p', '720p', '1080p', '4K']} 
                />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Exporting will process all video, audio, and text tracks currently on your timeline into a single file.
                </p>
              </div>

              {isExporting ? (
                <div className="space-y-3">
                  <div className="flex justify-between text-sm font-medium">
                    <span className="text-gray-700 dark:text-gray-300">Rendering...</span>
                    <span className="text-primary-600 dark:text-primary-400">{exportProgress}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                    <div 
                      className="h-full bg-primary-500 transition-all duration-75 ease-linear" 
                      style={{ width: `${exportProgress}%` }}
                    />
                  </div>
                </div>
              ) : exportComplete ? (
                <div className="flex flex-col items-center gap-4 py-4">
                  <div className="rounded-full bg-green-100 p-3 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                    <Download className="h-8 w-8" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">Export Complete!</h3>
                  <div className="flex w-full justify-end gap-3 mt-4">
                    <button 
                      onClick={() => setIsExportModalOpen(false)}
                      className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                      Close
                    </button>
                    <a 
                      href={exportVideoUrl || '#'}
                      download={`exported_video_${exportResolution}.mov`}
                      className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
                    >
                      <Download className="h-4 w-4" />
                      Download Video
                    </a>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end gap-3">
                  <button 
                    onClick={() => setIsExportModalOpen(false)}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleExport}
                    className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
                  >
                    <Wand2 className="h-4 w-4" />
                    Start Export
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">{label}</label>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white">
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </div>
  );
}
