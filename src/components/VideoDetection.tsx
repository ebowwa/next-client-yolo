"use client";

import React, { useRef, useEffect, useState } from 'react';
import type { JSX } from 'react';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';
import type { DetectedObject } from '@tensorflow-models/coco-ssd';
import cocoClasses from '@/utils/cocoClasses.json';

interface VideoDetectionProps {
  onDetectionsUpdate?: (detections: DetectedObject[]) => void;
  threshold?: number;
  selectedCategories?: string[];
}

// Category-based colors for better visualization
const categoryColors: { [key: string]: string } = {
  people: '#FF0000',
  vehicle: '#00FF00',
  animal: '#0000FF',
  sports: '#FFA500',
  food: '#800080',
  kitchen: '#008080',
  furniture: '#FFD700',
  electronics: '#FF69B4',
  appliance: '#4B0082',
  indoor: '#20B2AA',
  outdoor: '#FF6347',
  accessory: '#98FB98'
};

export const VideoDetection: React.FC<VideoDetectionProps> = ({
  onDetectionsUpdate,
  threshold = 0.5,
  selectedCategories
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [model, setModel] = useState<cocoSsd.ObjectDetection | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [stats, setStats] = useState<{ [key: string]: number }>({});

  useEffect(() => {
    const loadModel = async () => {
      const loadedModel = await cocoSsd.load();
      setModel(loadedModel);
    };
    loadModel();
  }, []);

  useEffect(() => {
    const setupCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setIsStreaming(true);
        }
      } catch (error) {
        console.error('Error accessing camera:', error);
      }
    };

    setupCamera();

    return () => {
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
      }
    };
  }, []);

  const getObjectCategory = (className: string): string => {
    return (cocoClasses as any)[className]?.category || 'unknown';
  };

  const shouldShowDetection = (detection: DetectedObject): boolean => {
    if (!selectedCategories || selectedCategories.length === 0) return true;
    const category = getObjectCategory(detection.class);
    return selectedCategories.includes(category);
  };

  useEffect(() => {
    let animationFrameId: number;

    const detectFrame = async () => {
      if (!model || !videoRef.current || !canvasRef.current || !isStreaming) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const detections = await model.detect(video);
      
      // Update detection statistics
      const newStats: { [key: string]: number } = {};
      detections.forEach((detection) => {
        if ((detection.score || 0) > threshold) {
          const category = getObjectCategory(detection.class);
          newStats[category] = (newStats[category] || 0) + 1;
        }
      });
      setStats(newStats);

      if (onDetectionsUpdate) {
        onDetectionsUpdate(detections);
      }

      // Clear previous drawings
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw video frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Draw detections
      detections.forEach((detection) => {
        if ((detection.score || 0) > threshold && shouldShowDetection(detection)) {
          const [x, y, width, height] = detection.bbox;
          const category = getObjectCategory(detection.class);
          const color = categoryColors[category] || '#FFFFFF';
          
          // Draw bounding box
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, width, height);

          // Draw label background
          ctx.fillStyle = color;
          const description = (cocoClasses as any)[detection.class]?.description || detection.class;
          const label = `${description} (${Math.round((detection.score || 0) * 100)}%)`;
          const labelWidth = ctx.measureText(label).width;
          ctx.fillRect(x, y - 25, labelWidth + 10, 25);

          // Draw label text
          ctx.fillStyle = '#000000';
          ctx.font = '16px Arial';
          ctx.fillText(label, x + 5, y - 5);
        }
      });

      animationFrameId = requestAnimationFrame(detectFrame);
    };

    detectFrame();

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [model, isStreaming, onDetectionsUpdate, threshold, selectedCategories]);

  return (
    <div className="relative">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ display: 'none' }}
      />
      <canvas
        ref={canvasRef}
        className="rounded-lg"
      />
      <div className="absolute top-2 right-2 bg-black/50 p-2 rounded text-white text-sm">
        {Object.entries(stats).map(([category, count]) => (
          <div key={category}>
            {category}: {count}
          </div>
        ))}
      </div>
    </div>
  );
};
