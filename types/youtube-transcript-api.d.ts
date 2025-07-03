import { YouTubeTranscriptItem } from '@/lib/types';

declare module 'youtube-transcript-api' {
  const YoutubeTranscript: any;
  export default YoutubeTranscript;
} 