import { GoogleGenerativeAI } from '@google/generative-ai';

export class GeminiHelper {
  private model: any = null;
  private genAI: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
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

  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        } else {
          reject(new Error('Failed to convert blob to base64'));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
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
      const imageData = await this.blobToBase64(blob);

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
}
