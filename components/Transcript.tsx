import { formatTimestamp } from '@/lib/utils';

interface TranscriptItem {
  start: number;
  text: string;
}

interface TranscriptProps {
  transcript: TranscriptItem[];
  onSeek: (time: number) => void;
}

function decodeHtml(html: string) {
  return html
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export default function Transcript({ transcript, onSeek }: TranscriptProps) {
  return (
    <div className="h-full flex flex-col bg-white/5 backdrop-blur-sm rounded-lg p-4">
      <h2 className="text-xl font-semibold mb-4">Transcript</h2>
      <div className="flex-1 overflow-y-auto">
        {transcript.length > 0 ? (
          <ul className="space-y-2">
            {transcript.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <button
                  className="text-blue-400 hover:underline font-mono text-sm min-w-fit"
                  onClick={() => onSeek(item.start)}
                  title={`Jump to ${formatTimestamp(item.start)}`}
                >
                  [{formatTimestamp(item.start)}]
                </button>
                <span className="text-neutral-100 text-sm">{decodeHtml(item.text)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-neutral-400">No transcript available.</div>
        )}
      </div>
    </div>
  );
} 