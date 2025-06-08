// Formats seconds as mm:ss or h:mm:ss
export function formatTimestamp(seconds: number): string {
  const sec = Math.floor(seconds % 60);
  const min = Math.floor((seconds / 60) % 60);
  const hr = Math.floor(seconds / 3600);
  if (hr > 0) {
    return `${hr}:${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  } else {
    return `${min}:${sec.toString().padStart(2, '0')}`;
  }
}

// Alias for formatTimestamp (for components using formatTime)
export const formatTime = formatTimestamp; 