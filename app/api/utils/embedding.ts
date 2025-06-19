import { pipeline } from '@xenova/transformers';

let embedder: ((text: string, options: { pooling?: 'none' | 'mean' | 'cls'; normalize: boolean }) => Promise<any>) | null = null;

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!embedder) {
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  // The model returns [1, N, 384] for each text, but we want 1024 dims, so use a pooling/expansion method
  // For now, just flatten and pad/truncate to 1024 dims
  return Promise.all(
    texts.map(async (text) => {
      const output = await embedder!(text, { pooling: 'mean', normalize: true });
      let arr = Array.from(output.data as Float32Array | number[]);
      if (arr.length > 1024) arr = arr.slice(0, 1024);
      if (arr.length < 1024) arr = arr.concat(Array(1024 - arr.length).fill(0));
      return arr;
    })
  );
} 