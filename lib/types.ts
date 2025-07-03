export interface TranscriptCue {
  text: string;
  start: number;
  end: number;
}

export interface YouTubeTranscriptItem {
  text: string;
  start: number;
  duration: number;
}

declare module 'youtube-transcript-api' {
  export class YoutubeTranscript {
    static fetchTranscript(videoId: string, options?: { lang?: string; country?: string }): Promise<YouTubeTranscriptItem[]>;
  }
} 