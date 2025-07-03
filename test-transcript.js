// test-transcript.js
const TranscriptClient = require('youtube-transcript-api');

const client = new TranscriptClient();
const videoId = '-moW9jvvMr4'; // Replace with any YouTube video ID you want to test

client.fetchTranscript(videoId)
    .then(transcript => {
        console.log('Transcript:', transcript);
    })
    .catch(err => {
        console.error('Error:', err);
    }); 