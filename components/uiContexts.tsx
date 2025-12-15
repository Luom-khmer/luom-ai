/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect, useCallback, useContext, createContext } from 'react';
import toast from 'react-hot-toast';
import {
    type ImageToEdit, type ViewState, type AnyAppState, type Theme,
    type AppConfig, THEMES, getInitialStateForApp, type Settings,
    type GenerationHistoryEntry, type ModelVersion, type ImageResolution,
    type AppControlContextType
} from './uiTypes';
import * as db from '../lib/db';

// --- Default Settings Fallback ---
// Used if setting.json fails to load
const DEFAULT_SETTINGS: Settings = {
  "enableWebcam": false,
  "enableImageMetadata": false,
  "home": {
    "mainTitleKey": "home_mainTitle",
    "subtitleKey": "home_subtitle",
    "useSmartTitleWrapping": false,
    "smartTitleWrapWords": 2
  },
  "apps": [
    {
      "id": "free-generation",
      "titleKey": "app_free-generation_title",
      "descriptionKey": "app_free-generation_description",
      "icon": "🚀",
      "supportsCanvasPreset": true,
      "previewImageUrl": "https://trainlora.vn/wp-content/uploads/2025/10/free-gen-1.jpg"
    },
    {
      "id": "image-interpolation",
      "titleKey": "app_image-interpolation_title",
      "descriptionKey": "app_image-interpolation_description",
      "icon": "⚗️",
      "supportsCanvasPreset": true,
      "previewImageUrl": "https://trainlora.vn/wp-content/uploads/2025/10/noi-suy.jpg"
    },
    {
      "id": "architecture-ideator",
      "titleKey": "app_architecture-ideator_title",
      "descriptionKey": "app_architecture-ideator_description",
      "icon": "🏛️",
      "supportsCanvasPreset": true,
      "previewImageUrl": "https://trainlora.vn/wp-content/uploads/2025/10/kientruc-2.jpeg"
    },
    {
      "id": "dress-the-model",
      "titleKey": "app_dress-the-model_title",
      "descriptionKey": "app_dress-the-model_description",
      "icon": "👗",
      "supportsCanvasPreset": true,
      "previewImageUrl": "https://trainlora.vn/wp-content/uploads/2025/10/thoitrang.jpg"
    },
    {
      "id": "photo-restoration",
      "titleKey": "app_photo-restoration_title",
      "descriptionKey": "app_photo-restoration_description",
      "icon": "🖼️",
      "supportsCanvasPreset": true,
      "previewImageUrl": "https://trainlora.vn/wp-content/uploads/2025/10/phuc-che.jpg"
    },
    {
      "id": "swap-style",
      "titleKey": "app_swap-style_title",
      "descriptionKey": "app_swap-style_description",
      "icon": "🎨",
      "supportsCanvasPreset": true,
      "previewImageUrl": "https://trainlora.vn/wp-content/uploads/2025/10/swap-style-1.jpg"
    },
    {
      "id": "baby-photo-creator",
      "titleKey": "app_baby-photo-creator_title",
      "descriptionKey": "app_baby-photo-creator_description",
      "icon": "👶",
      "supportsCanvasPreset": true,
      "previewImageUrl": "https://trainlora.vn/wp-content/uploads/2025/10/baby.jpeg"
    },
    {
      "id": "avatar-creator",
      "titleKey": "app_avatar-creator_title",
      "descriptionKey": "app_avatar-creator_description",
      "icon": "🇻🇳",
      "supportsCanvasPreset": true,
      "previewImageUrl": "https://trainlora.vn/wp-content/uploads/2025/10/yeu-nuoc.jpeg"
    },
    {
      "id": "beauty-creator",
      "titleKey": "app_beauty-creator_title",
      "descriptionKey": "app_beauty-creator_description",
      "icon": "💄",
      "supportsCanvasPreset": true,
      "previewImageUrl": "https://trainlora.vn/wp-content/uploads/2025/10/beauty.jpeg"
    },
    {
      "id": "entrepreneur-creator",
      "titleKey": "app_entrepreneur-creator_title",
      "descriptionKey": "app_entrepreneur-creator_description",
      "icon": "💼",
      "supportsCanvasPreset": true,
      "previewImageUrl": "https://trainlora.vn/wp-content/uploads/2025/10/doanhnhan.jpeg"
    },
    {
      "id": "toy-model-creator",
      "titleKey": "app_toy-model-creator_title",
      "descriptionKey": "app_toy-model-creator_description",
      "icon": "🤖",
      "supportsCanvasPreset": true,
      "previewImageUrl": "https://trainlora.vn/wp-content/uploads/2025/10/figure.jpeg"
    },
    {
      "id": "mid-autumn-creator",
      "titleKey": "app_mid-autumn-creator_title",
      "descriptionKey": "app_mid-autumn-creator_description",
      "icon": "🌕",
      "supportsCanvasPreset": true,
      "previewImageUrl": "https://trainlora.vn/wp-content/uploads/2025/10/trungthu.jpeg"
    }
  ],
  "avatarCreator": {
    "mainTitleKey": "avatarCreator_mainTitle",
    "subtitleKey": "avatarCreator_subtitle",
    "minIdeas": 1,
    "maxIdeas": 6,
    "useSmartTitleWrapping": true,
    "smartTitleWrapWords": 2,
    "uploaderCaptionKey": "avatarCreator_uploaderCaption",
    "uploaderDescriptionKey": "avatarCreator_uploaderDescription",
    "uploaderCaptionStyleKey": "common_uploaderCaptionStyle",
    "uploaderDescriptionStyleKey": "common_uploaderDescriptionStyle"
  },
  "babyPhotoCreator": {
    "mainTitleKey": "babyPhotoCreator_mainTitle",
    "subtitleKey": "babyPhotoCreator_subtitle",
    "minIdeas": 1,
    "maxIdeas": 6,
    "useSmartTitleWrapping": true,
    "smartTitleWrapWords": 2,
    "uploaderCaptionKey": "babyPhotoCreator_uploaderCaption",
    "uploaderDescriptionKey": "babyPhotoCreator_uploaderDescription",
    "uploaderCaptionStyleKey": "common_uploaderCaptionStyle",
    "uploaderDescriptionStyleKey": "common_uploaderDescriptionStyle"
  },
  "beautyCreator": {
    "mainTitleKey": "beautyCreator_mainTitle",
    "subtitleKey": "beautyCreator_subtitle",
    "useSmartTitleWrapping": true,
    "smartTitleWrapWords": 2,
    "minIdeas": 1,
    "maxIdeas": 6,
    "uploaderCaptionKey": "beautyCreator_uploaderCaption",
    "uploaderDescriptionKey": "beautyCreator_uploaderDescription",
    "uploaderCaptionStyleKey": "beautyCreator_uploaderCaptionStyle",
    "uploaderDescriptionStyleKey": "beautyCreator_uploaderDescriptionStyle"
  },
  "midAutumnCreator": {
    "mainTitleKey": "midAutumnCreator_mainTitle",
    "subtitleKey": "midAutumnCreator_subtitle",
    "minIdeas": 1,
    "maxIdeas": 6,
    "useSmartTitleWrapping": true,
    "smartTitleWrapWords": 2,
    "uploaderCaptionKey": "midAutumnCreator_uploaderCaption",
    "uploaderDescriptionKey": "midAutumnCreator_uploaderDescription",
    "uploaderCaptionStyleKey": "common_uploaderCaptionStyle",
    "uploaderDescriptionStyleKey": "common_uploaderDescriptionStyle"
  },
  "entrepreneurCreator": {
    "mainTitleKey": "entrepreneurCreator_mainTitle",
    "subtitleKey": "entrepreneurCreator_subtitle",
    "minIdeas": 1,
    "maxIdeas": 6,
    "useSmartTitleWrapping": true,
    "smartTitleWrapWords": 2,
    "uploaderCaptionKey": "entrepreneurCreator_uploaderCaption",
    "uploaderDescriptionKey": "entrepreneurCreator_uploaderDescription",
    "uploaderCaptionStyleKey": "common_uploaderCaptionStyle",
    "uploaderDescriptionStyleKey": "common_uploaderDescriptionStyle"
  },
  "architectureIdeator": {
    "mainTitleKey": "architectureIdeator_mainTitle",
    "subtitleKey": "architectureIdeator_subtitle",
    "useSmartTitleWrapping": true,
    "smartTitleWrapWords": 2,
    "uploaderCaptionKey": "architectureIdeator_uploaderCaption",
    "uploaderDescriptionKey": "architectureIdeator_uploaderDescription"
  },
  "dressTheModel": {
    "mainTitleKey": "dressTheModel_mainTitle",
    "subtitleKey": "dressTheModel_subtitle",
    "useSmartTitleWrapping": true,
    "smartTitleWrapWords": 2,
    "uploaderCaptionModelKey": "dressTheModel_uploaderCaptionModel",
    "uploaderDescriptionModelKey": "dressTheModel_uploaderDescriptionModel",
    "uploaderCaptionClothingKey": "dressTheModel_uploaderCaptionClothing",
    "uploaderDescriptionClothingKey": "dressTheModel_uploaderDescriptionClothing"
  },
  "photoRestoration": {
    "mainTitleKey": "photoRestoration_mainTitle",
    "subtitleKey": "photoRestoration_subtitle",
    "useSmartTitleWrapping": true,
    "smartTitleWrapWords": 2,
    "uploaderCaptionKey": "photoRestoration_uploaderCaption",
    "uploaderDescriptionKey": "photoRestoration_uploaderDescription"
  },
  "swapStyle": {
    "mainTitleKey": "swapStyle_mainTitle",
    "subtitleKey": "swapStyle_subtitle",
    "useSmartTitleWrapping": true,
    "smartTitleWrapWords": 3,
    "uploaderCaptionContentKey": "swapStyle_uploaderCaptionContent",
    "uploaderDescriptionContentKey": "swapStyle_uploaderDescriptionContent",
    "uploaderCaptionStyleKey": "swapStyle_uploaderCaptionStyle",
    "uploaderDescriptionStyleKey": "swapStyle_uploaderDescriptionStyle"
  },
  "freeGeneration": {
    "mainTitleKey": "freeGeneration_mainTitle",
    "subtitleKey": "freeGeneration_subtitle",
    "useSmartTitleWrapping": true,
    "smartTitleWrapWords": 2,
    "uploaderCaption1Key": "freeGeneration_uploaderCaption1",
    "uploaderDescription1Key": "freeGeneration_uploaderDescription1",
    "uploaderCaption2Key": "freeGeneration_uploaderCaption2",
    "uploaderDescription2Key": "freeGeneration_uploaderDescription2",
    "uploaderCaption3Key": "freeGeneration_uploaderCaption3",
    "uploaderDescription3Key": "freeGeneration_uploaderDescription3",
    "uploaderCaption4Key": "freeGeneration_uploaderCaption4",
    "uploaderDescription4Key": "freeGeneration_uploaderDescription4"
  },
  "toyModelCreator": {
    "mainTitleKey": "toyModelCreator_mainTitle",
    "subtitleKey": "toyModelCreator_subtitle",
    "useSmartTitleWrapping": true,
    "smartTitleWrapWords": 1,
    "uploaderCaptionKey": "toyModelCreator_uploaderCaption",
    "uploaderDescriptionKey": "toyModelCreator_uploaderDescription"
  },
  "imageInterpolation": {
    "mainTitleKey": "imageInterpolation_mainTitle",
    "subtitleKey": "imageInterpolation_subtitle",
    "useSmartTitleWrapping": true,
    "smartTitleWrapWords": 2,
    "uploaderCaptionInputKey": "imageInterpolation_uploaderCaptionInput",
    "uploaderDescriptionInputKey": "imageInterpolation_uploaderDescriptionInput",
    "uploaderCaptionOutputKey": "imageInterpolation_uploaderCaptionOutput",
    "uploaderDescriptionOutputKey": "imageInterpolation_uploaderDescriptionOutput",
    "uploaderCaptionReferenceKey": "imageInterpolation_uploaderCaptionReference",
    "uploaderDescriptionReferenceKey": "imageInterpolation_uploaderDescriptionReference"
  }
} as any; // Cast to any to avoid strict type checks for missing keys like mixStyle/imageToReal if not used

// --- Auth Context ---

interface LoginSettings {
    enabled: boolean;
}

interface AuthContextType {
    loginSettings: LoginSettings | null;
    isLoggedIn: boolean;
    currentUser: string | null;
    isLoading: boolean;
    login: (apiKey: string) => Promise<boolean>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [loginSettings] = useState<LoginSettings>({ enabled: true }); 
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [currentUser, setCurrentUser] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const initializeAuth = async () => {
            try {
                const storedKey = localStorage.getItem('GEMINI_API_KEY');
                const storedUser = sessionStorage.getItem('currentUser');

                if (storedKey && storedKey.trim().length > 0) {
                    setIsLoggedIn(true);
                    setCurrentUser(storedUser || 'User'); 
                } else {
                    setIsLoggedIn(false);
                }
            } catch (error) {
                console.error("Error initializing auth:", error);
                setIsLoggedIn(false);
            } finally {
                setIsLoading(false);
            }
        };

        initializeAuth();
    }, []);

    const login = useCallback(async (apiKey: string): Promise<boolean> => {
        if (!apiKey || apiKey.trim().length === 0) return false;

        if (!apiKey.startsWith('AIza')) {
            toast.error("API Key có vẻ không hợp lệ (thường bắt đầu bằng AIza...)");
        }

        localStorage.setItem('GEMINI_API_KEY', apiKey.trim());
        sessionStorage.setItem('currentUser', 'User');
        setCurrentUser('User');
        setIsLoggedIn(true);
        
        setTimeout(() => {
            window.location.reload();
        }, 500);
        
        return true;
    }, []);

    const logout = useCallback(() => {
        setCurrentUser(null);
        setIsLoggedIn(false);
        localStorage.removeItem('GEMINI_API_KEY');
        sessionStorage.removeItem('currentUser');
        window.location.reload();
    }, []);

    const value = { loginSettings, isLoggedIn, currentUser, isLoading, login, logout };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

// --- Image Editor Hook & Context ---
interface ImageEditorContextType {
    imageToEdit: ImageToEdit | null;
    openImageEditor: (url: string, onSave: (newUrl: string) => void) => void;
    openEmptyImageEditor: (onSave: (newUrl: string) => void) => void;
    closeImageEditor: () => void;
}

const ImageEditorContext = createContext<ImageEditorContextType | undefined>(undefined);

export const ImageEditorProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
    const [imageToEdit, setImageToEdit] = useState<ImageToEdit | null>(null);

    const openImageEditor = useCallback((url: string, onSave: (newUrl: string) => void) => {
        if (window.innerWidth < 768) {
            alert("Chức năng chỉnh sửa ảnh không khả dụng trên thiết bị di động.");
            return;
        }
        if (!url) {
            console.error("openImageEditor called with no URL.");
            return;
        }
        setImageToEdit({ url, onSave });
    }, []);

    const openEmptyImageEditor = useCallback((onSave: (newUrl: string) => void) => {
        if (window.innerWidth < 768) {
            alert("Chức năng chỉnh sửa ảnh không khả dụng trên thiết bị di động.");
            return;
        }
        setImageToEdit({ url: null, onSave });
    }, []);

    const closeImageEditor = useCallback(() => {
        setImageToEdit(null);
    }, []);

    const value = { imageToEdit, openImageEditor, openEmptyImageEditor, closeImageEditor };

    return (
        <ImageEditorContext.Provider value={value}>
            {children}
        </ImageEditorContext.Provider>
    );
};

export const useImageEditor = (): ImageEditorContextType => {
    const context = useContext(ImageEditorContext);
    if (context === undefined) {
        throw new Error('useImageEditor must be used within an ImageEditorProvider');
    }
    return context;
};

// --- App Control Context ---

const AppControlContext = createContext<AppControlContextType | undefined>(undefined);

export const AppControlProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [viewHistory, setViewHistory] = useState<ViewState[]>([{ viewId: 'home', state: { stage: 'home' } }]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const [theme, setTheme] = useState<Theme>(() => {
        const savedTheme = localStorage.getItem('app-theme') as Theme;
        if (savedTheme && THEMES.includes(savedTheme)) {
            return savedTheme;
        }
        return THEMES[Math.floor(Math.random() * THEMES.length)];
    });
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isGalleryOpen, setIsGalleryOpen] = useState(false);
    const [isInfoOpen, setIsInfoOpen] = useState(false);
    const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(false);
    const [isExtraToolsOpen, setIsExtraToolsOpen] = useState(false);
    const [isImageLayoutModalOpen, setIsImageLayoutModalOpen] = useState(false);
    const [isBeforeAfterModalOpen, setIsBeforeAfterModalOpen] = useState(false);
    const [isAppCoverCreatorModalOpen, setIsAppCoverCreatorModalOpen] = useState(false);
    const [isStoryboardingModalMounted, setIsStoryboardingModalMounted] = useState(false);
    const [isStoryboardingModalVisible, setIsStoryboardingModalVisible] = useState(false);
    const [isLayerComposerMounted, setIsLayerComposerMounted] = useState(false);
    const [isLayerComposerVisible, setIsLayerComposerVisible] = useState(false);
    const [imageGallery, setImageGallery] = useState<string[]>([]);
    const [generationHistory, setGenerationHistory] = useState<GenerationHistoryEntry[]>([]);
    const [isDbLoaded, setIsDbLoaded] = useState(false);

    const [language, setLanguage] = useState<'vi' | 'en'>(() => (localStorage.getItem('app-language') as 'vi' | 'en') || 'vi');
    const [translations, setTranslations] = useState<Record<string, any>>({});
    const [settings, setSettings] = useState<Settings | null>(null);
    
    const [modelVersion, setModelVersion] = useState<ModelVersion>('v2');
    const [imageResolution, setImageResolution] = useState<ImageResolution>('1K');

    const currentView = viewHistory[historyIndex];

    useEffect(() => {
        const fetchTranslations = async () => {
             const modules = [
                'common', 
                'data',
                'home', 
                'architectureIdeator',
                'avatarCreator',
                'babyPhotoCreator',
                'beautyCreator',
                'midAutumnCreator',
                'dressTheModel',
                'entrepreneurCreator',
                'freeGeneration',
                'imageInterpolation',
                'imageToReal',
                'mixStyle',
                'photoRestoration',
                'swapStyle',
                'toyModelCreator'
            ];
            try {
                const fetchPromises = modules.map(module =>
                    fetch(`/locales/${language}/${module}.json`)
                        .then(res => {
                            if (!res.ok) {
                                console.warn(`Could not fetch ${module}.json for ${language}`);
                                return {}; 
                            }
                            return res.json();
                        })
                );

                const loadedTranslations = await Promise.all(fetchPromises);
                
                const mergedTranslations = loadedTranslations.reduce(
                    (acc, current) => ({ ...acc, ...current }),
                    {}
                );
                setTranslations(mergedTranslations);
            } catch (error) {
                console.error(`Could not load translations for ${language}`, error);
            }
        };
        fetchTranslations();
    }, [language]);
    
    useEffect(() => {
        async function loadData() {
            await db.migrateFromLocalStorageToIdb();
            const [gallery, history] = await Promise.all([
                db.getAllGalleryImages(),
                db.getAllHistoryEntries()
            ]);
            setImageGallery(gallery);
            setGenerationHistory(history);
            setIsDbLoaded(true);
        }
        loadData();
    }, []);

    const t = useCallback((key: string, ...args: any[]) => {
        const keys = key.split('.');
        let translation = keys.reduce((obj, keyPart) => {
            if (obj && typeof obj === 'object' && keyPart in obj) {
                return (obj as Record<string, any>)[keyPart];
            }
            return undefined;
        }, translations as any);

        if (translation === undefined) {
            // console.warn(`Translation key not found: ${key}`);
            return key;
        }

        if (typeof translation === 'string' && args.length > 0) {
            let result = translation;
            args.forEach((arg, index) => {
                result = result.replace(`{${index}}`, String(arg));
            });
            return result;
        }

        return translation;
    }, [translations]);
    
    const addGenerationToHistory = useCallback(async (entryData: Omit<GenerationHistoryEntry, 'id' | 'timestamp'>) => {
        const newEntry: GenerationHistoryEntry = {
            ...entryData,
            id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            timestamp: Date.now(),
        };
        await db.addHistoryEntry(newEntry);
        setGenerationHistory(prev => {
            const updatedHistory = [newEntry, ...prev];
            return updatedHistory;
        });
    }, []);


    const handleLanguageChange = useCallback((lang: 'vi' | 'en') => {
        setLanguage(lang);
        localStorage.setItem('app-language', lang);
    }, []);
    
    const handleModelVersionChange = useCallback((version: ModelVersion) => {
        setModelVersion(version);
    }, []);

    const handleResolutionChange = useCallback((resolution: ImageResolution) => {
        setImageResolution(resolution);
    }, []);
    
    const addImagesToGallery = useCallback(async (newImages: string[]) => {
        const uniqueNewImages = newImages.filter(img => img && !imageGallery.includes(img));
        if (uniqueNewImages.length === 0) {
            return;
        }
        await db.addMultipleGalleryImages(uniqueNewImages);
        setImageGallery(prev => [...uniqueNewImages, ...prev]);
    }, [imageGallery]);

    const removeImageFromGallery = useCallback(async (indexToRemove: number) => {
        const urlToDelete = imageGallery[indexToRemove];
        if (urlToDelete) {
            await db.deleteGalleryImage(urlToDelete);
            setImageGallery(prev => prev.filter((_, index) => index !== indexToRemove));
        }
    }, [imageGallery]);

    const replaceImageInGallery = useCallback(async (indexToReplace: number, newImageUrl: string) => {
        const oldUrl = imageGallery[indexToReplace];
        if (oldUrl) {
            await db.replaceGalleryImage(oldUrl, newImageUrl);
            setImageGallery(prev => {
                const newImages = [...prev];
                newImages[indexToReplace] = newImageUrl;
                return newImages;
            });
        }
    }, [imageGallery]);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const response = await fetch('/setting.json');
                 if (!response.ok) {
                    throw new Error("Network response was not ok");
                }
                const data = await response.json();
                setSettings(data);
            } catch (error) {
                console.warn("Failed to fetch or parse setting.json, using default settings.", error);
                setSettings(DEFAULT_SETTINGS);
            }
        };
        fetchSettings();
    }, []);

    useEffect(() => {
        THEMES.forEach(t => document.body.classList.remove(`theme-${t}`));
        document.body.classList.add(`theme-${theme}`);
        localStorage.setItem('app-theme', theme);
    }, [theme]);

    const handleThemeChange = (newTheme: Theme) => {
        setTheme(newTheme);
    };

    const restoreStateFromGallery = useCallback((stateToRestore: any, gallery: string[]): AnyAppState => {
        const restoredState = JSON.parse(JSON.stringify(stateToRestore));
    
        const restoreRefs = (obj: any) => {
            if (typeof obj !== 'object' || obj === null) return;
            
            for (const key in obj) {
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    if (obj[key].type === 'galleryRef' && typeof obj[key].index === 'number') {
                        const galleryIndex = obj[key].index;
                        if (gallery[galleryIndex]) {
                            obj[key] = gallery[galleryIndex];
                        } else {
                            console.warn(`Gallery reference with index ${galleryIndex} not found.`);
                            obj[key] = null;
                        }
                    } else {
                        restoreRefs(obj[key]);
                    }
                }
            }
        };
    
        restoreRefs(restoredState);
        return restoredState;
    }, []);

    const navigateTo = useCallback((viewId: string) => {
        const current = viewHistory[historyIndex];
        const initialState = getInitialStateForApp(viewId);
    
        if (current.viewId === viewId && JSON.stringify(current.state) === JSON.stringify(initialState)) {
            return;
        }
    
        const newHistory = viewHistory.slice(0, historyIndex + 1);
        newHistory.push({ viewId, state: initialState } as ViewState);
        
        setViewHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
    }, [viewHistory, historyIndex]);
    
    const handleStateChange = useCallback((newAppState: AnyAppState) => {
        const current = viewHistory[historyIndex];
        if (JSON.stringify(current.state) === JSON.stringify(newAppState)) {
            return; 
        }
    
        const newHistory = viewHistory.slice(0, historyIndex + 1);
        newHistory.push({ viewId: current.viewId, state: newAppState } as ViewState);
    
        setViewHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
    }, [viewHistory, historyIndex]);

    const importSettingsAndNavigate = useCallback((settings: any) => {
        if (!settings || typeof settings.viewId !== 'string' || typeof settings.state !== 'object') {
            alert('Invalid settings file.');
            return;
        }
    
        const { viewId, state: importedState } = settings;
        
        const initialState = getInitialStateForApp(viewId);
        if (initialState.stage === 'home') {
            alert(`Unknown app in settings file: ${viewId}`);
            return;
        }
    
        const restoredState = restoreStateFromGallery(importedState, imageGallery);
        const mergedState = { ...initialState, ...restoredState };
    
        const newHistory = viewHistory.slice(0, historyIndex + 1);
        newHistory.push({ viewId, state: mergedState } as ViewState);
        
        setViewHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
    
    }, [viewHistory, historyIndex, imageGallery, restoreStateFromGallery]);

    const handleSelectApp = useCallback((appId: string) => {
        if (settings) {
            const validAppIds = settings.apps.map((app: AppConfig) => app.id);
            if (validAppIds.includes(appId)) {
                navigateTo(appId);
            } else {
                navigateTo('home');
            }
        }
    }, [settings, navigateTo]);

    const handleGoHome = useCallback(() => {
        navigateTo('home');
    }, [navigateTo]);

    const handleGoBack = useCallback(() => {
        if (historyIndex > 0) {
            setHistoryIndex(prev => prev - 1);
        }
    }, [historyIndex]);
    
    const handleGoForward = useCallback(() => {
        if (historyIndex < viewHistory.length - 1) {
            setHistoryIndex(prev => prev + 1);
        }
    }, [historyIndex, viewHistory.length]);

    const handleResetApp = useCallback(() => {
        const currentViewId = viewHistory[historyIndex].viewId;
        if (currentViewId !== 'home') {
            navigateTo(currentViewId);
        }
    }, [viewHistory, historyIndex, navigateTo]);
    
    const handleOpenSearch = useCallback(() => setIsSearchOpen(true), []);
    const handleCloseSearch = useCallback(() => setIsSearchOpen(false), []);
    const handleOpenGallery = useCallback(() => setIsGalleryOpen(true), []);
    const handleCloseGallery = useCallback(() => setIsGalleryOpen(false), []);
    const handleOpenInfo = useCallback(() => setIsInfoOpen(true), []);
    const handleCloseInfo = useCallback(() => setIsInfoOpen(false), []);
    const handleOpenHistoryPanel = useCallback(() => setIsHistoryPanelOpen(true), []);
    const handleCloseHistoryPanel = useCallback(() => setIsHistoryPanelOpen(false), []);
    const toggleExtraTools = useCallback(() => setIsExtraToolsOpen(prev => !prev), []);
    const openImageLayoutModal = useCallback(() => {
        setIsImageLayoutModalOpen(true);
        setIsExtraToolsOpen(false); 
    }, []);
    const closeImageLayoutModal = useCallback(() => setIsImageLayoutModalOpen(false), []);
    const openBeforeAfterModal = useCallback(() => {
        setIsBeforeAfterModalOpen(true);
        setIsExtraToolsOpen(false);
    }, []);
    const closeBeforeAfterModal = useCallback(() => setIsBeforeAfterModalOpen(false), []);
    const openAppCoverCreatorModal = useCallback(() => {
        setIsAppCoverCreatorModalOpen(true);
        setIsExtraToolsOpen(false);
    }, []);
    const closeAppCoverCreatorModal = useCallback(() => setIsAppCoverCreatorModalOpen(false), []);

    const openStoryboardingModal = useCallback(() => {
        setIsStoryboardingModalMounted(true);
        setIsStoryboardingModalVisible(true);
        setIsExtraToolsOpen(false);
    }, []);

    const hideStoryboardingModal = useCallback(() => {
        setIsStoryboardingModalVisible(false);
    }, []);
    
    const closeStoryboardingModal = useCallback(() => {
        setIsStoryboardingModalMounted(false);
        setIsStoryboardingModalVisible(false);
    }, []);

    const toggleStoryboardingModal = useCallback(() => {
        if (isStoryboardingModalVisible) {
            hideStoryboardingModal();
        } else {
            openStoryboardingModal();
        }
    }, [isStoryboardingModalVisible, hideStoryboardingModal, openStoryboardingModal]);

    const openLayerComposer = useCallback(() => {
        setIsLayerComposerMounted(true);
        setIsLayerComposerVisible(true);
        setIsExtraToolsOpen(false);
    }, []);
    const closeLayerComposer = useCallback(() => {
        setIsLayerComposerMounted(false);
        setIsLayerComposerVisible(false);
    }, []);
    const hideLayerComposer = useCallback(() => {
        setIsLayerComposerVisible(false);
    }, []);
    
    const toggleLayerComposer = useCallback(() => {
        if (isLayerComposerVisible) {
            hideLayerComposer();
        } else {
            openLayerComposer();
        }
    }, [isLayerComposerVisible, hideLayerComposer, openLayerComposer]);

    const value: AppControlContextType = {
        currentView,
        settings,
        theme,
        imageGallery,
        historyIndex,
        viewHistory,
        isSearchOpen,
        isGalleryOpen,
        isInfoOpen,
        isHistoryPanelOpen,
        isExtraToolsOpen,
        isImageLayoutModalOpen,
        isBeforeAfterModalOpen,
        isAppCoverCreatorModalOpen,
        isStoryboardingModalMounted,
        isStoryboardingModalVisible,
        isLayerComposerMounted,
        isLayerComposerVisible,
        language,
        generationHistory,
        modelVersion,
        imageResolution,
        addGenerationToHistory,
        addImagesToGallery,
        removeImageFromGallery,
        replaceImageInGallery,
        handleThemeChange,
        handleLanguageChange,
        handleModelVersionChange,
        handleResolutionChange,
        navigateTo,
        handleStateChange,
        handleSelectApp,
        handleGoHome,
        handleGoBack,
        handleGoForward,
        handleResetApp,
        handleOpenSearch,
        handleCloseSearch,
        handleOpenGallery,
        handleCloseGallery,
        handleOpenInfo,
        handleCloseInfo,
        handleOpenHistoryPanel,
        handleCloseHistoryPanel,
        toggleExtraTools,
        openImageLayoutModal,
        closeImageLayoutModal,
        openBeforeAfterModal,
        closeBeforeAfterModal,
        openAppCoverCreatorModal,
        closeAppCoverCreatorModal,
        openStoryboardingModal,
        closeStoryboardingModal,
        hideStoryboardingModal,
        toggleStoryboardingModal,
        openLayerComposer,
        closeLayerComposer,
        hideLayerComposer,
        toggleLayerComposer,
        importSettingsAndNavigate,
        t,
    };

    return (
        <AppControlContext.Provider value={value}>
            {children}
        </AppControlContext.Provider>
    );
};

export const useAppControls = (): AppControlContextType => {
    const context = useContext(AppControlContext);
    if (context === undefined) {
        throw new Error('useAppControls must be used within an AppControlProvider');
    }
    return context;
};
