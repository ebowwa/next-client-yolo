import * as tf from '@tensorflow/tfjs';

interface EmbeddingOutput {
  data: Float32Array;
  dims: number[];
}

export class ClipHelper {
  private model: any = null;
  private pipeline: any = null;
  private cache: { [key: string]: number[] } = {};

  async initialize() {
    if (!this.model) {
      console.log('Loading CLIP model...');
      try {
        // Dynamic import to ensure client-side only
        const transformers = await import('@xenova/transformers');
        this.pipeline = transformers.pipeline;
        this.model = await this.pipeline('feature-extraction', 'Xenova/clip-vit-base-patch32');
        console.log('CLIP model loaded successfully');
      } catch (error) {
        console.error('Failed to load CLIP model:', error);
        throw error;
      }
    }
    return this.model;
  }

  async getTextEmbedding(text: string): Promise<number[]> {
    // Generate variations of the text prompt for better matching
    const variations = [
      text,
      `a photo of ${text}`,
      `an image of ${text}`,
      `a picture showing ${text}`,
      text.toLowerCase(),
      text.charAt(0).toUpperCase() + text.slice(1)
    ];
    
    // Use cache if available
    const cacheKey = variations[0];
    if (this.cache[cacheKey]) {
      return this.cache[cacheKey];
    }

    if (!this.model) {
      await this.initialize();
    }

    try {
      // Get embeddings for all variations
      const embeddings = await Promise.all(
        variations.map(async (variant) => {
          const result = await this.model(variant, { pooling: 'mean', normalize: true }) as EmbeddingOutput;
          return Array.from(result.data);
        })
      );

      // Average the embeddings
      const avgEmbedding = embeddings[0].map((_, i) => 
        embeddings.reduce((sum, emb) => sum + emb[i], 0) / embeddings.length
      );

      this.cache[cacheKey] = avgEmbedding;
      return avgEmbedding;
    } catch (error) {
      console.error('Error getting text embedding:', error);
      throw error;
    }
  }

  async getImageRegionEmbedding(
    video: HTMLVideoElement,
    bbox: [number, number, number, number]
  ): Promise<number[]> {
    if (!this.model) {
      await this.initialize();
    }

    const [x, y, width, height] = bbox;
    
    // Create a temporary canvas to extract the region
    const canvas = document.createElement('canvas');
    // Ensure minimum dimensions for better detection
    canvas.width = Math.max(width, 224);  // CLIP minimum recommended size
    canvas.height = Math.max(height, 224);
    const ctx = canvas.getContext('2d');
    
    if (!ctx) throw new Error('Could not get canvas context');
    
    try {
      // Draw the region to the canvas with some padding for context
      const padding = 20;
      ctx.drawImage(
        video,
        Math.max(0, x - padding), 
        Math.max(0, y - padding), 
        width + padding * 2, 
        height + padding * 2,
        0, 0, canvas.width, canvas.height
      );

      // Convert canvas to blob
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.95);
      });

      const imageUrl = URL.createObjectURL(blob);
      
      // Get multiple embeddings with slight variations
      const embeddings = await Promise.all([
        this.model(imageUrl, { pooling: 'mean', normalize: true }),
        this.model(imageUrl, { pooling: 'cls', normalize: true })
      ]) as EmbeddingOutput[];
      
      URL.revokeObjectURL(imageUrl);
      
      // Average the embeddings
      const avgEmbedding = Array.from(embeddings[0].data).map((_, i) => 
        embeddings.reduce((sum, emb) => sum + emb.data[i], 0) / embeddings.length
      );
      
      return avgEmbedding;
    } catch (error) {
      console.error('Error getting image region embedding:', error);
      throw error;
    }
  }

  calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    try {
      const tensor1 = tf.tensor1d(embedding1);
      const tensor2 = tf.tensor1d(embedding2);
      
      // Normalize the embeddings
      const normalized1 = tf.div(tensor1, tf.norm(tensor1));
      const normalized2 = tf.div(tensor2, tf.norm(tensor2));
      
      // Calculate cosine similarity
      const similarity = tf.dot(normalized1, normalized2);
      const result = similarity.dataSync()[0];
      
      // Apply sigmoid-like scaling to make the similarity more interpretable
      const scaledResult = (1 / (1 + Math.exp(-10 * (result - 0.5))));
      
      // Cleanup
      tensor1.dispose();
      tensor2.dispose();
      normalized1.dispose();
      normalized2.dispose();
      similarity.dispose();
      
      return scaledResult;
    } catch (error) {
      console.error('Error calculating similarity:', error);
      throw error;
    }
  }

  async checkClipSimilarity(
    detection: any,
    textPrompt: string,
    threshold: number
  ): Promise<boolean> {
    if (!textPrompt) return true;
    
    try {
      const textEmbedding = await this.getTextEmbedding(textPrompt);
      const regionEmbedding = await this.getImageRegionEmbedding(
        detection.video,
        detection.bbox as [number, number, number, number]
      );
      
      const similarity = this.calculateSimilarity(
        textEmbedding,
        regionEmbedding
      );
      
      console.log(`CLIP similarity for "${detection.class}" with prompt "${textPrompt}":`, similarity);
      
      // Adjust threshold based on the class name similarity
      const classNameSimilarity = await this.getTextEmbedding(detection.class)
        .then(classEmbed => this.calculateSimilarity(classEmbed, textEmbedding))
        .catch(() => 0);
      
      // If the class name is very similar to the prompt, lower the threshold
      const adjustedThreshold = classNameSimilarity > 0.8 ? threshold * 0.8 : threshold;
      
      const matches = similarity > adjustedThreshold;
      console.log('Matches threshold?', matches, '(adjusted threshold:', adjustedThreshold, ')');
      return matches;
    } catch (error) {
      console.error('Error in CLIP similarity check:', error);
      // Return false on error instead of true to avoid false positives
      return false;
    }
  }
}
