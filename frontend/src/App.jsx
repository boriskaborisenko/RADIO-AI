import React, { useState, useEffect, useRef } from 'react';
import { config } from './config.js';

// Parsers for M3U playlist files
const parseM3U = (text) => {
  const lines = text.split('\n');
  const tracks = [];
  let currentTrack = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      // Parse track duration
      const durationMatch = line.match(/#EXTINF:(-?\d+)/);
      const duration = durationMatch ? parseInt(durationMatch[1], 10) : -1;

      // Parse track artwork (tvg-logo)
      const tvgLogoMatch = line.match(/tvg-logo="([^"]+)"/);
      const logo = tvgLogoMatch ? tvgLogoMatch[1] : '';

      // Parse track tags/genres (group-title)
      const groupTitleMatch = line.match(/group-title="([^"]+)"/);
      const genre = groupTitleMatch ? groupTitleMatch[1] : 'AI';

      // Parse artist and song title from the rest of the line (after the comma)
      const commaIndex = line.indexOf(',');
      let artist = 'AI Artist';
      let title = 'Untitled';

      if (commaIndex !== -1) {
        const info = line.substring(commaIndex + 1);
        const dashIndex = info.indexOf(' - ');
        if (dashIndex !== -1) {
          artist = info.substring(0, dashIndex).trim();
          title = info.substring(dashIndex + 3).trim();
        } else {
          title = info.trim();
        }
      }

      currentTrack = { duration, logo, genre, artist, title };
    } else if (line.startsWith('http://') || line.startsWith('https://')) {
      if (currentTrack) {
        currentTrack.url = line;
        tracks.push(currentTrack);
        currentTrack = null;
      }
    }
  }

  return tracks;
};

export default function App() {
  const [streamUrl, setStreamUrl] = useState(config.streamUrl);
  const [urlInput, setUrlInput] = useState(config.streamUrl);
  const [playlist, setPlaylist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const [hasTunedIn, setHasTunedIn] = useState(false); // Mounts the player card
  const [isFadingOut, setIsFadingOut] = useState(false); // Controls full-screen splash fade-out animation
  
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('radio-volume');
    return saved !== null ? parseFloat(saved) : 0.5;
  });
  
  const [currentTime, setCurrentTime] = useState(0);
  const [trackDuration, setTrackDuration] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  const audioRef = useRef(null);

  // Fetch and parse the M3U playlist
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);
    setHasTunedIn(false);
    setIsFadingOut(false);

    console.log(`[App] Fetching playlist from: ${streamUrl}`);
    
    fetch(streamUrl)
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP Error: ${res.status}`);
        }
        return res.text();
      })
      .then(text => {
        const parsedTracks = parseM3U(text);
        if (isMounted) {
          if (parsedTracks.length === 0) {
            throw new Error('This stream does not contain any valid M3U entries.');
          }
          setPlaylist(parsedTracks);
          setCurrentTrackIndex(0);
          setLoading(false);
        }
      })
      .catch(err => {
        console.error('[App] Load failed:', err);
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [streamUrl]);

  // Audio Playback Controller
  useEffect(() => {
    if (!audioRef.current || !hasTunedIn) return;

    if (isPlaying) {
      audioRef.current.play().catch(err => {
        console.log('[Player] Playback was prevented by browser autoplay security. Awaiting user click.');
        setIsPlaying(false);
      });
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, currentTrackIndex, hasTunedIn]);

  // Volume Controller
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
    localStorage.setItem('radio-volume', volume);
  }, [volume]);

  const currentTrack = playlist[currentTrackIndex];

  // Player action handlers
  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleNext = () => {
    if (playlist.length === 0) return;
    setCurrentTrackIndex((currentTrackIndex + 1) % playlist.length);
  };

  const handlePrev = () => {
    if (playlist.length === 0) return;
    setCurrentTrackIndex((currentTrackIndex - 1 + playlist.length) % playlist.length);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setTrackDuration(audioRef.current.duration);
    }
  };

  const handleAudioEnded = () => {
    handleNext();
  };

  const handleProgressChange = (e) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  // Triggers autoplay and fades out the splash screen smoothly
  const handlePlay = () => {
    setIsFadingOut(true);
    // Trigger play immediately inside click handler to satisfy browser policy
    setIsPlaying(true);
    
    setTimeout(() => {
      setHasTunedIn(true);
    }, 450); // Matches the 0.5s fade-out duration
  };

  // Time Formatter helper (0:00)
  const formatTime = (seconds) => {
    if (isNaN(seconds) || seconds === -1) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // FULL SCREEN NEON SPLASH SCREEN / PRELOADER / PLAY! BUTTON
  if (!hasTunedIn) {
    return (
      <div 
        className={isFadingOut ? "animate-fade-out" : ""}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          width: '100vw',
          background: '#050507',
          color: '#fff',
          gap: '28px',
          padding: '20px',
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: 1000
        }}
      >
        {loading ? (
          <>
            {/* Animated glowing record player center during loading */}
            <div 
              className="animate-spin-slow neon-glow-purple"
              style={{
                width: '100px',
                height: '100px',
                borderRadius: '50%',
                background: 'repeating-radial-gradient(circle, #18181b, #09090b 2.5px, #18181b 5px)',
                border: '4px solid #27272a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 35px rgba(139, 92, 246, 0.4)'
              }}
            >
              <span style={{ fontSize: '36px' }}>📻</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', textAlign: 'center' }}>
              <h2 className="neon-text-green" style={{ fontSize: '24px', fontWeight: 'bold', letterSpacing: '3px' }}>AI RADIO</h2>
              <span className="neon-text-purple" style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
                Tuning into radio wave...
              </span>
            </div>
          </>
        ) : error ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', textAlign: 'center' }}>
            <h2 className="neon-text-green" style={{ fontSize: '24px', fontWeight: 'bold', letterSpacing: '3px' }}>AI RADIO</h2>
            <span style={{ fontSize: '13px', color: '#f87171', fontWeight: 'bold' }}>CONNECTION FAILED</span>
            <p style={{ fontSize: '11px', color: '#fca5a5', maxWidth: '300px', opacity: 0.8 }}>
              The stream at <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px' }}>{streamUrl}</code> is unreachable. Please verify your connection, server status or ngrok tunnel.
            </p>
            <button 
              onClick={() => setStreamUrl(config.streamUrl)}
              style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', padding: '8px 16px', color: '#fff', fontSize: '11px', cursor: 'pointer', marginTop: '8px', outline: 'none' }}
            >
              Try Again
            </button>
          </div>
        ) : (
          /* BIG FADING IN / GLOWING "PLAY!" BUTTON ONCE LOADED */
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <button
              onClick={handlePlay}
              className="btn-tune-in"
            >
              ▶️ PLAY!
            </button>
            <span className="neon-text-purple" style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '2px', opacity: 0.85 }}>
              Frequency Synced. Tap to Listen.
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', width: '100vw', padding: '20px', position: 'relative' }}>
      
      {/* Hidden Audio Player element */}
      {currentTrack && (
        <audio
          ref={audioRef}
          src={currentTrack.url}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleAudioEnded}
        />
      )}

      {/* FULL SCREEN DYNAMIC BLURRED BACKGROUND ARTWORK */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundImage: currentTrack?.logo ? `url(${currentTrack.logo})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        filter: 'blur(90px) saturate(2)',
        opacity: 0.25,
        zIndex: -1,
        transition: 'background-image 1.2s ease-in-out'
      }} />

      {/* MINIMALIST CARD (Background and Border made completely transparent/invisible!) */}
      <div 
        style={{ 
          background: 'transparent',
          border: 'none',
          boxShadow: 'none',
          padding: '20px', 
          width: '100%', 
          maxWidth: '450px', // Made significantly larger
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          textAlign: 'center', 
          gap: '28px', // Increased spacing
          position: 'relative'
        }}
      >
        
        {/* On Air Status Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', alignSelf: 'flex-start', background: 'rgba(0, 0, 0, 0.35)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '5px 12px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
          <span style={{ 
            width: '6px', 
            height: '6px', 
            borderRadius: '50%', 
            background: isPlaying ? 'var(--color-secondary)' : '#71717a',
            boxShadow: isPlaying ? '0 0 8px var(--color-secondary)' : 'none',
            display: 'inline-block'
          }} />
          <span style={{ color: isPlaying ? '#fff' : '#71717a' }}>ON AIR</span>
        </div>

        {/* Large Vinyl Disc Player (Made significantly larger: 280px) */}
        <div style={{ position: 'relative', width: '290px', height: '280px', display: 'flex', justifyContent: 'center' }}>
          {/* Vinyl record plate */}
          <div 
            className={`animate-spin-slow neon-glow-purple ${!isPlaying ? 'paused' : ''}`}
            style={{
              width: '280px',
              height: '280px',
              borderRadius: '50%',
              background: 'repeating-radial-gradient(circle, #18181b, #09090b 2px, #18181b 4px)',
              border: '9px solid #27272a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 15px 40px rgba(0,0,0,0.6)'
            }}
          >
            {/* Album Cover Art Center circle (Increased size: 110px) */}
            <div style={{
              width: '110px',
              height: '110px',
              borderRadius: '50%',
              overflow: 'hidden',
              border: '4px solid #09090b',
              background: '#18181b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {currentTrack && currentTrack.logo ? (
                <img src={currentTrack.logo} alt="Album Art" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: '38px' }}>🎵</span>
              )}
            </div>
          </div>
          
          {/* Record needle pin arm */}
          <div style={{
            position: 'absolute',
            top: '-15px',
            right: '20px',
            width: '70px',
            height: '95px',
            transformOrigin: 'top right',
            transform: isPlaying ? 'rotate(15deg)' : 'rotate(0deg)',
            transition: 'transform 0.5s ease-out',
            pointerEvents: 'none',
            zIndex: 10
          }}>
            <svg width="70" height="95" viewBox="0 0 60 80" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M50 5 L50 40 L20 60 L15 55" stroke="#a1a1aa" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="50" cy="5" r="5" fill="#e1e1e6" />
              <rect x="10" y="55" width="10" height="15" rx="2" fill="#71717a" transform="rotate(30 10 55)"/>
            </svg>
          </div>
        </div>

        {/* Current song details (Enlarged fonts) */}
        <div style={{ width: '100%', minHeight: '94px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {currentTrack ? (
            <>
              <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 5px' }}>
                {currentTrack.title}
              </h2>
              <p className="neon-text-purple" style={{ fontSize: '17px', fontWeight: '500' }}>
                {currentTrack.artist}
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '4px' }}>
                <span style={{ background: 'rgba(139, 92, 246, 0.12)', border: '1px solid rgba(139, 92, 246, 0.25)', borderRadius: '14px', padding: '3px 12px', fontSize: '12px', color: '#c084fc', maxWidth: '280px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {currentTrack.genre}
                </span>
              </div>
            </>
          ) : (
            <p style={{ color: '#71717a', fontSize: '16px' }}>Broadcast Empty</p>
          )}
        </div>

        {/* Pulsing visualizer eq bars */}
        <div className="eq-container" style={{ opacity: isPlaying ? 1 : 0.1, transition: 'opacity 0.3s', height: '32px' }}>
          <div className="eq-bar"></div>
          <div className="eq-bar"></div>
          <div className="eq-bar"></div>
          <div className="eq-bar"></div>
          <div className="eq-bar"></div>
          <div className="eq-bar"></div>
          <div className="eq-bar"></div>
          <div className="eq-bar"></div>
        </div>

        {/* Media position track progress bar */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <input
            type="range"
            min="0"
            max={trackDuration || 100}
            value={currentTime}
            onChange={handleProgressChange}
            disabled={playlist.length === 0}
            style={{
              width: '100%',
              accentColor: 'var(--color-secondary)',
              cursor: playlist.length === 0 ? 'not-allowed' : 'pointer'
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#71717a' }}>
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(trackDuration || currentTrack?.duration)}</span>
          </div>
        </div>

        {/* MEDIA PLAYER CONTROLS (Enlarged size: Next/Prev 50px, Play 72px) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>
          <button 
            className="btn-control" 
            onClick={handlePrev} 
            disabled={playlist.length === 0}
            style={{ width: '50px', height: '50px', cursor: playlist.length === 0 ? 'not-allowed' : 'pointer' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5"></line></svg>
          </button>
          
          <button 
            className="btn-control btn-control-active" 
            onClick={handlePlayPause} 
            style={{ width: '72px', height: '72px' }}
            disabled={playlist.length === 0}
          >
            {isPlaying ? (
              <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2"><rect x="5" y="4" width="4" height="16"></rect><rect x="15" y="4" width="4" height="16"></rect></svg>
            ) : (
              <svg width="24" height="26" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" style={{ marginLeft: '4px' }}><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            )}
          </button>
          
          <button 
            className="btn-control" 
            onClick={handleNext} 
            disabled={playlist.length === 0}
            style={{ width: '50px', height: '50px', cursor: playlist.length === 0 ? 'not-allowed' : 'pointer' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>
          </button>
        </div>

        {/* VOLUME CONTROL BAR */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '80%', marginTop: '6px' }}>
          <span style={{ fontSize: '15px', color: '#71717a' }}>
            {volume === 0 ? '🔇' : volume < 0.4 ? '🔈' : '🔊'}
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="slider"
          />
        </div>

        {/* COLLAPSIBLE STREAM SETTINGS FORM PANEL */}
        <div style={{
          width: '100%',
          maxHeight: showSettings ? '120px' : '0px',
          overflow: 'hidden',
          transition: 'max-height 0.3s ease-in-out',
          borderTop: showSettings ? '1px solid var(--color-border)' : 'none',
          paddingTop: showSettings ? '12px' : '0px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="M3U Stream URL"
            style={{ width: '100%', background: '#121214', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '6px 10px', color: '#fff', fontSize: '11px', outline: 'none' }}
          />
          <button
            onClick={() => { setStreamUrl(urlInput); setShowSettings(false); }}
            style={{ width: '100%', background: 'var(--color-primary)', border: 'none', borderRadius: '6px', padding: '6px', color: '#fff', fontSize: '11px', fontWeight: '500', cursor: 'pointer' }}
          >
            Update Stream
          </button>
        </div>

        {/* COG SETTINGS BTN AT CORNER */}
        <button
          onClick={() => setShowSettings(!showSettings)}
          style={{
            position: 'absolute',
            bottom: '12px',
            right: '12px',
            background: 'transparent',
            border: 'none',
            color: showSettings ? 'var(--color-primary)' : '#444',
            cursor: 'pointer',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color 0.2s',
            opacity: 0.5
          }}
          onMouseOver={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.opacity = 1; }}
          onMouseOut={(e) => { e.currentTarget.style.color = showSettings ? 'var(--color-primary)' : '#444'; e.currentTarget.style.opacity = 0.5; }}
        >
          ⚙️
        </button>

      </div>

    </div>
  );
}
