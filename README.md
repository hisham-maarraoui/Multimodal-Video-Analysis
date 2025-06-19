# Multimodal Video Analysis (with Google AI RAG)

This app lets you analyze any YouTube video with state-of-the-art AI:

- **Transcript extraction**
- **LLM-powered section breakdown**
- **Semantic chat with Retrieval-Augmented Generation (RAG)**
<<<<<<< HEAD
=======
- **Natural language video search** (not currently working properly)
>>>>>>> f4a8ee209e7d953b82e76260dd5dfc325e7fec38
- **Timestamp navigation**
- **All powered by Google AI**

## Features

- Enter a YouTube URL to fetch the transcript
- Get a smart, clickable section breakdown
- Chat with the video using RAG (context-aware answers, with timestamp citations)
- Clickable timestamps in both transcript and chat
- Modern, responsive UI

## Powered by

- Google AI (Generative and Embedding APIs)
- Pinecone (vector database for RAG)
- Redis (caching)
- Next.js, Tailwind CSS, React

## Setup

1. **Clone this repo**
2. **Install dependencies**
   ```bash
   npm install
   ```
3. **Set up environment variables in `.env.local`:**
   ```env
   GOOGLE_AI_API_KEY=your_google_ai_api_key
   PINECONE_API_KEY=your_pinecone_api_key
   PINECONE_INDEX=your_pinecone_index_name
   REDIS_URL=redis://localhost:6379 # or your Redis connection string
   ```
4. **Start the dev server**
   ```bash
   npm run dev
   ```
5. **Open [http://localhost:3000](http://localhost:3000)**

## Notes

- All code and environment variables use `GOOGLE_AI` (not Gemini).
- You need a Pinecone index (dimension 1024 for open-source embeddings).
- You need a Redis instance for caching (local or cloud).
- You need a Google AI API key (from Google AI Studio).

## License

MIT
