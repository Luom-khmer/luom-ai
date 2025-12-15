/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppControls, useImageEditor, type ImageForZip, downloadAllImagesAsZip, downloadJson, useDebounce } from './uiUtils';
import { GalleryPicker } from './uiComponents';
import { useLightbox } from './uiHooks';
import { downloadImage } from './uiFileUtilities';
import type { SceneState, VideoTask } from './uiTypes';
import { CloseIcon, CloudUploadIcon, UndoIcon, RedoIcon, LoadingSpinnerIcon } from './icons';
import { createScriptSummaryFromIdea, createScriptSummaryFromText, createScriptSummaryFromAudio, developScenesFromSummary, type ScriptSummary, generateVideoPromptFromScenes, refineSceneDescription, refineSceneTransition, startVideoGeneration, pollVideoOperation } from '../services/geminiService';
import { generateFreeImage } from '../services/gemini/freeGenerationService';
import toast from 'react-hot-toast';
import StoryboardingInput from './storyboarding/StoryboardingInput';
import StoryboardingSummary from './storyboarding/StoryboardingSummary';
import StoryboardingScenes from './storyboarding/StoryboardingScenes';
import Lightbox from './Lightbox';
import * as db from '../lib/db';


interface StoryboardingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onHide: () => void;
}

type InputMethod = 'prompt' | 'text' | 'audio';

const parseDataUrlForComponent = (imageDataUrl: string): { mimeType: string; data: string } => {
    const match = imageDataUrl.match(/^data:(image\/\w+);base64,(.*)$/);
    if (!match) {
        throw new Error("Invalid image data URL format.");
    }
    const [, mimeType, data] = match;
    return { mimeType, data };
}

const dataURLtoFile = (dataUrl: string, filename: string, fileType: string): File => {
    const arr = dataUrl.split(',');
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: fileType });
};

export const StoryboardingModal: React.FC<StoryboardingModalProps> = ({ isOpen, onClose, onHide }) => {
    const { t, language, addImagesToGallery, imageGallery } = useAppControls();
    const { openImageEditor } = useImageEditor();
    const { lightboxIndex, openLightbox, closeLightbox, navigateLightbox } = useLightbox();

    const [activeInput, setActiveInput] = useState<InputMethod>('prompt');
    const [idea, setIdea] = useState('');
    const [scriptText, setScriptText] = useState('');
    const [audioFile, setAudioFile] = useState<File | null>(null);
    const [referenceImages, setReferenceImages] = useState<string[]>([]);
    
    const [scriptSummary, setScriptSummary] = useState<ScriptSummary | null>(null);
    const [scenes, setScenes] = useState<SceneState[]>([]);
    
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [error, setError] = useState<string | null>(null);
    
    const [isGalleryPickerOpen, setIsGalleryPickerOpen] = useState(false);
    const [isDraggingRef, setIsDraggingRef] = useState(false);
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const [pickingCustomImageFor, setPickingCustomImageFor] = useState<{index: number, frameType: 'start' | 'end'} | null>(null);
    
    const [style, setStyle] = useState('');
    const [numberOfScenes, setNumberOfScenes] = useState(0);
    const [aspectRatio, setAspectRatio] = useState('16:9');
    const [notes, setNotes] = useState('');
    const [storyboardLanguage, setStoryboardLanguage] = useState<'vi' | 'en' | 'zh'>('vi');
    const [scriptType, setScriptType] = useState<'auto' | 'dialogue' | 'action'>('auto');
    const [keepClothing, setKeepClothing] = useState(false);
    const [keepBackground, setKeepBackground] = useState(false);

    const [audioData, setAudioData] = useState<{ name: string; type: string; dataUrl: string } | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    // NEW: State for Undo/Redo
    const [history, setHistory] = useState<SceneState[][]>([[]]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const canUndo = historyIndex > 0;
    const canRedo = historyIndex < history.length - 1;

    const audioInputRef = useRef<HTMLInputElement>(null);
    const textInputRef = useRef<HTMLInputElement>(null);
    const importInputRef = useRef<HTMLInputElement>(null);
    const customImageUploadRef = useRef<HTMLInputElement>(null);
    const [uploadingImageFor, setUploadingImageFor] = useState<{index: number, frameType: 'start' | 'end'} | null>(null);

    const scenesRef = useRef(scenes);
    useEffect(() => {
        scenesRef.current = scenes;
    }, [scenes]);


    const aspectRatioOptions: string[] = t('storyboarding_aspectRatioOptions');
    const styleOptions: any[] = useMemo(() => t('storyboarding_styleOptions'), [t]);

    // --- NEW: History Management ---
    const updateScenesAndHistory = useCallback((newScenes: SceneState[]) => {
        const currentScenes = history[historyIndex];
        if (currentScenes && JSON.stringify(newScenes) === JSON.stringify(currentScenes)) {
            return;
        }
        
        setScenes(newScenes);

        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(newScenes);
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
    }, [history, historyIndex]);

    const handleUndo = useCallback(() => {
        if (canUndo) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            setScenes(history[newIndex]);
        }
    }, [history, historyIndex, canUndo]);

    const handleRedo = useCallback(() => {
        if (canRedo) {
            const newIndex = historyIndex + 1;
            setHistoryIndex(newIndex);
            setScenes(history[newIndex]);
        }
    }, [history, historyIndex, canRedo]);

    const handleStyleChange = (displayValue: string) => {
        if (!displayValue) {
            setStyle(''); // Handle empty selection, which means "Auto"
            return;
        }
        const match = displayValue.match(/\(([^)]+)\)/);
        const aiValue = match ? match[1] : displayValue;
        setStyle(aiValue);
    };
    
    const displayStyleValue = useMemo(() => {
        if (!style) return '';
        const allOptions: string[] = styleOptions.flatMap((opt: any) =>
            typeof opt === 'string' ? [opt] : (opt.options || [])
        );
        for (const fullDisplayValue of allOptions) {
            const match = fullDisplayValue.match(/\(([^)]+)\)/);
            const aiValue = match ? match[1] : fullDisplayValue;
            if (aiValue === style) {
                return fullDisplayValue;
            }
        }
        return style;
    }, [style, styleOptions]);


    const resetState = useCallback(() => {
        setActiveInput('prompt');
        setIdea('');
        setScriptText('');
        setAudioFile(null);
        setReferenceImages([]);
        setScriptSummary(null);
        setScenes([]);
        setIsLoading(false);
        setLoadingMessage('');
        setError(null);
        setStyle('');
        setNumberOfScenes(0);
        setAspectRatio(aspectRatioOptions[0] || '16:9');
        setNotes('');
        setStoryboardLanguage('vi');
        setScriptType('auto');
        setKeepClothing(false);
        setKeepBackground(false);
        setHistory([[]]);
        setHistoryIndex(0);
    }, [aspectRatioOptions]);

    const handleNew = () => {
        resetState();
        db.clearStoryboardState();
        toast.success("Storyboard mới đã được tạo.");
    };

    useEffect(() => {
        if (isOpen) {
            const loadState = async () => {
                const savedState = await db.loadStoryboardState();
                if (savedState) {
                    setActiveInput(savedState.activeInput || 'prompt');
                    setIdea(savedState.idea || '');
                    setScriptText(savedState.scriptText || '');
                    if (savedState.audioData) {
                        const file = dataURLtoFile(savedState.audioData.dataUrl, savedState.audioData.name, savedState.audioData.type);
                        setAudioFile(file);
                    } else {
                        setAudioFile(null);
                    }
                    setReferenceImages(savedState.referenceImages || []);
                    setScriptSummary(savedState.scriptSummary || null);
                    
                    const initialScenes = savedState.scenes || [];
                    setScenes(initialScenes);
                    setHistory([initialScenes]);
                    setHistoryIndex(0);

                    setStyle(savedState.style || '');
                    setNumberOfScenes(savedState.numberOfScenes ?? 0);
                    setAspectRatio(savedState.aspectRatio || aspectRatioOptions[0]);
                    setNotes(savedState.notes || '');
                    setStoryboardLanguage(savedState.storyboardLanguage || 'vi');
                    setScriptType(savedState.scriptType || 'auto');
                    setKeepClothing(savedState.keepClothing || false);
                    setKeepBackground(savedState.keepBackground || false);
                }
                setIsLoaded(true);
            };
            loadState();
        } else {
            setIsLoaded(false);
        }
    }, [isOpen, aspectRatioOptions]);

    useEffect(() => {
        if (audioFile) {
            const reader = new FileReader();
            reader.onloadend = () => {
                if (reader.result) {
                    setAudioData({
                        name: audioFile.name,
                        type: audioFile.type,
                        dataUrl: reader.result as string,
                    });
                }
            };
            reader.readAsDataURL(audioFile);
        } else {
            setAudioData(null);
        }
    }, [audioFile]);

    const debouncedState = useDebounce({
        activeInput, idea, scriptText, audioData, referenceImages,
        scriptSummary, scenes, style, numberOfScenes, aspectRatio, notes, storyboardLanguage,
        scriptType, keepClothing, keepBackground
    }, 1000);

    useEffect(() => {
        if (isOpen && isLoaded) {
            db.saveStoryboardState(debouncedState);
        }
    }, [debouncedState, isOpen, isLoaded]);

    const mapServiceSceneToState = (s: any): SceneState => ({
        scene: s.scene,
        startFrame: {
            description: s.startFrameDescription,
            status: 'idle',
            imageSource: 'reference',
            imageUrl: undefined,
            error: undefined
        },
        animationDescription: s.animationDescription,
        videoPrompt: undefined,
        endFrame: {
            description: s.endFrameDescription,
            status: 'idle',
            imageSource: 'reference',
            imageUrl: undefined,
            error: undefined
        },
        videoStatus: 'idle',
        videoUrl: undefined,
        videoError: undefined,
        videoOperation: undefined
    });

    const handleGenerateScript = async () => {
        setIsLoading(true);
        setError(null);
        setLoadingMessage(t('storyboarding_generating_scenario'));

        try {
            // 1. Create Summary
            let summary: ScriptSummary;
            const refImagesData = await Promise.all(referenceImages.map(async (url) => {
                const { mimeType, data } = parseDataUrlForComponent(url);
                return { mimeType, data };
            }));
            
            const options = {
                 style, 
                 numberOfScenes, 
                 aspectRatio, 
                 notes,
                 keepClothing,
                 keepBackground
            };

            if (activeInput === 'prompt') {
                if (!idea.trim()) throw new Error(t('storyboarding_error_noIdea'));
                summary = await createScriptSummaryFromIdea(idea, refImagesData, options, storyboardLanguage, scriptType);
            } else if (activeInput === 'text') {
                if (!scriptText.trim()) throw new Error(t('storyboarding_error_noText'));
                summary = await createScriptSummaryFromText(scriptText, refImagesData, options, storyboardLanguage, scriptType);
            } else {
                 if (!audioData) throw new Error(t('storyboarding_error_noAudio'));
                 summary = await createScriptSummaryFromAudio({ mimeType: audioData.type, data: audioData.dataUrl.split(',')[1] }, refImagesData, options, storyboardLanguage, scriptType);
            }
            
            setScriptSummary(summary);
            
            // 2. Develop Scenes
            setLoadingMessage(t('storyboarding_developing_scenes'));
            const fullScenario = await developScenesFromSummary(summary, storyboardLanguage, scriptType);
            
            const newScenes = fullScenario.scenes.map(mapServiceSceneToState);
            updateScenesAndHistory(newScenes);

        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : t('storyboarding_error_scenario'));
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    };
    
     const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'text' | 'audio') => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (type === 'text') {
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (typeof ev.target?.result === 'string') {
                    setScriptText(ev.target.result);
                }
            };
            reader.readAsText(file);
        } else {
            setAudioFile(file);
        }
    };
    
    // --- Scene Handlers ---
    const handleAddScene = () => {
        const newScene: SceneState = {
            scene: scenes.length + 1,
            startFrame: { description: '', status: 'idle', imageSource: 'reference' },
            animationDescription: '',
            endFrame: { description: '', status: 'idle', imageSource: 'reference' },
            videoStatus: 'idle'
        };
        updateScenesAndHistory([...scenes, newScene]);
    };

    const handleDeleteScene = (index: number) => {
        const newScenes = scenes.filter((_, i) => i !== index).map((s, i) => ({ ...s, scene: i + 1 }));
        updateScenesAndHistory(newScenes);
    };

    const handleMoveScene = (index: number, direction: 'up' | 'down') => {
        if ((direction === 'up' && index === 0) || (direction === 'down' && index === scenes.length - 1)) return;
        const newScenes = [...scenes];
        const swapIndex = direction === 'up' ? index - 1 : index + 1;
        [newScenes[index], newScenes[swapIndex]] = [newScenes[swapIndex], newScenes[index]];
        // Renumber scenes
        newScenes.forEach((s, i) => s.scene = i + 1);
        updateScenesAndHistory(newScenes);
    };

    const handleGenerateImage = async (index: number, frameType: 'start' | 'end') => {
        const scene = scenes[index];
        const frame = frameType === 'start' ? scene.startFrame : scene.endFrame;

        const newScenes = [...scenes];
        if (frameType === 'start') {
            newScenes[index].startFrame.status = 'pending';
            newScenes[index].startFrame.error = undefined;
        } else {
            newScenes[index].endFrame.status = 'pending';
            newScenes[index].endFrame.error = undefined;
        }
        setScenes(newScenes); // Optimistic update for UI

        try {
            // Determine source image
            let sourceImage: string | undefined;
            if (frame.imageSource === 'reference') {
                 // Use first reference image if available, otherwise just use prompt
                sourceImage = referenceImages.length > 0 ? referenceImages[0] : undefined;
            } else if (frame.imageSource.startsWith('data:image')) {
                sourceImage = frame.imageSource;
            } else {
                // Handle inter-scene references (e.g., "0-start")
                const [sourceSceneIndexStr, sourceFrameType] = frame.imageSource.split('-');
                const sourceSceneIndex = parseInt(sourceSceneIndexStr, 10);
                if (!isNaN(sourceSceneIndex) && scenesRef.current[sourceSceneIndex]) {
                     const sourceScene = scenesRef.current[sourceSceneIndex];
                     if (sourceFrameType === 'start') sourceImage = sourceScene.startFrame.imageUrl;
                     else if (sourceFrameType === 'end') sourceImage = sourceScene.endFrame.imageUrl;
                }
            }

            const prompt = frame.description + (style ? `, style: ${style}` : '');
            
            // Call generation service
            const resultUrls = await generateFreeImage(
                prompt,
                1,
                aspectRatio,
                sourceImage,
                undefined, undefined, undefined,
                false // removeWatermark
            );

            if (resultUrls.length > 0) {
                const newUrl = resultUrls[0];
                const updatedScenes = [...scenesRef.current];
                if (frameType === 'start') {
                    updatedScenes[index].startFrame.status = 'done';
                    updatedScenes[index].startFrame.imageUrl = newUrl;
                } else {
                    updatedScenes[index].endFrame.status = 'done';
                    updatedScenes[index].endFrame.imageUrl = newUrl;
                }
                updateScenesAndHistory(updatedScenes);
                addImagesToGallery([newUrl]);
            } else {
                 throw new Error(t('storyboarding_error_noImage'));
            }
        } catch (err) {
            const updatedScenes = [...scenesRef.current];
            const errorMsg = err instanceof Error ? err.message : t('storyboarding_error_imageGen');
            if (frameType === 'start') {
                updatedScenes[index].startFrame.status = 'error';
                updatedScenes[index].startFrame.error = errorMsg;
            } else {
                updatedScenes[index].endFrame.status = 'error';
                updatedScenes[index].endFrame.error = errorMsg;
            }
            setScenes(updatedScenes);
        }
    };
    
    // ... Additional Handlers ...
     const handleEditSceneDescription = (index: number, frameType: 'start' | 'end', newDescription: string) => {
        const newScenes = [...scenes];
        if (frameType === 'start') newScenes[index].startFrame.description = newDescription;
        else newScenes[index].endFrame.description = newDescription;
        updateScenesAndHistory(newScenes);
    };

    const handleEditSceneAnimation = (index: number, newAnimation: string) => {
        const newScenes = [...scenes];
        newScenes[index].animationDescription = newAnimation;
        updateScenesAndHistory(newScenes);
    };

    const handleImageSourceChange = (index: number, frameType: 'start' | 'end', newSource: string) => {
        const newScenes = [...scenes];
        if (frameType === 'start') newScenes[index].startFrame.imageSource = newSource;
        else newScenes[index].endFrame.imageSource = newSource;
        updateScenesAndHistory(newScenes);
    };
    
    const handleSelectCustomImage = (index: number, frameType: 'start' | 'end') => {
        setPickingCustomImageFor({ index, frameType });
        setIsGalleryPickerOpen(true);
    };

    const handleUploadCustomImage = (index: number, frameType: 'start' | 'end') => {
        setUploadingImageFor({ index, frameType });
        customImageUploadRef.current?.click();
    };

    const handleCustomImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0] && uploadingImageFor) {
            handleImageFile(e.target.files[0], uploadingImageFor.index, uploadingImageFor.frameType);
        }
        setUploadingImageFor(null);
        e.target.value = ''; // Reset input
    };

    const handleImageFile = (file: File, index: number, frameType: 'start' | 'end') => {
         const reader = new FileReader();
         reader.onloadend = () => {
             if (typeof reader.result === 'string') {
                 const newScenes = [...scenes];
                 const frame = frameType === 'start' ? newScenes[index].startFrame : newScenes[index].endFrame;
                 
                 // If dragging onto an existing image, update imageUrl (manual override/upload)
                 // If just setting source, update imageSource.
                 // Here we treat drag/drop as setting the imageUrl directly for viewing/using
                 frame.imageUrl = reader.result;
                 frame.status = 'done';
                 frame.imageSource = reader.result; // Also set as source for consistency if regenerating
                 
                 updateScenesAndHistory(newScenes);
                 addImagesToGallery([reader.result]);
             }
         };
         reader.readAsDataURL(file);
    };

    const handleClearImage = (index: number, frameType: 'start' | 'end') => {
        const newScenes = [...scenes];
        if (frameType === 'start') {
            newScenes[index].startFrame.imageUrl = undefined;
            newScenes[index].startFrame.status = 'idle';
        } else {
             newScenes[index].endFrame.imageUrl = undefined;
             newScenes[index].endFrame.status = 'idle';
        }
        updateScenesAndHistory(newScenes);
    };

    const handleEditImage = (index: number, frameType: 'start' | 'end') => {
        const scene = scenes[index];
        const frame = frameType === 'start' ? scene.startFrame : scene.endFrame;
        if (frame.imageUrl) {
            openImageEditor(frame.imageUrl, (newUrl) => {
                const newScenes = [...scenes];
                if (frameType === 'start') {
                    newScenes[index].startFrame.imageUrl = newUrl;
                    newScenes[index].startFrame.imageSource = newUrl;
                } else {
                    newScenes[index].endFrame.imageUrl = newUrl;
                    newScenes[index].endFrame.imageSource = newUrl;
                }
                updateScenesAndHistory(newScenes);
                addImagesToGallery([newUrl]);
            });
        }
    };

    const handlePreviewImage = (index: number, frameType: 'start' | 'end') => {
        const scene = scenes[index];
        const url = frameType === 'start' ? scene.startFrame.imageUrl : scene.endFrame.imageUrl;
        if (url) {
            const imgIndex = lightboxImages.indexOf(url);
            if (imgIndex !== -1) {
                openLightbox(imgIndex);
            }
        }
    };

    const handleDownloadImage = (index: number, frameType: 'start' | 'end') => {
        const scene = scenes[index];
        const url = frameType === 'start' ? scene.startFrame.imageUrl : scene.endFrame.imageUrl;
        if (url) {
            downloadImage(url, `scene-${scene.scene}-${frameType}`);
        }
    };

    const handleGallerySelect = (url: string) => {
        if (pickingCustomImageFor) {
            const { index, frameType } = pickingCustomImageFor;
            const newScenes = [...scenes];
             if (frameType === 'start') {
                newScenes[index].startFrame.imageSource = url;
                newScenes[index].startFrame.imageUrl = url; // Also set as current image
                newScenes[index].startFrame.status = 'done';
            } else {
                newScenes[index].endFrame.imageSource = url;
                 newScenes[index].endFrame.imageUrl = url;
                 newScenes[index].endFrame.status = 'done';
            }
            updateScenesAndHistory(newScenes);
            setPickingCustomImageFor(null);
            setIsGalleryPickerOpen(false);
        } else if (referenceImages.length < 4) {
             setReferenceImages(prev => [...prev, url]);
             setIsGalleryPickerOpen(false);
        }
    };
    
    // --- Video Generation Handlers ---
    const handleGenerateVideoPrompt = async (index: number, promptMode: 'auto' | 'start-end' | 'json') => {
        const scene = scenes[index];
        
        try {
            const prompt = await generateVideoPromptFromScenes(
                scene.startFrame.description, 
                scene.animationDescription, 
                scene.endFrame.description, 
                storyboardLanguage, 
                promptMode, 
                scriptType
            );
            const newScenes = [...scenes];
            newScenes[index].videoPrompt = prompt;
            updateScenesAndHistory(newScenes);
            toast.success(t('common_promptCopied')); // Optionally notify user
        } catch (error) {
             console.error(error);
             toast.error(t('storyboarding_error_videoPromptMissing'));
        }
    };

    const handleEditSceneVideoPrompt = (index: number, newPrompt: string) => {
        const newScenes = [...scenes];
        newScenes[index].videoPrompt = newPrompt;
        updateScenesAndHistory(newScenes);
    };

    const handleGenerateVideo = async (index: number) => {
        const scene = scenes[index];
        if (!scene.startFrame.imageUrl || !scene.videoPrompt) {
            toast.error(t('storyboarding_error_videoInputs'));
            return;
        }

        const newScenes = [...scenes];
        newScenes[index].videoStatus = 'pending';
        newScenes[index].videoError = undefined;
        setScenes(newScenes);

        try {
            const image = parseDataUrlForComponent(scene.startFrame.imageUrl);
            const op = await startVideoGeneration(scene.videoPrompt, image);
            
            // Update with operation
            const scenesWithOp = [...scenesRef.current];
            scenesWithOp[index].videoOperation = op;
            setScenes(scenesWithOp);

            // Poll
            let pollResult;
            while(true) {
                 await new Promise(resolve => setTimeout(resolve, 5000));
                 pollResult = await pollVideoOperation(op);
                 if (pollResult.done) break;
            }

            if (pollResult.response?.generatedVideos?.[0]?.video?.uri) {
                const downloadLink = pollResult.response.generatedVideos[0].video.uri;
                const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
                if (!response.ok) throw new Error("Failed to fetch video content.");
                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);
                
                const finalScenes = [...scenesRef.current];
                finalScenes[index].videoStatus = 'done';
                finalScenes[index].videoUrl = blobUrl;
                updateScenesAndHistory(finalScenes);
                addImagesToGallery([blobUrl]);
            } else {
                 throw new Error("Video generation completed but no URI returned.");
            }

        } catch (err) {
            const errorScenes = [...scenesRef.current];
            errorScenes[index].videoStatus = 'error';
            errorScenes[index].videoError = err instanceof Error ? err.message : "Unknown error";
            setScenes(errorScenes);
        }
    };

    const handleRefDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDraggingRef(true); };
    const handleRefDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDraggingRef(false); };
    const handleRefDrop = (e: React.DragEvent) => { 
        e.preventDefault(); e.stopPropagation(); setIsDraggingRef(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
             const file = e.dataTransfer.files[0];
             if (file.type.startsWith('image/')) {
                 const reader = new FileReader();
                 reader.onloadend = () => {
                     if (typeof reader.result === 'string' && referenceImages.length < 4) {
                         setReferenceImages(prev => [...prev, reader.result as string]);
                     }
                 };
                 reader.readAsDataURL(file);
             }
        }
    };

    // --- Regeneration Handlers ---
    const handleRegenerateScenePrompt = async (index: number, frameType: 'start' | 'end', modificationPrompt: string) => {
        const scene = scenes[index];
        const originalDesc = frameType === 'start' ? scene.startFrame.description : scene.endFrame.description;
        
        try {
            const newDesc = await refineSceneDescription(originalDesc, modificationPrompt, storyboardLanguage);
            handleEditSceneDescription(index, frameType, newDesc);
            toast.success("Prompt đã được cập nhật!");
        } catch (e) {
            toast.error("Lỗi khi tạo lại prompt.");
        }
    };

    const handleRegenerateAnimation = async (index: number, modificationPrompt: string) => {
        const scene = scenes[index];
        try {
            const newAnim = await refineSceneTransition(scene.animationDescription, modificationPrompt, storyboardLanguage);
            const newScenes = [...scenes];
            newScenes[index].animationDescription = newAnim;
            updateScenesAndHistory(newScenes);
            toast.success("Mô tả chuyển động đã được cập nhật!");
        } catch (e) {
             toast.error("Lỗi khi tạo lại mô tả chuyển động.");
        }
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            try {
                const text = await file.text();
                const data = JSON.parse(text) as any;
                if (data.scenes && Array.isArray(data.scenes)) {
                    // Basic validation
                    setScenes(data.scenes);
                    setHistory([data.scenes]);
                    setHistoryIndex(0);
                    
                    if (data.scriptSummary) setScriptSummary(data.scriptSummary);
                    if (data.activeInput) setActiveInput(data.activeInput);
                    if (data.idea) setIdea(data.idea);
                    // ... restore other fields if needed
                    
                    toast.success(t('storyboarding_import_success'));
                } else {
                    throw new Error("Invalid format");
                }
            } catch (err) {
                toast.error(t('storyboarding_import_error'));
            }
        }
    };

    const handleExport = () => {
        const exportData = {
            activeInput,
            idea,
            scriptText,
            // Skip large audio data for export if possible, or include if needed
            referenceImages,
            scriptSummary,
            scenes,
            style,
            numberOfScenes,
            aspectRatio,
            notes,
            storyboardLanguage,
            scriptType,
            keepClothing,
            keepBackground
        };
        downloadJson(exportData, `storyboard-${Date.now()}.json`);
    };

    // Render logic
    const hasScenes = scenes.length > 0;
    const lightboxImages = useMemo(() => {
        const imgs: string[] = [];
        scenes.forEach(s => {
            if (s.startFrame.imageUrl) imgs.push(s.startFrame.imageUrl);
            if (s.endFrame.imageUrl) imgs.push(s.endFrame.imageUrl);
            if (s.videoUrl) imgs.push(s.videoUrl);
        });
        return imgs;
    }, [scenes]);

    return ReactDOM.createPortal(
        <>
            <motion.div className="modal-overlay z-[60]" aria-modal="true" role="dialog" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onHide}>
                <motion.div className="modal-content !max-w-[95vw] !w-[95vw] !h-[95vh] flex flex-row !p-0 relative" onClick={(e) => e.stopPropagation()} initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }}>
                    
                    {/* Left Sidebar: Inputs & Summary */}
                    <div className="w-1/3 min-w-[350px] max-w-md flex flex-col bg-neutral-900/50 border-r border-white/10 p-4 overflow-hidden">
                        <div className="flex justify-between items-center mb-4 flex-shrink-0">
                            <h3 className="base-font font-bold text-2xl text-yellow-400">{t('extraTools_storyboarding')}</h3>
                            <button onClick={onHide} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                                <CloseIcon className="h-6 w-6" />
                            </button>
                        </div>
                        
                        <div className="flex-grow overflow-y-auto space-y-6 pr-2">
                            {/* Input Section */}
                            <div className="space-y-4">
                                <h4 className="font-bold text-lg text-white border-b border-white/10 pb-2">{t('storyboarding_idea_title')}</h4>
                                <p className="text-sm text-neutral-400">{t('storyboarding_idea_subtitle')}</p>
                                <StoryboardingInput
                                    activeInput={activeInput}
                                    setActiveInput={setActiveInput}
                                    idea={idea}
                                    setIdea={setIdea}
                                    scriptText={scriptText}
                                    setScriptText={setScriptText}
                                    audioFile={audioFile}
                                    audioInputRef={audioInputRef}
                                    textInputRef={textInputRef}
                                    handleFileSelect={handleFileSelect}
                                    referenceImages={referenceImages}
                                    isDraggingRef={isDraggingRef}
                                    handleRefDragOver={handleRefDragOver}
                                    handleRefDragLeave={handleRefDragLeave}
                                    handleRefDrop={handleRefDrop}
                                    setReferenceImages={setReferenceImages}
                                    setIsGalleryPickerOpen={setIsGalleryPickerOpen}
                                    style={style}
                                    setStyle={setStyle}
                                    styleOptions={styleOptions}
                                    aspectRatio={aspectRatio}
                                    setAspectRatio={setAspectRatio}
                                    aspectRatioOptions={aspectRatioOptions}
                                    notes={notes}
                                    setNotes={setNotes}
                                    numberOfScenes={numberOfScenes}
                                    setNumberOfScenes={setNumberOfScenes}
                                    storyboardLanguage={storyboardLanguage}
                                    setStoryboardLanguage={setStoryboardLanguage}
                                    scriptType={scriptType}
                                    setScriptType={setScriptType}
                                    keepClothing={keepClothing}
                                    setKeepClothing={setKeepClothing}
                                    keepBackground={keepBackground}
                                    setKeepBackground={setKeepBackground}
                                />
                                {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
                                <button
                                    onClick={handleGenerateScript}
                                    className="w-full btn btn-primary flex items-center justify-center gap-2 mt-2"
                                    disabled={isLoading}
                                >
                                    {isLoading ? (
                                        <>
                                            <LoadingSpinnerIcon className="h-5 w-5 animate-spin" />
                                            <span>{loadingMessage}</span>
                                        </>
                                    ) : (
                                        t('storyboarding_idea_submit')
                                    )}
                                </button>
                            </div>

                            {/* Summary Section */}
                            {scriptSummary && (
                                <div className="space-y-4 pt-4 border-t border-white/10">
                                    <h4 className="font-bold text-lg text-white border-b border-white/10 pb-2">Tóm tắt Kịch bản</h4>
                                    <StoryboardingSummary
                                        scriptSummary={scriptSummary}
                                        onSummaryChange={(field, value) => setScriptSummary(prev => prev ? { ...prev, [field]: value } : null)}
                                    />
                                    <button 
                                        onClick={handleGenerateScript} 
                                        className="w-full btn btn-secondary text-sm"
                                        disabled={isLoading}
                                    >
                                        {t('storyboarding_regenerateScript')}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Main Content: Scenes */}
                    <div className="flex-1 flex flex-col bg-neutral-800/20 overflow-hidden relative">
                        {/* Toolbar */}
                        <div className="h-14 flex items-center justify-between px-4 border-b border-white/10 bg-neutral-900/80 backdrop-blur-md z-10 flex-shrink-0">
                            <div className="flex items-center gap-2">
                                <button onClick={handleUndo} disabled={!canUndo} className="p-2 rounded hover:bg-neutral-700 disabled:opacity-30 transition-colors" title="Undo">
                                    <UndoIcon className="h-5 w-5" />
                                </button>
                                <button onClick={handleRedo} disabled={!canRedo} className="p-2 rounded hover:bg-neutral-700 disabled:opacity-30 transition-colors" title="Redo">
                                    <RedoIcon className="h-5 w-5" />
                                </button>
                                <div className="h-6 w-px bg-white/10 mx-2" />
                                <button onClick={handleNew} className="btn btn-secondary btn-sm">{t('storyboarding_new')}</button>
                                <button onClick={() => importInputRef.current?.click()} className="btn btn-secondary btn-sm">{t('storyboarding_import')}</button>
                                <input type="file" ref={importInputRef} className="hidden" accept=".json" onChange={handleImport} />
                                <button onClick={handleExport} className="btn btn-secondary btn-sm" disabled={!hasScenes}>{t('storyboarding_export')}</button>
                            </div>
                        </div>

                        {/* Scenes Grid */}
                        <div className="flex-grow overflow-y-auto p-4" 
                             onDragOver={(e) => {e.preventDefault(); e.stopPropagation(); setIsDraggingOver(true);}} 
                             onDragLeave={(e) => {e.preventDefault(); e.stopPropagation(); setIsDraggingOver(false);}} 
                             onDrop={(e) => {e.preventDefault(); e.stopPropagation(); setIsDraggingOver(false); handleImport(e as any);}}
                        >
                            {hasScenes ? (
                                <StoryboardingScenes
                                    scenes={scenes}
                                    referenceImages={referenceImages}
                                    onGenerateImage={handleGenerateImage}
                                    onGenerateVideo={handleGenerateVideo}
                                    onEditSceneDescription={handleEditSceneDescription}
                                    onEditSceneAnimation={handleEditSceneAnimation}
                                    onImageSourceChange={handleImageSourceChange}
                                    onSelectCustomImage={handleSelectCustomImage}
                                    onUploadCustomImage={handleUploadCustomImage}
                                    onClearImage={handleClearImage}
                                    onImageFile={handleImageFile}
                                    onEditImage={handleEditImage}
                                    onPreviewImage={handlePreviewImage}
                                    onDownloadImage={handleDownloadImage}
                                    onAddScene={handleAddScene}
                                    onDeleteScene={handleDeleteScene}
                                    onMoveScene={handleMoveScene}
                                    onGenerateVideoPrompt={handleGenerateVideoPrompt}
                                    onEditSceneVideoPrompt={handleEditSceneVideoPrompt}
                                    onRegenerateScenePrompt={handleRegenerateScenePrompt}
                                    onRegenerateAnimation={handleRegenerateAnimation}
                                    aspectRatio={aspectRatio}
                                />
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-neutral-500">
                                    <p className="text-xl mb-4">{t('storyboarding_scenes_placeholder')}</p>
                                    <p className="text-sm">{t('storyboarding_dropPrompt')}</p>
                                </div>
                            )}
                            <AnimatePresence>
                                {isDraggingOver && (
                                    <motion.div
                                        className="absolute inset-0 z-50 bg-black/70 border-4 border-dashed border-yellow-400 rounded-lg flex flex-col items-center justify-center pointer-events-none m-4"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                    >
                                        <CloudUploadIcon className="h-16 w-16 text-yellow-400 mb-4" strokeWidth={1} />
                                        <p className="text-2xl font-bold text-yellow-400">{t('storyboarding_dropPrompt')}</p>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    <input type="file" ref={customImageUploadRef} className="hidden" accept="image/*" onChange={handleCustomImageFile} />
                </motion.div>
            </motion.div>
            <GalleryPicker
                isOpen={isGalleryPickerOpen}
                onClose={() => setIsGalleryPickerOpen(false)}
                onSelect={handleGallerySelect}
                images={imageGallery}
            />
            <Lightbox
                images={lightboxImages}
                selectedIndex={lightboxIndex}
                onClose={closeLightbox}
                onNavigate={navigateLightbox}
            />
        </>
    , document.body);
};
