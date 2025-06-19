import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { pipeline } from 'stream/promises';
import { CLIPModel, CLIPTokenizer } from '@xenova/transformers';
import { pipeline as xenovaPipeline } from '@xenova/transformers';
import ffmpeg from '@ffmpeg-installer/ffmpeg';

// Global pipeline cache for speed
let cachedImagePipeline: any = null;
let cachedTextPipeline: any = null;

// Download a YouTube video to a local file using yt-dlp
export async function downloadYouTubeVideo(youtubeUrl: string, outputPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ['-f', 'mp4', '-o', outputPath, youtubeUrl];
    const ytdlp = spawn('yt-dlp', args);
    ytdlp.on('close', (code) => {
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error('yt-dlp failed to download video.'));
      }
    });
  });
}

// Extract frames from a video file using ffmpeg
export async function extractFrames(videoPath: string, outputDir: string, fps = 1): Promise<string[]> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const args = ['-i', videoPath, '-vf', `fps=${fps}`, path.join(outputDir, 'frame-%04d.jpg')];
    const ffmpegProcess = spawn(ffmpeg.path, args);
    ffmpegProcess.on('close', (code) => {
      if (code === 0) {
        const files = fs.readdirSync(outputDir)
          .filter(f => f.endsWith('.jpg'))
          .map(f => path.join(outputDir, f));
        resolve(files);
      } else {
        reject(new Error('ffmpeg failed'));
      }
    });
  });
}

// Embed images using CLIP
export async function embedImagesCLIP(imagePaths: string[]): Promise<Float32Array[]> {
  // Use the image-feature-extraction pipeline for CLIP (base model)
  if (!cachedImagePipeline) {
    cachedImagePipeline = await xenovaPipeline(
      'image-feature-extraction',
      'Xenova/clip-vit-base-patch16'
    );
  }
  const model = cachedImagePipeline;
  if (imagePaths.length > 10) {
    console.warn('WARNING: More than 10 frames passed to embedImagesCLIP! Truncating.');
    imagePaths = imagePaths.slice(0, 10);
  }
  console.log('Inside embedImagesCLIP, got N frames:', imagePaths.length);
  // For even more speed, consider offloading this loop to a worker thread.
  const embeddings = await Promise.all(
    imagePaths.map(async (imgPath) => {
      const output = await model(imgPath, { pooling: 'mean', normalize: true });
      return output.data;
    })
  );
  return embeddings;
}

// Embed a text query using CLIP
export async function embedTextCLIP(query: string): Promise<Float32Array> {
  // Use the feature-extraction pipeline for CLIP (base model, for text)
  if (!cachedTextPipeline) {
    cachedTextPipeline = await xenovaPipeline(
      'feature-extraction',
      'Xenova/clip-vit-base-patch16'
    );
  }
  const model = cachedTextPipeline;
  console.log('[embedTextCLIP] typeof query:', typeof query, '| query:', query);
  console.log('[embedTextCLIP] pipeline:', 'feature-extraction', '| model:', 'Xenova/clip-vit-base-patch16');
  const output = await model(query, { pooling: 'mean', normalize: true });
  return output.data;
} 