import { formatTimestamp } from '@/lib/utils';

interface Section {
  start: number;
  title: string;
  summary: string;
}

interface SectionsProps {
  sections: Section[];
  onSeek: (time: number) => void;
}

export default function Sections({ sections, onSeek }: SectionsProps) {
  return (
    <div className="h-full flex flex-col bg-white/5 backdrop-blur-sm rounded-lg p-4">
      <h2 className="text-xl font-semibold mb-4">Sections</h2>
      <div className="flex-1 overflow-y-auto">
        {sections.length > 0 ? (
          <ul className="space-y-4">
            {sections.map((section, idx) => (
              <li key={idx}>
                <button
                  className="text-blue-400 hover:underline font-bold text-base"
                  onClick={() => onSeek(section.start)}
                  title={`Jump to ${formatTimestamp(section.start)}`}
                >
                  [{formatTimestamp(section.start)}] {section.title}
                </button>
                <div className="text-neutral-300 text-sm mt-1 ml-6">{section.summary}</div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-neutral-400">No sections available.</div>
        )}
      </div>
    </div>
  );
} 