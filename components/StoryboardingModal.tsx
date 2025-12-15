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
import type { SceneState } from './uiTypes';
import { CloseIcon, CloudUploadIcon, UndoIcon, RedoIcon } from './icons';
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
        scene: s.scene