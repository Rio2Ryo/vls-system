// CM Segment types
export type SegmentType = "A" | "B" | "C" | "D";

export interface CMConfig {
  segment: SegmentType;
  showCM: boolean;
  videoIds: string[];
  durations: number[]; // seconds per video
}

export interface SurveyQuestion {
  id: string;
  question: string;
  options: string[];
}

export interface SurveyAnswer {
  questionId: string;
  answer: string;
}

// Matching types
export type MatchLevel = "certain" | "high" | "review" | "none";

export type PhotoTag =
  | "face_detected"
  | "no_face"
  | "group"
  | "individual"
  | "indoor"
  | "outdoor";

export interface MatchResult {
  id: string;
  thumbnailUrl: string;
  score: number;
  level: MatchLevel;
  eventName: string;
  date: string;
  tags: PhotoTag[];
}

export interface UploadedPhoto {
  id: string;
  file: File | null;
  previewUrl: string;
  name: string;
}

// Event
export interface EventInfo {
  code: string;
  name: string;
  date: string;
  location: string;
}
