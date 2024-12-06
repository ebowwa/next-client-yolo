import type { DetectedObject } from '@tensorflow-models/coco-ssd';
import type { TrackedEntity, CandidateEntity } from '../types/entities';

export class EntityTracker {
  private entities: TrackedEntity[] = [];
  private candidates: CandidateEntity[] = [];
  private nextId = 1;
  private iouThreshold = 0.3;
  private consecutiveRequirement = 3;
  private embeddingDim = 384;
  private maxInactiveFrames = 30;
  private frameCount = 0;

  async update(detections: DetectedObject[], threshold: number, video: HTMLVideoElement, canvas: HTMLCanvasElement): Promise<TrackedEntity[]> {
    this.frameCount++;
    const validDetections = detections.filter(d => (d.score || 0) > threshold);
    
    // Process existing entities first
    this.entities = this.entities.filter(entity => {
      const framesSinceLastSeen = this.frameCount - entity.lastSeenFrame;
      return framesSinceLastSeen < this.maxInactiveFrames;
    });

    // Match detections with existing entities
    const matchedDetections = new Set<DetectedObject>();
    this.entities.forEach(entity => {
      const bestMatch = validDetections
        .filter(d => !matchedDetections.has(d) && d.class === entity.class) // Match same class objects
        .map(d => ({
          detection: d,
          iou: this.calculateIoU(entity.bbox, d.bbox)
        }))
        .filter(match => match.iou > this.iouThreshold)
        .sort((a, b) => b.iou - a.iou)[0];

      if (bestMatch) {
        matchedDetections.add(bestMatch.detection);
        entity.bbox = bestMatch.detection.bbox;
        entity.score = bestMatch.detection.score || 0;
        entity.lastSeenFrame = this.frameCount;
      }
    });

    // Create candidates for unmatched detections
    validDetections
      .filter(d => !matchedDetections.has(d))
      .forEach(detection => {
        const existingCandidate = this.candidates.find(
          c => c.class === detection.class && 
          this.calculateIoU(c.bbox, detection.bbox) > this.iouThreshold
        );

        if (existingCandidate) {
          existingCandidate.consecutiveFrames++;
          existingCandidate.bbox = detection.bbox;
          existingCandidate.score = detection.score || 0;
          
          if (existingCandidate.consecutiveFrames >= this.consecutiveRequirement) {
            this.entities.push({
              id: this.nextId++,
              class: detection.class,
              bbox: detection.bbox,
              score: detection.score || 0,
              lastSeenFrame: this.frameCount
            });
            this.candidates = this.candidates.filter(c => c !== existingCandidate);
          }
        } else {
          this.candidates.push({
            class: detection.class,
            bbox: detection.bbox,
            score: detection.score || 0,
            consecutiveFrames: 1
          });
        }
      });

    // Clean up old candidates
    this.candidates = this.candidates.filter(candidate => {
      const matchingDetection = validDetections.find(
        d => d.class === candidate.class && 
        this.calculateIoU(candidate.bbox, d.bbox) > this.iouThreshold
      );
      return matchingDetection !== undefined;
    });

    return this.entities;
  }

  private calculateIoU(b1: [number, number, number, number], b2: [number, number, number, number]): number {
    const [x1, y1, w1, h1] = b1;
    const [x2, y2, w2, h2] = b2;

    const intersectionX = Math.max(0, Math.min(x1 + w1, x2 + w2) - Math.max(x1, x2));
    const intersectionY = Math.max(0, Math.min(y1 + h1, y2 + h2) - Math.max(y1, y2));
    const interArea = intersectionX * intersectionY;
    const boxAArea = w1 * h1;
    const boxBArea = w2 * h2;

    return interArea / (boxAArea + boxBArea - interArea);
  }

  getAllEntities(): TrackedEntity[] {
    return this.entities;
  }
}
