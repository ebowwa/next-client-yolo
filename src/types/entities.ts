import type { DetectedObject } from '@tensorflow-models/coco-ssd';

export interface TrackedEntity extends DetectedObject {
  id: number;
  lastSeenFrame: number;
}

export interface CandidateEntity {
  class: string;
  bbox: [number, number, number, number];
  score: number;
  consecutiveFrames: number;
}
