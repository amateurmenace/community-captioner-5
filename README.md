
# Community Captioner (v5.5)

**An Open Source AI Captioning Platform for Community Media**

Community Captioner is a live transcription tool designed for local government meetings, public access TV stations, and community organizations. It bridges the gap between expensive hardware encoders and accessible, accurate subtitles by leveraging modern AI.

## Key Features

### 🎙️ 1. Multi-Mode Resilience
The system is designed to work in any infrastructure environment:
*   **Balanced Mode**: Uses the browser's built-in Web Speech API. Zero cost, requires no API keys, and works immediately on standard devices.
*   **Local Mode (Privacy First)**: Connects to a local Whisper ASR server. Ensures no audio data leaves your network. Includes built-in connection testing.
*   **Cloud Mode**: Connects to the **Google Gemini Live API** for state-of-the-art accuracy, lower latency, and advanced reasoning capabilities. Includes API Key validation.

### 🧠 2. Context Engine (v2)
Standard speech-to-text models often fail on local proper nouns (e.g., "Brookline" becomes "Brooklyn", "Ms. Greene" becomes "Ms. Green").
*   **Knowledge Graph**: Users can define a custom dictionary of correction rules.
*   **AI Scraper Wizard**: The built-in tool uses Gemini to "read" municipal agendas and minutes to automatically build correction rules for local politicians and street names.
*   **Real-time Correction**: Corrections are applied instantly to the live stream, highlighted visually for the operator.

### 📺 3. Output Flexibility
*   **Browser Overlay**: A chroma-keyable (transparent background) window designed to be captured by OBS, vMix, or Wirecast.
*   **Visual Designer**: Operators can adjust font, size, position, alignment, and colors live during the broadcast using a drag-and-drop interface.
*   **Zero-Asset UI**: The interface uses pure SVG and CSS for all graphical elements, ensuring fast load times and no broken image links.

### 📊 4. Analytics & Summarization
*   **Session History**: Access logs of previous sessions.
*   **Simple Viewer**: Clean, searchable transcript logs for quick verification.
*   **Export**: Download transcripts in TXT, JSON, SRT, or VTT formats.

## Deployment Guide

### Option 1: Vercel (Recommended)
The easiest way to deploy Community Captioner is via Vercel.

1.  **Push to GitHub**: Ensure your code is in a GitHub repository.
2.  **Create Project**: Go to [vercel.com](https://vercel.com), click "Add New...", and select "Project".
3.  **Import**: Connect your GitHub account and select your repository.
4.  **Framework Preset**: Vercel should automatically detect `Vite`.
5.  **Deploy**: Click "Deploy".
    *   *Note*: Users will enter their own API Keys in the browser. You do **not** need to set Environment Variables in Vercel for the public version.

### Option 2: Netlify
1.  **Push to GitHub**.
2.  **New Site**: Log in to Netlify and click "Add new site" > "Import an existing project".
3.  **Settings**:
    *   **Build Command**: `npm run build`
    *   **Publish Directory**: `dist`
4.  **Deploy**: Click "Deploy site".

### Option 3: Docker (Self-Hosted)
To host on your own infrastructure (e.g., for use with a Local Whisper Server on the same network).

1.  **Build the Image**:
    ```bash
    docker build -t community-captioner .
    ```
2.  **Run the Container**:
    ```bash
    docker run -p 8080:80 community-captioner
    ```
    *(Note: You will need to create a `Dockerfile` that uses Nginx to serve the `dist` folder)*.

## Technical Setup

### Prerequisites
*   Node.js (v18+)
*   Modern Browser (Chrome/Edge recommended for Web Speech API support)
*   (Optional) Google Gemini API Key for Cloud features

### Installation
1.  **Start the dev server**:
    ```bash
    npm install
    npm run dev
    ```
2.  **Access the App**:
    *   Open `http://localhost:5173`
3.  **API Key Configuration**:
    *   For basic usage (Balanced/Local), no key is needed.
    *   For **Cloud Mode** or **Context Engine Wizard**, the app requires an API key in the environment variables.

## License
Open Source (CC BY-NC-SA 4.0)
Designed by Stephen Walter + AI for the weirdmachine.org community project.
