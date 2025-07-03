const fs = require('fs');

const data = JSON.parse(fs.readFileSync('/tmp/ted_data.json', 'utf8'));

// Let's explore the data structure to find the transcript
console.log('Exploring __NEXT_DATA__...');
console.log('props.pageProps keys:', Object.keys(data.props.pageProps));

// A good guess is that the data is in 'talkPage' or 'videoData' or something similar
// Let's try to log some of those
if (data.props.pageProps.talkPage) {
    console.log('talkPage keys:', Object.keys(data.props.pageProps.talkPage));
}

if (data.props.pageProps.videoData) {
    console.log('videoData keys:', Object.keys(data.props.pageProps.videoData));
}

// Let's try a deep search for the word 'transcript'
function findTranscript(obj, path = []) {
    for (const key in obj) {
        if (key.toLowerCase().includes('transcript')) {
            console.log(`Found a 'transcript' key at path: ${path.concat(key).join('.')}`);
        }
        if (typeof obj[key] === 'object' && obj[key] !== null) {
            findTranscript(obj[key], path.concat(key));
        }
    }
}

console.log('\\n--- Deep search for "transcript" ---');
findTranscript(data); 