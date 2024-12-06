"use client";

import React, { useRef, useEffect, useState, useMemo } from 'react';
import type { JSX } from 'react';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';
import type { DetectedObject } from '@tensorflow-models/coco-ssd';
import cocoClasses from '../utils/cocoClasses.json';
import { EntityTracker } from '../utils/entityTracker';

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

  const detectObjects = async () => {
    if (!model || !videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx || video.readyState !== 4) return;

    // Ensure canvas dimensions match video
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    canvas.width = videoWidth;
    canvas.height = videoHeight;

    try {
      // Get predictions
      const predictions = await model.detect(video);
      
      // Clear previous drawings
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Filter predictions based on threshold and selected categories
      const validPredictions = predictions
        .filter(prediction => {
          const isSelectedCategory = selectedCategories.length === 0 || 
            selectedCategories.includes(typedCocoClasses[prediction.class]?.category || 'unknown');
          return prediction.score >= (threshold * 0.7) && isSelectedCategory;
        })
        .sort((a, b) => (b.score || 0) - (a.score || 0));

      // Update tracked entities
      const trackedEntities = await entityTrackerRef.current.update(
        validPredictions,
        threshold * 0.7,
        video,
        canvas
      );

      // Update latest detections ref
      latestDetectionsRef.current = trackedEntities;

      // Draw predictions
      validPredictions.forEach(prediction => {
        const [x, y, width, height] = prediction.bbox;
        const category = typedCocoClasses[prediction.class]?.category || 'unknown';
        const color = categoryColors[category] || '#ffffff';

        // Draw bounding box
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, width, height);

        // Draw label background
        const label = `${prediction.class} ${Math.round(prediction.score! * 100)}%`;
        const fontSize = Math.max(12, Math.min(16, width / 10));
        ctx.font = `${fontSize}px Arial`;
        const textMetrics = ctx.measureText(label);
        const textWidth = textMetrics.width;
        const textHeight = fontSize;
        const padding = 4;

        ctx.fillStyle = `${color}dd`;
        ctx.fillRect(
          x - 1,
          y - textHeight - padding * 2,
          textWidth + padding * 2,
          textHeight + padding * 2
        );

        // Draw label text
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, x + padding, y - padding);
      });

    } catch (error) {
      console.error('Detection error:', error);
    }

    // Request next frame
    animationFrameRef.current = requestAnimationFrame(detectObjects);
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

  return (
    <main className="min-h-screen p-4 bg-gray-900">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-bold text-white">Object Detection</h1>
          <button
            onClick={() => setShowLog(!showLog)}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            {showLog ? 'Hide Log' : 'Show Log'}
          </button>
        </div>
        
        <div className="mb-4 bg-gray-800 p-4 rounded-lg">
          <div className="mb-4">
            <label className="block text-white mb-2">Detection Threshold: {threshold}</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-full"
            />
          </div>
          
          <div>
            <label className="block text-white mb-2">Filter Categories:</label>
            <div className="flex flex-wrap gap-2">
              {categories.map(category => (
                <button
                  key={category}
                  onClick={() => toggleCategory(category)}
                  className={`px-3 py-1 rounded ${
                    selectedCategories.includes(category)
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-600 text-gray-200'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Video Detection Panel */}
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

          {/* Detection Log Panel */}
          {showLog && (
            <div className="lg:col-span-1">
              <div className="bg-gray-800 p-4 rounded-lg h-full overflow-auto">
                <h2 className="text-xl font-bold text-white mb-4">Detection Log</h2>
                {Object.entries(groupedDetections).map(([category, items]) => (
                  <div key={category} className="mb-4">
                    <h3 className="text-lg font-semibold text-white mb-2" style={{ color: categoryColors[category] }}>
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
                          <div className="text-white flex justify-between items-center">
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
    </main>
  );
}
