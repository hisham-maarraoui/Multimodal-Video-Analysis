const { execFile } = require('child_process');
// Use the absolute path to the Python script in the project root
const PYTHON_SCRIPT = '/Users/hishammaarraoui/Desktop/Multimodal Video Analysis/clip_embed.py';

function embedTextWithPython(text) {
    return new Promise((resolve, reject) => {
        execFile('python3', [PYTHON_SCRIPT, 'text', text], (error, stdout, stderr) => {
            if (error) return reject(stderr || error);
            try {
                resolve(JSON.parse(stdout));
            } catch (e) {
                reject('Failed to parse Python output: ' + stdout);
            }
        });
    });
}

function embedImageWithPython(imagePath) {
    return new Promise((resolve, reject) => {
        execFile('python3', [PYTHON_SCRIPT, 'image', imagePath], (error, stdout, stderr) => {
            if (error) return reject(stderr || error);
            try {
                resolve(JSON.parse(stdout));
            } catch (e) {
                reject('Failed to parse Python output: ' + stdout);
            }
        });
    });
}

module.exports = { embedTextWithPython, embedImageWithPython }; 