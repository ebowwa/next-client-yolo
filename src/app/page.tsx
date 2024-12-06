"use client";

import React, { useRef, useEffect, useState, useMemo } from 'react';
import type { JSX } from 'react';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';
import type { DetectedObject } from '@tensorflow-models/coco-ssd';
import cocoClasses from '../utils/cocoClasses.json';
import { EntityTracker } from '../utils/entityTracker';
import { ClipHelper } from '../utils/clipHelper';
import { GeminiHelper } from '../utils/geminiHelper';
import dynamic from 'next/dynamic';

// Dynamically import ClipComponent with no SSR
const ClipComponent = dynamic(
  () => import('../components/ClipComponent'),
  { ssr: false }
);

// Type definitions
type CocoClass = {
  category: string;
  description: string;
};

type CocoClasses = {
  [key: string]: CocoClass;
};

const typedCocoClasses = cocoClasses as CocoClasses;
const categories = Array.from(new Set(Object.values(typedCocoClasses).map(item => item.category)));

// Define colors for each category
const categoryColors: { [key: string]: string } = {
  people: '#FF0000',     // Red
  vehicle: '#00FF00',    // Green
  animal: '#0000FF',     // Blue
  sports: '#FFA500',     // Orange
  food: '#800080',       // Purple
  kitchen: '#008080',    // Teal
  furniture: '#FFD700',  // Gold
  electronics: '#FF69B4', // Hot Pink
  appliance: '#4B0082',  // Indigo
  indoor: '#20B2AA',     // Light Sea Green
  outdoor: '#FF6347',    // Tomato
  accessory: '#98FB98'   // Pale Green
};

export default function VideoDetection(): JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [model, setModel] = useState<cocoSsd.ObjectDetection | null>(null);
  const [threshold, setThreshold] = useState(0.5);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [detections, setDetections] = useState<DetectedObject[]>([]);
  const [textPrompt, setTextPrompt] = useState<string>('');
  const [clipSimilarityThreshold, setClipSimilarityThreshold] = useState(0.2);
  const clipHelperRef = useRef<ClipHelper>(new ClipHelper());
  const [clipEnabled, setClipEnabled] = useState(false);
  const [detectionHistory, setDetectionHistory] = useState<{
    [key: string]: {
      count: number;
      lastSeen: number;
      confidence: number;
      totalFrames: number;
      consecutiveFrames: number;
    };
  }>({});
  const [showLog, setShowLog] = useState(true);
  const entityTrackerRef = useRef<EntityTracker>(new EntityTracker());
  const latestDetectionsRef = useRef<DetectedObject[]>([]);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const [geminiEnabled, setGeminiEnabled] = useState(false);
  const [analyses, setAnalyses] = useState<{ [key: string]: string }>({});
  const geminiHelperRef = useRef<GeminiHelper | null>(null);
  const lastAnalysisTimeRef = useRef<number>(0);

  // Load saved analyses from localStorage on mount
  useEffect(() => {
    const savedAnalyses = localStorage.getItem('geminiAnalyses');
    if (savedAnalyses) {
      setAnalyses(JSON.parse(savedAnalyses));
    }
  }, []);

  // Save analyses to localStorage whenever they change
  useEffect(() => {
    if (Object.keys(analyses).length > 0) {
      localStorage.setItem('geminiAnalyses', JSON.stringify(analyses));
    }
  }, [analyses]);

  // Update detection history when new detections come in
  useEffect(() => {
    const now = Date.now();
    const newHistory = { ...detectionHistory };
    const currentClasses = new Set(detections.map(d => d.class));
    
    let hasChanges = false;
    
    // Update counts for current detections
    detections.forEach(detection => {
      const key = detection.class;
      if (!newHistory[key]) {
        newHistory[key] = {
          count: 0,
          lastSeen: now,
          confidence: 0,
          totalFrames: 0,
          consecutiveFrames: 0
        };
        hasChanges = true;
      }
      
      const entry = newHistory[key];
      const updatedEntry = {
        ...entry,
        count: entry.count + 1,
        lastSeen: now,
        confidence: Math.max(entry.confidence, detection.score || 0),
        totalFrames: entry.totalFrames + 1,
        consecutiveFrames: entry.consecutiveFrames + 1
      };
      
      if (JSON.stringify(entry) !== JSON.stringify(updatedEntry)) {
        newHistory[key] = updatedEntry;
        hasChanges = true;
      }
    });

    // Update objects not in current frame
    Object.keys(newHistory).forEach(key => {
      if (!currentClasses.has(key)) {
        const entry = newHistory[key];
        if (entry.consecutiveFrames !== 0) {
          entry.consecutiveFrames = 0;
          hasChanges = true;
        }
        // Only remove if not seen for 10 seconds and no consecutive frames
        if (now - entry.lastSeen > 10000 && entry.consecutiveFrames === 0) {
          delete newHistory[key];
          hasChanges = true;
        }
      }
    });

    // Only update state if there are actual changes
    if (hasChanges) {
      setDetectionHistory(newHistory);
    }
  }, [detections]);

  // Update detections state periodically instead of every frame
  useEffect(() => {
    const updateInterval = setInterval(() => {
      const newDetections = latestDetectionsRef.current;
      if (JSON.stringify(newDetections) !== JSON.stringify(detections)) {
        setDetections(newDetections);
      }
    }, 100); // Update every 100ms

    return () => {
      clearInterval(updateInterval);
    };
  }, [detections]);

  const groupedDetections = useMemo(() => {
    const groups: { [key: string]: Array<{
      class: string;
      count: number;
      confidence: number;
      isActive: boolean;
      totalFrames: number;
      consecutiveFrames: number;
    }> } = {};

    // Add all items from history
    Object.entries(detectionHistory).forEach(([className, data]) => {
      const category = typedCocoClasses[className]?.category || 'unknown';
      if (!groups[category]) {
        groups[category] = [];
      }
      
      // Check if this object is currently being detected
      const isActive = detections.some(d => d.class === className);
      
      groups[category].push({
        class: className,
        count: data.count,
        confidence: data.confidence,
        isActive,
        totalFrames: data.totalFrames,
        consecutiveFrames: data.consecutiveFrames
      });
    });

    // Sort categories by most recent activity
    Object.keys(groups).forEach(category => {
      groups[category].sort((a, b) => {
        // Sort by active status first, then by consecutive frames, then by total count
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        if (a.consecutiveFrames !== b.consecutiveFrames) return b.consecutiveFrames - a.consecutiveFrames;
        return b.count - a.count;
      });
    });

    return groups;
  }, [detections, detectionHistory]);

  useEffect(() => {
    // Initialize Gemini if enabled
    if (geminiEnabled && !geminiHelperRef.current) {
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (!apiKey) {
        console.error('Gemini API key not found');
        setGeminiEnabled(false);
        return;
      }
      console.log('Initializing Gemini');
      geminiHelperRef.current = new GeminiHelper(apiKey);
      console.log('Gemini helper initialized');
    }
  }, [geminiEnabled]);

  // Function to handle Gemini analysis
  const handleGeminiAnalysis = async (predictions: any[]) => {
    if (!geminiEnabled || !geminiHelperRef.current) return;

    const currentTime = Date.now();
    // Only analyze if it's been more than 5 seconds since last analysis
    if (currentTime - lastAnalysisTimeRef.current >= 5000) {
      try {
        console.log('🔄 Starting scene analysis');
        const result = await geminiHelperRef.current.analyzeDetections(predictions);
        if (result.analysis) {
          const newAnalyses = {
            ...analyses,
            scene: result.analysis
          };
          setAnalyses(newAnalyses);
          localStorage.setItem('geminiAnalyses', JSON.stringify(newAnalyses));
          lastAnalysisTimeRef.current = currentTime;
        }
      } catch (err) {
        const error = err as Error;
        console.error('❌ Error analyzing scene:', error.message);
      }
    }
  };

  // Toggle Gemini functionality
  const toggleGemini = async () => {
    const newState = !geminiEnabled;
    setGeminiEnabled(newState);
    
    if (newState) {
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (!apiKey) {
        console.error('Gemini API key not found');
        return;
      }

      console.log('🟣 Gemini Enabled - Starting immediate analysis');
      try {
        console.log('🔄 Initializing Gemini helper');
        if (!geminiHelperRef.current) {
          geminiHelperRef.current = new GeminiHelper(apiKey);
        }
        await geminiHelperRef.current.initialize();
        
        // Immediate analysis of current detections
        if (latestDetectionsRef.current.length > 0) {
          console.log('📸 Analyzing current scene');
          const result = await geminiHelperRef.current.analyzeDetections(latestDetectionsRef.current);
          if (result.analysis) {
            const newAnalyses = {
              ...analyses,
              scene: result.analysis
            };
            setAnalyses(newAnalyses);
            localStorage.setItem('geminiAnalyses', JSON.stringify(newAnalyses));
            lastAnalysisTimeRef.current = Date.now();
          }
        }
      } catch (err) {
        const error = err as Error;
        console.error('❌ Error initializing Gemini:', error.message);
      }
    } else {
      console.log('🔴 Gemini Disabled - Keeping existing analyses');
      // Analysis state will persist in localStorage and React state
    }
  };

  // Clear analyses
  const clearAnalyses = () => {
    setAnalyses({});
    localStorage.removeItem('geminiAnalyses');
  };

  useEffect(() => {
    let isSubscribed = true;

    const initializeModel = async () => {
      try {
        if (!model) {
          console.log('Loading COCO-SSD model...');
          const loadedModel = await cocoSsd.load({
            base: 'lite_mobilenet_v2'
          });
          if (isSubscribed) {
            console.log('Model loaded successfully');
            setModel(loadedModel);
          }
        }
      } catch (error) {
        console.error('Error loading model:', error);
      }
    };

    initializeModel();

    return () => {
      isSubscribed = false;
    };
  }, [model]);

  useEffect(() => {
    let animationFrameId: number;

    const startVideo = async () => {
      if (!videoRef.current) return;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false
        });

        videoRef.current.srcObject = stream;
        
        // Start detection loop once video is ready
        videoRef.current.onloadeddata = () => {
          if (model) {
            animationFrameId = requestAnimationFrame(detectObjects);
          }
        };
      } catch (error) {
        console.error('Error accessing camera:', error);
      }
    };

    if (model) {
      startVideo();
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
      }
    };
  }, [model]);

  // Clean up animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev => 
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const detectObjects = async () => {
    if (!model || !videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx || video.readyState !== 4) return;

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    try {
      const predictions = await model.detect(video);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Filter predictions by category first
      const categoryFilteredPredictions = predictions.filter(prediction => {
        const isSelectedCategory = selectedCategories.length === 0 || 
          selectedCategories.includes(typedCocoClasses[prediction.class]?.category || 'unknown');
        return prediction.score >= threshold && isSelectedCategory;
      });

      // Then apply CLIP filtering if enabled
      const clipFilteredPredictions = await Promise.all(
        categoryFilteredPredictions.map(async prediction => {
          if (!clipEnabled || !clipHelperRef.current) {
            return { ...prediction, clipMatch: true };
          }
          return {
            ...prediction,
            video,
            clipMatch: await clipHelperRef.current.checkClipSimilarity(
              { ...prediction, video },
              textPrompt,
              clipSimilarityThreshold
            )
          };
        })
      );

      const finalPredictions = clipFilteredPredictions
        .filter(pred => pred.clipMatch)
        .sort((a, b) => (b.score || 0) - (a.score || 0));

      // Update tracked entities
      const trackedEntities = await entityTrackerRef.current.update(
        finalPredictions,
        threshold,
        video,
        canvas
      );

      // Analyze with Gemini if enabled
      if (geminiEnabled && geminiHelperRef.current) {
        handleGeminiAnalysis(finalPredictions);
      }

      latestDetectionsRef.current = trackedEntities;

      // Draw predictions
      finalPredictions.forEach(prediction => {
        const [x, y, width, height] = prediction.bbox;
        const category = typedCocoClasses[prediction.class]?.category || 'unknown';
        const color = categoryColors[category] || '#ffffff';

        // Draw bounding box
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.rect(x, y, width, height);
        ctx.stroke();

        // Draw label background
        const label = `${prediction.class} ${Math.round(prediction.score! * 100)}%`;
        const fontSize = Math.max(12, Math.min(16, width / 10));
        ctx.font = `${fontSize}px Arial`;
        const textMetrics = ctx.measureText(label);
        const textWidth = textMetrics.width;
        const textHeight = fontSize;
        const padding = 4;

        // Draw top label
        ctx.fillStyle = `${color}dd`;
        ctx.fillRect(
          x,
          y - textHeight - padding * 2,
          textWidth + padding * 2,
          textHeight + padding * 2
        );
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, x + padding, y - padding);
      });

    } catch (error) {
      console.error('Detection error:', error);
    }

    animationFrameRef.current = requestAnimationFrame(detectObjects);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-bold">Object Detection</h1>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setShowLog(!showLog)}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              {showLog ? 'Hide Log' : 'Show Log'}
            </button>
            <button
              onClick={() => setClipEnabled(!clipEnabled)}
              className={`px-4 py-2 ${
                clipEnabled ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-500 hover:bg-gray-600'
              } text-white rounded transition-colors`}
            >
              CLIP {clipEnabled ? 'Enabled' : 'Disabled'}
            </button>
            <button
              onClick={toggleGemini}
              className={`px-4 py-2 ${
                geminiEnabled ? 'bg-purple-500 hover:bg-purple-600' : 'bg-gray-500 hover:bg-gray-600'
              } text-white rounded transition-colors`}
            >
              Gemini {geminiEnabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>
        </div>

        {/* CLIP Component */}
        <ClipComponent
          enabled={clipEnabled}
          onError={() => setClipEnabled(false)}
          clipHelperRef={clipHelperRef}
        />

        {/* CLIP Controls */}
        {clipEnabled && (
          <div className="mb-4 bg-gray-800 p-4 rounded-lg">
            <div className="flex flex-col space-y-4">
              <div className="flex items-center space-x-4">
                <input
                  type="text"
                  value={textPrompt}
                  onChange={(e) => setTextPrompt(e.target.value)}
                  placeholder="Try: 'find dangerous items' or 'show people eating'"
                  className="flex-1 px-4 py-2 bg-gray-700 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex flex-col space-y-2">
                  <label className="block text-white">Similarity: {clipSimilarityThreshold}</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={clipSimilarityThreshold}
                    onChange={(e) => setClipSimilarityThreshold(Number(e.target.value))}
                    className="w-32"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setTextPrompt("Find anything that looks dangerous")}
                  className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Detect Dangers
                </button>
                <button
                  onClick={() => setTextPrompt("Show medical equipment or supplies")}
                  className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Medical Items
                </button>
                <button
                  onClick={() => setTextPrompt("Find people eating or drinking")}
                  className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Eating/Drinking
                </button>
                <button
                  onClick={() => setTextPrompt("Show items that look broken or damaged")}
                  className="px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700"
                >
                  Broken Items
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <div className="relative bg-gray-800 p-4 rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: '100%',
                  height: 'auto',
                  display: 'block'
                }}
              />
              <canvas
                ref={canvasRef}
                style={{
                  position: 'absolute',
                  top: '1rem',
                  left: '1rem',
                  width: 'calc(100% - 2rem)',
                  height: 'calc(100% - 2rem)'
                }}
              />
            </div>
          </div>

          {/* Gemini Analysis Panel */}
          {geminiEnabled && (
            <div className="lg:col-span-1">
              <div className="bg-gray-800 p-4 rounded-lg h-full overflow-auto">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold">Gemini Analysis</h2>
                  {Object.keys(analyses).length > 0 && (
                    <button
                      onClick={clearAnalyses}
                      className="px-2 py-1 text-sm bg-red-500 hover:bg-red-600 text-white rounded"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {Object.entries(analyses).map(([key, data]) => (
                  <div 
                    key={key} 
                    className="mb-4 p-3 rounded-lg bg-gray-700"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-semibold">{key}</span>
                    </div>
                    <p className="text-sm text-gray-200">{data}</p>
                  </div>
                ))}
                {Object.keys(analyses).length === 0 && (
                  <div className="text-gray-400 text-center">
                    No Gemini analysis yet
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Detection Log */}
          {showLog && (
            <div className="lg:col-span-1">
              <div className="bg-gray-800 p-4 rounded-lg h-full overflow-auto">
                <h2 className="text-xl font-bold mb-4">Detection Log</h2>
                {Object.entries(groupedDetections).map(([category, items]) => (
                  <div key={category} className="mb-4">
                    <h3 className="text-lg font-semibold mb-2" style={{ color: categoryColors[category] }}>
                      {category} ({items.length})
                    </h3>
                    <div className="space-y-2">
                      {items.map((item) => (
                        <div 
                          key={item.class}
                          className={`bg-gray-700 p-2 rounded transition-all duration-300 ${
                            item.isActive 
                              ? 'border-l-4 border-green-500' 
                              : item.consecutiveFrames > 0 
                                ? 'border-l-4 border-yellow-500 opacity-90'
                                : 'opacity-75'
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <span>{typedCocoClasses[item.class]?.description || item.class}</span>
                            <div className="flex items-center space-x-2">
                              <span className="text-sm bg-gray-600 px-2 py-1 rounded">
                                {item.count}x
                              </span>
                              {item.consecutiveFrames > 0 && (
                                <span className="text-sm bg-green-600 px-2 py-1 rounded">
                                  {item.consecutiveFrames}f
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-gray-400 text-sm flex justify-between mt-1">
                            <span>Confidence: {Math.round(item.confidence * 100)}%</span>
                            <span>
                              {item.isActive ? 'Active' : 
                               item.consecutiveFrames > 0 ? 'Recent' : 
                               'Inactive'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {Object.keys(groupedDetections).length === 0 && (
                  <div className="text-gray-400 text-center">
                    No objects detected
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
