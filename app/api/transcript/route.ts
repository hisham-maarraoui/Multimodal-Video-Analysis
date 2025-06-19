import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import vttToJson from 'vtt-to-json';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { TranscriptCue } from '@/lib/types';

const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;
const GEMINI_MODELS = [
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-2.0-flash-exp',
];

async function tryGeminiModels(prompt: string) {
  if (!GOOGLE_AI_API_KEY) throw new Error('Missing Google AI API key');
  for (const modelName of GEMINI_MODELS) {
    try {
      const genAI = new GoogleGenerativeAI(GOOGLE_AI_API_KEY);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      return result;
    } catch (err: any) {
      if (err?.status === 429 || err?.status === 403 || err?.status === 404) {
        continue;
      } else {
        throw err;
      }
    }
  }
  throw new Error('All Gemini models failed due to rate limiting or errors.');
}

// You can use a package like 'youtube-transcript' or call an external API here.
// For demo, we'll return a static transcript.

// Helper to decode basic HTML entities
function decodeHtml(html: string) {
  return html
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// Helper to extract video ID from YouTube URL
function getYouTubeId(url: string): string | null {
  const match = url.match(/(?:v=|youtu.be\/)([\w-]{11})/);
  return match ? match[1] : null;
}

// Helper: remove near-duplicates, rolling/overlapping cues, and stop phrases
function smartDedup(transcript: TranscriptCue[]) {
  // No stop phrase filtering; keep all greetings/blessings
  const deduped: TranscriptCue[] = [];
  for (let i = 0; i < transcript.length; i++) {
    const text = transcript[i].text.trim();
    const textLower = text.toLowerCase();
    if (deduped.length === 0) {
      deduped.push(transcript[i]);
      continue;
    }
    // Only compare to immediately previous cue
    const prev = deduped[deduped.length - 1].text.trim();
    const prevLower = prev.toLowerCase();
    // Remove if strict substring (rolling artifact)
    if (prevLower.includes(textLower) || textLower.includes(prevLower)) continue;
    // Remove if high word overlap (>80%) with previous cue (rolling artifact)
    const prevWords = new Set(prevLower.split(/\s+/));
    const textWords = new Set(textLower.split(/\s+/));
    const overlap = [...textWords].filter(w => prevWords.has(w)).length;
    const overlapRatio = overlap / Math.max(textWords.size, 1);
    if (overlapRatio > 0.8) continue;
    deduped.push(transcript[i]);
  }
  // Log first 10 cues before and after deduplication
  console.log('First 10 cues before deduplication:', transcript.slice(0, 10));
  console.log('First 5 deduped cues:', deduped.slice(0, 5));
  return deduped;
}

export async function POST(req: NextRequest) {
  const { url, llm } = await req.json();
  const useLLM = llm === true || llm === 'true';
  const videoId = getYouTubeId(url);
  if (!videoId) {
    return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
  }
  try {
    // 1. Use yt-dlp to list all available subtitles
    let subLang = 'en';
    let foundEnglish = false;
    let ytDlpListStdout = '';
    try {
      ytDlpListStdout = await new Promise((resolve, reject) => {
        execFile('yt-dlp', [
          '--list-subs',
          url
        ], (error, stdout, stderr) => {
          if (error) {
            resolve(stdout + stderr); // still resolve, just log
          } else {
            resolve(stdout);
          }
        });
      });
      // Try to find the best English subtitle code
      const lines = ytDlpListStdout.split('\n');
      for (const line of lines) {
        if (/en(\W|$)/.test(line) && /auto-generated|English/i.test(line)) {
          foundEnglish = true;
          const match = line.match(/\ben[\w-]*\b/);
          if (match) {
            subLang = match[0];
            break;
          }
        }
      }
    } catch {}
    // 2. Use yt-dlp to fetch captions in VTT only (try best English, fallback to all)
    let ytDlpStdout = '', ytDlpStderr = '';
    let vttStat = null;
    let cues, vttData = null;
    let vttPath = path.join('/tmp', `${videoId}.${subLang}.vtt`);
    try {
      await new Promise((resolve, reject) => {
        execFile('yt-dlp', [
          '--write-auto-sub',
          '--sub-lang', subLang,
          '--skip-download',
          '-o', `/tmp/${videoId}.%(lang)s.%(ext)s`,
          url
        ], (error, stdout, stderr) => {
          ytDlpStdout = stdout;
          ytDlpStderr = stderr;
          if (error) {
            resolve(stdout + stderr); // still resolve, just log
          } else {
            resolve(stdout);
          }
        });
      });
      vttStat = await fs.stat(vttPath).catch(() => null);
      vttData = await fs.readFile(vttPath, 'utf-8').catch(() => null);
      cues = await vttToJson(vttPath);
      // If no cues, use custom regex-based parser
      if (!cues || cues.length === 0) {
        if (vttData) {
          const fallbackCues: TranscriptCue[] = [];
          const cueRegex = /(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})[^\n]*\n([\s\S]*?)(?=\n\d{2}:\d{2}:\d{2}\.\d{3}|$)/g;
          function timeToSeconds(t: string) {
            const [h, m, s] = t.split(':');
            return parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s);
          }
          let match;
          while ((match = cueRegex.exec(vttData)) !== null) {
            const start = timeToSeconds(match[1]);
            const end = timeToSeconds(match[2]);
            let text = match[3].replace(/<[^>]+>/g, '').replace(/\n/g, ' ').trim();
            if (text) {
              fallbackCues.push({ start, end, text });
            }
          }
          cues = fallbackCues;
        }
      }
      if (!cues || cues.length === 0) {
        // Fallback: try downloading all available subtitles and pick English
        await new Promise((resolve, reject) => {
          execFile('yt-dlp', [
            '--write-auto-sub',
            '--sub-lang', '*',
            '--skip-download',
            '-o', `/tmp/${videoId}.%(lang)s.%(ext)s`,
            url
          ], (error, stdout, stderr) => {
            ytDlpStdout = stdout;
            ytDlpStderr = stderr;
            resolve(stdout + stderr);
          });
        });
        // Try to find any English VTT file
        const files = await fs.readdir('/tmp');
        let enVtt = files.find(f => f.startsWith(`${videoId}.en-US`) && f.endsWith('.vtt')) ||
                    files.find(f => f.startsWith(`${videoId}.en`) && f.endsWith('.vtt')) ||
                    files.find(f => f.startsWith(`${videoId}.`) && f.endsWith('.vtt'));
        if (enVtt) {
          vttPath = path.join('/tmp', enVtt);
          vttStat = await fs.stat(vttPath).catch(() => null);
          vttData = await fs.readFile(vttPath, 'utf-8').catch(() => null);
          cues = await vttToJson(vttPath);
          if (!cues || cues.length === 0) {
            if (vttData) {
              const fallbackCues: TranscriptCue[] = [];
              const cueRegex = /(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})[^\n]*\n([\s\S]*?)(?=\n\d{2}:\d{2}:\d{2}\.\d{3}|$)/g;
              function timeToSeconds(t: string) {
                const [h, m, s] = t.split(':');
                return parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s);
              }
              let match;
              while ((match = cueRegex.exec(vttData)) !== null) {
                const start = timeToSeconds(match[1]);
                const end = timeToSeconds(match[2]);
                let text = match[3].replace(/<[^>]+>/g, '').replace(/\n/g, ' ').trim();
                if (text) {
                  fallbackCues.push({ start, end, text });
                }
              }
              cues = fallbackCues;
            }
          }
        }
      }
      if (!cues || cues.length === 0) {
        return NextResponse.json({ error: 'No cues extracted from VTT', vttData, vttStat, ytDlpStdout, ytDlpStderr, ytDlpListStdout }, { status: 500 });
      }
      await fs.unlink(vttPath).catch(() => {});
    } catch (err) {
      return NextResponse.json({ error: 'Failed to fetch or parse VTT', details: String(err), ytDlpStdout, ytDlpStderr, ytDlpListStdout }, { status: 500 });
    }
    // 2. If not using LLM, return deduped cues directly
    if (!useLLM) {
      // Smarter deduplication: remove consecutive and near-duplicate lines, and stop phrases
      const deduped = smartDedup(cues);
      return NextResponse.json({ transcript: deduped, note: 'Smart deduped transcript', cues });
    }
    // 3. Chunk cues for LLM (batches of 100)
    const batchSize = 100;
    const batches = [];
    for (let i = 0; i < cues.length; i += batchSize) {
      batches.push(cues.slice(i, i + batchSize));
    }
    let allCleaned: TranscriptCue[] = [];
    for (const batch of batches) {
      const compactCues = batch.map((cue: TranscriptCue) => ({
        start: cue.start,
        end: cue.end,
        text: cue.partials ? cue.partials.join(' ') : cue.text,
      }));
      const prompt = `You are an expert at cleaning up YouTube video transcripts. Given the following list of caption cues (with start/end times in seconds), merge them into readable, non-redundant sentences. Remove all rolling/overlapping artifacts and any repeated or near-duplicate lines, but preserve real repetitions that are spaced apart. Return a JSON array of objects with start, end, and cleaned text. Do not include any explanation or extra text, only valid JSON.\n\nCues:\n${JSON.stringify(compactCues)}\n\nOutput:`;
      let result;
      try {
        result = await tryGeminiModels(prompt);
      } catch (err) {
        return NextResponse.json({ error: 'Gemini transcript cleanup failed', details: String(err), prompt, cues: compactCues }, { status: 500 });
      }
      let text = result.response.text().trim();
      if (text.startsWith('```')) {
        text = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
      }
      try {
        let cleaned = JSON.parse(text);
        // Final consecutive deduplication within batch
        cleaned = cleaned.filter((item: TranscriptCue, idx: number, arr: TranscriptCue[]) => idx === 0 || item.text !== arr[idx - 1].text);
        allCleaned = allCleaned.concat(cleaned);
      } catch (err) {
        return NextResponse.json({ error: 'Failed to parse Gemini response as JSON', raw: text, prompt, cues: compactCues, details: String(err) }, { status: 500 });
      }
    }
    // Final deduplication across all batches
    allCleaned = allCleaned.filter((item: TranscriptCue, idx: number, arr: TranscriptCue[]) => idx === 0 || item.text !== arr[idx - 1].text);
    return NextResponse.json({ transcript: allCleaned, note: 'LLM-cleaned transcript (chunked)', cues });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch or parse VTT', details: String(err) }, { status: 500 });
  }
} 