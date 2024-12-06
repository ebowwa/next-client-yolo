import { GoogleGenerativeAI } from '@google/generative-ai';
import { FileManager } from './fileManager';

export class GeminiHelper {
  private model: any = null;
  private genAI: GoogleGenerativeAI;
  private fileManager: FileManager;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.fileManager = new FileManager(apiKey);
    // Initialize immediately
    this.initialize().catch(console.error);
  }

  async initialize() {
    if (!this.model) {
      try {
        this.model = this.genAI.getGenerativeModel({
          model: "gemini-1.5-flash",  // Changed to correct model name
          generationConfig: {
            temperature: 0.4,
            topP: 0.8,
            topK: 40,
            maxOutputTokens: 1024,
          }
        });
        console.log('Gemini model initialized successfully');
      } catch (error) {
        console.error('Failed to initialize Gemini model:', error);
        throw error;
      }
    }
    return this.model;
  }

  async analyzeMedia(mediaType: 'image' | 'video' | 'audio', file: File | Blob, prompt?: string): Promise<{ analysis: string }> {
    try {
      if (!this.model) {
        return { analysis: 'Gemini is disabled' };
      }

      // Convert file to base64
      const base64Data = await this.fileManager.fileToBase64(file);
      const mimeType = this.fileManager.getMimeType(file);

      // Build the content parts for the API call
      const contentParts: any[] = [{
        inlineData: {
          mimeType,
          data: base64Data
        }
      }];

      // Add the prompt
      const defaultPrompts = {
        image: 'Analyze this image and describe what you see.',
        video: 'Analyze this video and describe what happens in it.',
        audio: 'Transcribe and analyze this audio content.'
      };

      contentParts.push(prompt || defaultPrompts[mediaType]);

      // Generate content
      const result = await this.model.generateContent(contentParts);
      return { analysis: result.response.text() };

    } catch (err) {
      const error = err as Error;
      console.error(`Error in ${mediaType} analysis:`, error.message);
      return { analysis: `Error analyzing ${mediaType}: ${error.message}` };
    }
  }

  async analyzeVideoTimestamp(videoFile: File | Blob, timestamp: string, prompt: string): Promise<{ analysis: string }> {
    return this.analyzeMedia('video', videoFile, `At timestamp ${timestamp}, ${prompt}`);
  }

  async analyzeAudioSegment(audioFile: File | Blob, startTime: string, endTime: string, prompt?: string): Promise<{ analysis: string }> {
    const timePrompt = `Analyze the audio segment from ${startTime} to ${endTime}. ${prompt || ''}`;
    return this.analyzeMedia('audio', audioFile, timePrompt);
  }

  async analyzeVideo(videoFile: File | Blob, prompt?: string): Promise<{ analysis: string }> {
    try {
      if (!this.model) {
        return { analysis: 'Gemini is disabled' };
      }

      // Upload video using File API
      const { uri, mimeType } = await this.fileManager.uploadVideoFile(videoFile);

      // Build content parts for the API call
      const contentParts = [
        {
          fileData: {
            fileUri: uri,
            mimeType: mimeType
          }
        },
        prompt || "Analyze this video and describe what happens in it, including both visual and audio content."
      ];

      // Generate content
      const result = await this.model.generateContent(contentParts);
      return { analysis: result.response.text() };

    } catch (err) {
      const error = err as Error;
      console.error('Error analyzing video:', error.message);
      return { analysis: `Error analyzing video: ${error.message}` };
    }
  }

  async analyzeVideoSegment(videoFile: File | Blob, startTime: string, endTime: string, prompt?: string): Promise<{ analysis: string }> {
    try {
      if (!this.model) {
        return { analysis: 'Gemini is disabled' };
      }

      // Upload video using File API
      const { uri, mimeType } = await this.fileManager.uploadVideoFile(videoFile);

      // Build content parts for the API call
      const timePrompt = `Analyze the video segment from ${startTime} to ${endTime}. ${prompt || 'Describe what happens during this segment.'}`;
      
      const contentParts = [
        {
          fileData: {
            fileUri: uri,
            mimeType: mimeType
          }
        },
        timePrompt
      ];

      // Generate content
      const result = await this.model.generateContent(contentParts);
      return { analysis: result.response.text() };

    } catch (err) {
      const error = err as Error;
      console.error('Error analyzing video segment:', error.message);
      return { analysis: `Error analyzing video segment: ${error.message}` };
    }
  }

  async getVideoTranscript(videoFile: File | Blob): Promise<{ transcript: string }> {
    try {
      if (!this.model) {
        return { transcript: 'Gemini is disabled' };
      }

      // Upload video using File API
      const { uri, mimeType } = await this.fileManager.uploadVideoFile(videoFile);

      // Build content parts for the API call
      const contentParts = [
        {
          fileData: {
            fileUri: uri,
            mimeType: mimeType
          }
        },
        "Transcribe the audio from this video, including timestamps. Also provide brief visual descriptions for context."
      ];

      // Generate content
      const result = await this.model.generateContent(contentParts);
      return { transcript: result.response.text() };

    } catch (err) {
      const error = err as Error;
      console.error('Error generating transcript:', error.message);
      return { transcript: `Error generating transcript: ${error.message}` };
    }
  }

  async analyzeDetections(detections: any[]): Promise<{ analysis: string }> {
    try {
      if (!this.model) {
        // Try to get past analysis for similar scene
        const pastAnalysis = await this.getPastSceneAnalysis(detections);
        if (pastAnalysis) {
          console.log('📚 Retrieved past scene analysis from database');
          return { analysis: pastAnalysis };
        }
        return { analysis: 'Gemini is disabled and no past analysis found' };
      }

      const video = document.querySelector('video');
      if (!video) throw new Error('Video element not found');

      // Create a canvas for the entire scene
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');

      // Draw the full video frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Draw bounding boxes for all detections
      detections.forEach(detection => {
        const [x, y, width, height] = detection.bbox;
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, width, height);
      });

      // Convert canvas to base64
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.95);
      });
      const imageData = await this.fileManager.fileToBase64(blob);

      // Build prompt with all objects
      const objectsList = detections.map(d => d.class).join(', ');
      const prompt = `Analyze this scene containing: ${objectsList}. 
      Describe how these objects relate to each other and the overall context.
      Keep the response concise but informative.`;

      console.log('🔍 Analyzing scene with objects:', objectsList);
      const result = await this.model.generateContent([
        prompt,
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: imageData
          }
        }
      ]);

      const analysis = result.response.text();
      console.log('✨ Scene analysis:', analysis);

      // Save to database
      await this.saveSceneAnalysis(detections, analysis);

      return { analysis };
    } catch (err) {
      const error = err as Error;
      console.error('Error in scene analysis:', error.message);
      return { analysis: `Error analyzing scene: ${error.message}` };
    }
  }

  private async saveSceneAnalysis(detections: any[], analysis: string) {
    try {
      const response = await fetch('http://localhost:8000/detections/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          object_class: 'scene',
          confidence: 1.0,
          bbox: {
            x: 0,
            y: 0,
            width: window.innerWidth,
            height: window.innerHeight
          },
          objects: detections.map(d => ({
            class: d.class,
            bbox: d.bbox
          })),
          gemini_analysis: analysis
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to save scene analysis: ${errorText}`);
      }
      
      console.log('💾 Scene analysis saved to database');
      return await response.json();
    } catch (err) {
      const error = err as Error;
      console.error('Error saving scene analysis:', error.message);
      // Don't throw - we want to continue even if saving fails
    }
  }

  private async getPastSceneAnalysis(detections: any[]): Promise<string | null> {
    try {
      const response = await fetch('http://localhost:8000/detections/');
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch past analyses: ${errorText}`);
      }

      const pastDetections = await response.json();
      
      // Find similar scene (same number and types of objects)
      const currentObjects = detections.map(d => d.class).sort().join(',');
      const matchingScene = pastDetections.find((scene: any) => {
        if (!scene.objects) return false;
        const sceneObjects = scene.objects
          .map((obj: any) => obj.class_name)
          .sort()
          .join(',');
        return sceneObjects === currentObjects;
      });

      return matchingScene ? matchingScene.gemini_analysis : null;
    } catch (err) {
      const error = err as Error;
      console.error('Error fetching past scene analysis:', error.message);
      return null;
    }
  }
}
