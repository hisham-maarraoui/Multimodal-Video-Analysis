import { google } from 'googleapis';

// Initialize the YouTube client
const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY // This should be set in your environment variables
});

export { youtube }; 