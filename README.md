# Space Consultant AI Studio

Image -> video studio: multi-image slideshow with Zoom In / Zoom Out / Pan motion, transitions
between images, and AI voiceover that follows the script.

## Run on your PC (Windows)
1. Double-click `start-backend.bat` (first run creates the venv, installs packages, creates `.env`).
2. Double-click `start-frontend.bat`.
3. Open http://localhost:5173

FFmpeg: if it is not installed, the bundled FFmpeg (imageio-ffmpeg) is used automatically.

## Features
- Per-scene motion: Auto / Zoom In / Zoom Out / Pan Left / Pan Right / None (or apply one to all scenes)
- Transitions between images: Fade, Dissolve, Fade-through-black, Wipe, Slide, Circle open, Zoom, Radial, Random, or hard cut
- AI voiceover (Edge TTS): the video is stretched so the whole script is spoken; Hindi scripts auto-switch to a Hindi voice
- Single-image mode also supports Zoom In / Zoom Out / Pan and voiceover

## Deploy
- See DEPLOY_RENDER.md for the full Render + Netlify steps.
- Keep `backend/.env` private (it holds API keys). It is excluded from this zip; copy your own `.env` back into `backend/`.
