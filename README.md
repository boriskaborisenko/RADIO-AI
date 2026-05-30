# 📻 Suno AI M3U Playlist Generator & Express Server

This project is a lightweight, fast, and easy-to-use Node.js tool to collect public songs from **Suno.com** profiles and generate M3U playlists. 

The project is designed to:
1. **Compile a playlist** from all public tracks of any Suno user.
2. **Organize infinite repeating (loops)**.
3. **Host the playlist** via a built-in Express server, exposing it through a clean URL: `http://localhost:3333/radio` (ready to be tunneled via **ngrok**).
4. Act as a **standalone generator**, producing a static `radio` playlist file that can be uploaded to any static web hosting.

---

## 🛠️ Installation and Configuration

Ensure you have Node.js version **18.0.0** or higher installed.

1. Install dependencies in the root folder:
   ```bash
   npm install
   ```

2. Configure default settings in `config.js` (as needed):
   - `defaultUsernames`: A list of default Suno usernames in an array (e.g., `['kinkypanda', 'another_user']`).
   - `shuffle`: Enable or disable random track shuffling in the playlist (`true` or `false`).
   - `port`: The port of the Express server (`3333`).
   - `loopCount`: How many times the track list should repeat inside the playlist (used to simulate a continuous radio stream).
   - `sortBy`: Default sorting option for Suno API requests (`upvote_count` for likes, `created_at` for new uploads).

---

## 🚀 Modes of Operation

### Mode 1. Running the Express Server (Recommended)

This mode starts a server that streams the M3U playlist dynamically at `http://localhost:3333/radio`.

```bash
npm start
```

* **Autogeneration on Start**: If the `radio` playlist file is missing in the root directory, the server will automatically scrape and generate the playlist for the default users defined in `config.js`.
* **MIME-Type & CORS**: The server serves playlists with the correct headers (`Content-Type: audio/x-mpegurl`) and CORS enabled (`Access-Control-Allow-Origin: *`), making it fully compatible with all IPTV clients and web players.

#### 🔥 Dynamic Queries On-The-Fly!
You don't need to change configs or restart the server to listen to other authors. The server supports dynamic playlist generation via query parameters:
* Playlist of a single author: `http://localhost:3333/radio?username=USERNAME`
* Combining multiple accounts on the fly: `http://localhost:3333/radio?username=kinkypanda,another_user`
* Custom loop counts: `http://localhost:3333/radio?username=kinkypanda&loop=10`
* Toggling shuffling on the fly: `http://localhost:3333/radio?username=kinkypanda&shuffle=true` (or `false`)
* Sorting by release date: `http://localhost:3333/radio?username=kinkypanda&sort=created_at`

*All dynamic requests are cached in memory for 30 minutes (configurable via `cacheTTL`) to prevent rate-limiting from the Suno API.*

---

### Mode 2. Standalone Generator (Static M3U File)

If you don't want to keep a Node.js process running, you can run the generator standalone to write a static `radio` file, then upload it to any static file hosting (e.g., GitHub Pages, Netlify, Vercel, or traditional Nginx/Apache directory).

```bash
npm run generate
```

You can also pass arguments directly in the terminal:
```bash
# Format: node generator.js [usernames_comma_separated] [loop_count] [sorting] [shuffling_true_or_false]
node generator.js kinkypanda,another_user 10 created_at true
```

The generator will output a static `radio` file in the project root.

---

## 🔁 Infinite Loop Mechanics

M3U playlists are inherently static lists of links. Continuous streaming is achieved via several methods in this project:

1. **Server-Side Duplication (`loopCount`)**:
   In `config.js` or via `?loop=X` query params, you can multiply the tracks. If an author has 50 songs and `loopCount` is set to 10, the M3U will output 500 tracks sequentially, creating an immersive, long-lasting radio wave.
2. **Player-Side Looping**:
   Any modern IPTV client or media player (VLC, Televizo, OttPlayer, Kodi) has an option to "Repeat Playlist" or "Loop All". This is the cleanest way to loop the audio.
3. **M3U Metadata Headers**:
   The generator inserts player-compatible stream headers at the top of the M3U output:
   ```m3u
   #EXT-X-PLAYLIST-TYPE:EVENT
   #EXT-X-ALLOW-CACHE:YES
   ```
   These indicators signal to advanced players that the source should be treated as an ongoing live event.

---

## 🔌 Exposing the Stream to the World (ngrok)

If you are running the server locally and want to listen to your Suno radio on a smart TV, phone, or share it with friends:

1. Install [ngrok](https://ngrok.com/).
2. Forward port `3333`:
   ```bash
   ngrok http 3333
   ```
3. Copy the public address provided by ngrok (e.g., `https://a1b2-34-56-78.ngrok-free.app`).
4. Your M3U playlist is now globally accessible at:
   `https://a1b2-34-56-78.ngrok-free.app/radio`

Load this URL in any IPTV player (Televizo, OTT Navigator, Smart IPTV, VLC) to start listening!

---

## 💻 Web Station Player (Vite + React)

Inside the `frontend` directory is a minimalist, cyber-punk themed single-page web player built using **Vite + React**. It parses the M3U stream and provides an interactive jukebox UI.

### 🌟 Web Player Features:
1. **M3U Parsing on the Fly**: Fetches and parses the M3U stream from the backend server, queuing tracks for continuous gapless playback.
2. **Rotating Vinyl Animation**: The album artwork disc (`tvg-logo`) rotates gracefully when playing and pauses smoothly when on hold.
3. **Pulsing EQ Visualizer**: Animated soundbars bounce dynamically in sync with the audio state.
4. **Interactive Sidebar Playlist**: A gorgeous slide-out playlist panel supporting quick searches, tab filtering, and a separate top-genres filter.
5. **Stream Configuration**: Listeners can change the source M3U stream directly in the player's collapsible settings menu.

### ⚙️ Setting Up the Frontend:

1. Configure the default stream URL in `frontend/src/config.js` (it points to your default stream: `https://test-server.ngrok.dev/radio`).
2. Move into the frontend directory and install dependencies:
   ```bash
   cd frontend
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:3000` in your web browser.

### 📦 Production Build:
Generate optimized, static assets for deployment:
```bash
npm run build
```
Upload the compiled folder `frontend/dist` to Netlify, Vercel, GitHub Pages, or any FTP server.

---

## 🚀 Completed Improvements & Feature Roadmap

### ✅ Implemented Features (Completed):

1. **Smart Text Truncation**:
   - Track details, artist handles, and titles automatically truncate with ellipses (`text-overflow: ellipsis`) when overflowing, keeping the card design perfectly neat.

2. **Interactive Playlist Drawer (Right Sidebar)**:
   - A float button in the top-right reveals a slide-out drawer built with a glassmorphism style.
   - Houses two tabs—**All Tracks** and **Liked** (Favorites)—with independent scrolling lists.
   - Includes a dark translucent backdrop overlay that closes the sidebar on click.

3. **Playback Repeat (Repeat One)**:
   - Added a repeat button supporting looping for a single track. It glows with a neon purple indicator when active.

4. **Favorites System (Like/Unlike)**:
   - A heart-shaped like button with a red neon glow saves user selections in `localStorage`.
   - The favorites list persists across tab refreshes and features track deduplication.
   - Clicking on any liked song launches playback of its first queue reference seamlessly.

5. **Slide-Out Lyrics Sidebar (Left Drawer)**:
   - Replaced centered modals with a sleek left-side drawer panel with a wide `500px` layout (about 30% wider) matching the Right Sidebar's transitions and glassmorphism styling.
   - Displays parsed headers (e.g. `[Verse]`, `[Chorus]`) and body lyrics cleanly.

6. **Real-Time Lyrics Translation Subsystem**:
   - Fully operational translations to English and Russian.
   - Built a POST `/translate` endpoint on the Express backend (`server.js`) utilizing the Node `translatte` library (solving browser sandboxing/CORS issues).
   - The React frontend dynamically queries this route (extracting server details directly from `streamUrl`).
   - Integrated a translation toolbar at the top of the lyrics drawer featuring:
     - Target language dropdown menu (`en` and `ru`).
     - **Translate** action button showing an active loading state (`Translating...`) during the API request.
     - **Original** button to clear the translated cache.
     - Active glowing highlight colors on the buttons representing which state is currently active.
     - Instant CSS fade-in remount animation (`.animate-fade-in`) whenever lyrics toggle.
     - Auto-wipes translated cache on track changes to reset to original lyrics.

### 🔮 Future Roadmap:

*(All core targets, including lyrics metadata scraping, left-sliding sidebars, and automatic on-the-fly translations, have been fully and successfully implemented!)*
