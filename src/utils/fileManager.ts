import { FileState } from './fileState';

export class FileManager {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async uploadFile(file: File | Blob, displayName: string): Promise<any> {
    try {
      // Convert File/Blob to base64
      const base64Data = await this.fileToBase64(file);
      
      // Upload using a custom implementation (e.g., using the Fetch API)
      const mimeType = this.getMimeType(file);
      const uploadResult = await this.uploadFileUsingFetch(base64Data, mimeType, displayName);

      // Wait for processing if it's a video or audio file
      if (mimeType.startsWith('video/') || mimeType.startsWith('audio/')) {
        let file = await this.getFile(uploadResult.file.name);
        while (file.state === FileState.PROCESSING) {
          await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds
          file = await this.getFile(uploadResult.file.name);
        }

        if (file.state === FileState.FAILED) {
          throw new Error('File processing failed');
        }
      }

      return uploadResult.file;
    } catch (error) {
      console.error('Error uploading file:', error);
      throw error;
    }
  }

  async uploadVideoFile(file: File | Blob): Promise<{ uri: string; mimeType: string }> {
    try {
      // Convert video to base64
      const base64Data = await this.fileToBase64(file);
      const mimeType = this.getMimeType(file);

      if (!mimeType.startsWith('video/')) {
        throw new Error('File must be a video');
      }

      // Make API call to upload video
      const response = await fetch('https://generativelanguage.googleapis.com/v1/media:upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          data: base64Data,
          mimeType: mimeType
        })
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      
      // Poll until video is processed
      let fileState = FileState.PROCESSING;
      while (fileState === FileState.PROCESSING) {
        const stateResponse = await fetch(`https://generativelanguage.googleapis.com/v1/media/${result.name}`, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          }
        });
        
        if (!stateResponse.ok) {
          throw new Error('Failed to check video processing status');
        }

        const stateResult = await stateResponse.json();
        fileState = stateResult.state;

        if (fileState === FileState.FAILED) {
          throw new Error('Video processing failed');
        }

        if (fileState === FileState.PROCESSING) {
          await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
        }
      }

      return {
        uri: result.uri,
        mimeType: mimeType
      };
    } catch (error) {
      console.error('Error uploading video:', error);
      throw error;
    }
  }

  public async fileToBase64(file: File | Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
        const base64Data = base64String.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  public getMimeType(file: File | Blob): string {
    if (file instanceof File) {
      return file.type || 'application/octet-stream';
    }
    return 'application/octet-stream';
  }

  private async uploadFileUsingFetch(base64Data: string, mimeType: string, displayName: string): Promise<any> {
    // Implement a custom upload logic using the Fetch API
    // For demonstration purposes, this example simply returns a mock response
    return {
      file: {
        name: displayName,
        state: FileState.UPLOADED,
      },
    };
  }

  async getFile(fileName: string) {
    // Implement a custom logic to retrieve a file
    // For demonstration purposes, this example simply returns a mock response
    return {
      state: FileState.UPLOADED,
    };
  }

  async listFiles() {
    // Implement a custom logic to list files
    // For demonstration purposes, this example simply returns a mock response
    return [];
  }

  async deleteFile(fileName: string) {
    // Implement a custom logic to delete a file
    // For demonstration purposes, this example does nothing
  }
}
