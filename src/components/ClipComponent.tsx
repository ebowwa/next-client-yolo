'use client';

import { useEffect, useRef } from 'react';
import { ClipHelper } from '../utils/clipHelper';

interface ClipComponentProps {
  enabled: boolean;
  onError: () => void;
  clipHelperRef: React.MutableRefObject<ClipHelper>;
}

export default function ClipComponent({ enabled, onError, clipHelperRef }: ClipComponentProps) {
  useEffect(() => {
    const initClip = async () => {
      if (enabled && clipHelperRef.current) {
        console.log('Initializing CLIP...');
        try {
          await clipHelperRef.current.initialize();
          console.log('CLIP initialized successfully');
        } catch (error) {
          console.error('Failed to initialize CLIP:', error);
          onError();
        }
      }
    };
    initClip();
  }, [enabled, onError, clipHelperRef]);

  return null; // This component doesn't render anything
}
