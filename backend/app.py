from flask import Flask, request, jsonify
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound
from flask_cors import CORS
import os
import subprocess
import glob

app = Flask(__name__)
CORS(app)

@app.route('/transcript', methods=['POST'])
def get_transcript():
    data = request.get_json()
    video_id = data.get('video_id')
    if not video_id:
        return jsonify({'error': 'Missing video_id'}), 400
    # 1. Try youtube-transcript-api
    try:
        transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=['en'])
        return jsonify({'transcript': transcript, 'source': 'youtube-transcript-api'})
    except Exception as e:
        yt_api_error = str(e)
    # 2. Fallback to yt-dlp
    try:
        video_url = f'https://www.youtube.com/watch?v={video_id}'
        output_path = f'/tmp/{video_id}.en.vtt'
        cmd = [
            'yt-dlp',
            '--write-auto-sub',
            '--sub-lang', 'en',
            '--skip-download',
            '-o', f'/tmp/{video_id}.%(ext)s',
            video_url
        ]
        subprocess.run(cmd, check=True)
        # Find the .vtt file
        vtt_files = glob.glob(f'/tmp/{video_id}*.vtt')
        if vtt_files:
            with open(vtt_files[0], 'r', encoding='utf-8') as f:
                vtt_content = f.read()
            # Optionally, parse VTT to JSON here
            return jsonify({'transcript_vtt': vtt_content, 'source': 'yt-dlp'})
        else:
            yt_dlp_error = 'No VTT file found after yt-dlp run.'
    except Exception as e:
        yt_dlp_error = str(e)
    # 3. Fallback: Ask user to upload transcript
    return jsonify({
        'error': 'Could not fetch transcript automatically.',
        'details': {
            'youtube_transcript_api': yt_api_error,
            'yt_dlp': yt_dlp_error if 'yt_dlp_error' in locals() else 'yt-dlp not attempted',
        },
        'upload_required': True
    }), 500

@app.route('/upload_transcript', methods=['POST'])
def upload_transcript():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    content = file.read().decode('utf-8')
    # Optionally, parse and validate the transcript here
    return jsonify({'transcript_uploaded': True, 'content': content})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5002))
    app.run(host='0.0.0.0', port=port) 