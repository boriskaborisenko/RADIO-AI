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

      // Parse track ID (suno-id)
      const sunoIdMatch = line.match(/suno-id="([^"]+)"/);
      const id = sunoIdMatch ? sunoIdMatch[1] : '';

      // Parse track lyrics (words)
      const wordsMatch = line.match(/words="([^"]*)"/);
      const words = wordsMatch ? wordsMatch[1] : '';

      // Parse track video (video-cover-url)
      const videoUrlMatch = line.match(/video-cover-url="([^"]*)"/);
      const videoUrl = videoUrlMatch ? videoUrlMatch[1] : '';

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

      currentTrack = { duration, logo, genre, artist, title, id, words, videoUrl };
    } else if (line.startsWith('http://') || line.startsWith('https://')) {
      if (currentTrack) {
        currentTrack.url = line;
        tracks.push(currentTrack);
        currentTrack = null;
      }
    }
  }

  // Deduplicate tracks by unique URL to prevent layout clutter in the UI
  const uniqueTracks = [];
  const seenUrls = new Set();
  for (const track of tracks) {
    if (!seenUrls.has(track.url)) {
      uniqueTracks.push(track);
      seenUrls.add(track.url);
    }
  }

  return uniqueTracks;
};

export default function App() {
  const [streamUrl, setStreamUrl] = useState(() => {
    const defaultUrl = config.streamUrl;
    if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      if (defaultUrl.includes('localhost') || defaultUrl.includes('127.0.0.1') || defaultUrl.includes('ngrok-free.app') || defaultUrl.includes('ngrok.dev')) {
        return `${window.location.origin}/radio`;
      }
    }
    return defaultUrl;
  });
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
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRepeatOne, setIsRepeatOne] = useState(false);
  const [isLyricsOpen, setIsLyricsOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('ru');
  const [translatedWords, setTranslatedWords] = useState(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [likedTrackUrls, setLikedTrackUrls] = useState(() => {
    try {
      const saved = localStorage.getItem('radio-liked-tracks');
      return saved ? JSON.parse(saved) : [];
    } catch (err) {
      console.error('[App] Failed to load liked tracks:', err);
      return [];
    }
  });
  const [shareStatus, setShareStatus] = useState('');

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

  // Reset translation when track changes
  useEffect(() => {
    setTranslatedWords(null);
  }, [currentTrackIndex]);

  const handleTranslate = async () => {
    if (!currentTrack || !currentTrack.words) return;
    
    setIsTranslating(true);
    
    try {
      const baseUrl = streamUrl.replace(/\/radio$/, '');
      const response = await fetch(`${baseUrl}/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: currentTrack.words,
          to: selectedLanguage
        })
      });
      
      const data = await response.json();
      if (response.ok && data.text) {
        setTranslatedWords(data.text);
      } else {
        alert(data.error || 'Translation failed.');
      }
    } catch (err) {
      console.error('[Translation Error]', err);
      alert('Translation failed: ' + err.message);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleShareSong = () => {
    if (!currentTrack || !currentTrack.id) return;
    
    const shareUrl = `https://suno.com/song/${currentTrack.id}`;
    navigator.clipboard.writeText(shareUrl)
      .then(() => {
        setShareStatus('Copied!');
        setTimeout(() => setShareStatus(''), 2000);
      })
      .catch((err) => {
        console.error('[Share] Failed to copy link:', err);
      });
  };

  const currentTrack = playlist[currentTrackIndex];
  const likedTracks = playlist.filter(track => likedTrackUrls.includes(track.url));
  const percentage = trackDuration && !isNaN(trackDuration) ? (currentTime / trackDuration) * 100 : 0;
  const volumePercentage = volume * 100;

  // Filter playlist based on search query
  const filteredPlaylist = playlist
    .map((track, index) => ({ ...track, originalIndex: index }))
    .filter(track => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        track.title.toLowerCase().includes(query) ||
        track.artist.toLowerCase().includes(query)
      );
    });

  const filteredLikedTracks = likedTracks
    .map(track => {
      const originalIndex = playlist.findIndex(t => t.url === track.url);
      return { ...track, originalIndex };
    })
    .filter(track => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        track.title.toLowerCase().includes(query) ||
        track.artist.toLowerCase().includes(query)
      );
    });

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

  const toggleLike = (trackUrl) => {
    setLikedTrackUrls(prev => {
      const isLiked = prev.includes(trackUrl);
      const updated = isLiked 
        ? prev.filter(url => url !== trackUrl)
        : [...prev, trackUrl];
      localStorage.setItem('radio-liked-tracks', JSON.stringify(updated));
      return updated;
    });
  };

  const handleAudioEnded = () => {
    if (isRepeatOne) {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(err => console.error('[Player] Loop replay error:', err));
      }
    } else {
      handleNext();
    }
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
              <span className="material-symbols-outlined" style={{ fontSize: '42px', color: '#a78bfa' }}>radio</span>
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
              style={{ gap: '8px' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '28px' }}>play_arrow</span> PLAY!
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

      {/* FULL SCREEN DYNAMIC BACKGROUND (VIDEO OR BLURRED ARTWORK) */}
      {currentTrack?.videoUrl ? (
        <video
          key={currentTrack.videoUrl}
          src={currentTrack.videoUrl}
          autoPlay
          loop
          muted
          playsInline
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            objectFit: 'cover',
            filter: 'blur(90px) saturate(2)',
            opacity: 0.25,
            zIndex: -1
          }}
        />
      ) : (
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
      )}

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

        {/* Album Artwork Cover (Square with rounded corners) */}
        <div style={{ position: 'relative', width: '280px', height: '280px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div 
            style={{
              width: '280px',
              height: '280px',
              borderRadius: '16px',
              overflow: 'hidden',
              background: '#18181b',
              border: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 15px 40px rgba(0,0,0,0.6), 0 0 20px var(--color-primary-glow)'
            }}
          >
            {currentTrack && currentTrack.videoUrl ? (
              <video
                key={currentTrack.videoUrl}
                src={currentTrack.videoUrl}
                autoPlay
                loop
                muted
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : currentTrack && currentTrack.logo ? (
              <img src={currentTrack.logo} alt="Album Art" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span className="material-symbols-outlined" style={{ fontSize: '72px', color: '#71717a' }}>music_note</span>
            )}
          </div>
        </div>

        {/* Current song details (Enlarged fonts) */}
        <div style={{ width: '100%', minHeight: '64px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {currentTrack ? (
            <>
              <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 5px' }}>
                {currentTrack.title}
              </h2>
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '4px' }}>
                <span style={{ background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '14px', padding: '3px 12px', fontSize: '12px', color: '#e4e4e7', maxWidth: '280px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {currentTrack.genre}
                </span>
              </div>
            </>
          ) : (
            <p style={{ color: '#71717a', fontSize: '16px' }}>Broadcast Empty</p>
          )}
        </div>

        {/* Pulsing visualizer eq bars */}
        <div className="eq-container" style={{ opacity: isPlaying ? 1 : 0.1, transition: 'opacity 0.3s', height: '32px', gap: '4px' }}>
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} className={`eq-bar ${!isPlaying ? 'paused' : ''}`} />
          ))}
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
            className="progress-bar-flat"
            style={{
              width: '100%',
              cursor: playlist.length === 0 ? 'not-allowed' : 'pointer',
              background: `linear-gradient(to right, #fff 0%, #fff ${percentage}%, rgba(255, 255, 255, 0.1) ${percentage}%, rgba(255, 255, 255, 0.1) 100%)`
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#71717a' }}>
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(trackDuration || currentTrack?.duration)}</span>
          </div>
        </div>

        {/* MEDIA PLAYER CONTROLS (Enlarged size: Next/Prev 50px, Play 72px) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Repeat One Button */}
          <button
            className={`btn-control ${isRepeatOne ? 'btn-control-active' : ''}`}
            onClick={() => setIsRepeatOne(!isRepeatOne)}
            disabled={playlist.length === 0}
            style={{ 
              width: '44px', 
              height: '44px', 
              cursor: playlist.length === 0 ? 'not-allowed' : 'pointer',
              color: isRepeatOne ? '#fff' : '#71717a'
            }}
            title="Repeat One"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'relative' }}>
              <polyline points="17 1 21 5 17 9"></polyline>
              <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
              <polyline points="7 23 3 19 7 15"></polyline>
              <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
              <text x="12" y="14" fontSize="8" fontWeight="bold" fill="currentColor" textAnchor="middle" style={{ fontStyle: 'normal' }}>1</text>
            </svg>
          </button>

          <button 
            className="btn-control" 
            onClick={handlePrev} 
            disabled={playlist.length === 0}
            style={{ width: '50px', height: '50px', cursor: playlist.length === 0 ? 'not-allowed' : 'pointer' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5"></line></svg>
          </button>
          
          <button 
            className="btn-control btn-play" 
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

          {/* Like Button */}
          {currentTrack ? (
            <button
              className={`btn-control ${likedTrackUrls.includes(currentTrack.url) ? 'neon-text-red' : ''}`}
              onClick={() => toggleLike(currentTrack.url)}
              style={{ 
                width: '44px', 
                height: '44px', 
                cursor: 'pointer',
                color: likedTrackUrls.includes(currentTrack.url) ? '#ef4444' : '#71717a',
                boxShadow: likedTrackUrls.includes(currentTrack.url) ? '0 0 10px rgba(239, 68, 68, 0.3)' : 'none'
              }}
              title={likedTrackUrls.includes(currentTrack.url) ? "Unlike" : "Like"}
            >
              <svg 
                width="18" 
                height="18" 
                viewBox="0 0 24 24" 
                fill={likedTrackUrls.includes(currentTrack.url) ? "currentColor" : "none"} 
                stroke="currentColor" 
                strokeWidth="2.5" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
              </svg>
            </button>
          ) : (
            <button
              className="btn-control"
              disabled
              style={{ width: '44px', height: '44px', cursor: 'not-allowed', color: '#3f3f46' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
              </svg>
            </button>
          )}
        </div>

        {/* LYRICS BUTTON */}
        <button
          disabled={!currentTrack?.words}
          onClick={() => setIsLyricsOpen(true)}
          style={{
            background: currentTrack?.words ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.02)',
            border: '1px solid ' + (currentTrack?.words ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.05)'),
            borderRadius: '20px',
            padding: '8px 24px',
            color: currentTrack?.words ? '#fff' : '#4b5563',
            fontSize: '13px',
            fontWeight: 'bold',
            cursor: currentTrack?.words ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s',
            boxShadow: currentTrack?.words ? '0 0 12px rgba(255, 255, 255, 0.1)' : 'none',
            letterSpacing: '1.5px',
            marginTop: '4px',
            outline: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            marginLeft: 'auto',
            marginRight: 'auto'
          }}
          onMouseOver={(e) => {
            if (currentTrack?.words) {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.boxShadow = '0 0 20px rgba(255, 255, 255, 0.15)';
            }
          }}
          onMouseOut={(e) => {
            if (currentTrack?.words) {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.boxShadow = 'none';
            }
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>mic</span> LYRICS
        </button>

        {/* VOLUME CONTROL BAR */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '80%', marginTop: '6px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '20px', color: '#71717a' }}>
            {volume === 0 ? 'volume_off' : volume < 0.4 ? 'volume_down' : 'volume_up'}
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="slider"
            style={{
              background: `linear-gradient(to right, rgba(255, 255, 255, 0.7) 0%, rgba(255, 255, 255, 0.7) ${volumePercentage}%, rgba(255, 255, 255, 0.2) ${volumePercentage}%, rgba(255, 255, 255, 0.2) 100%)`
            }}
          />
        </div>

        {/* SHARE SONG BUTTON */}
        <button
          disabled={!currentTrack?.id}
          onClick={handleShareSong}
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '20px',
            padding: '8px 24px',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 'bold',
            cursor: currentTrack?.id ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s',
            letterSpacing: '1.5px',
            marginTop: '8px',
            outline: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            marginLeft: 'auto',
            marginRight: 'auto',
            opacity: currentTrack?.id ? 1 : 0.5,
          }}
          onMouseOver={(e) => {
            if (currentTrack?.id) {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.18)';
              e.currentTarget.style.boxShadow = '0 0 15px rgba(255, 255, 255, 0.1)';
            }
          }}
          onMouseOut={(e) => {
            if (currentTrack?.id) {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.boxShadow = 'none';
            }
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
            {shareStatus ? 'check' : 'share'}
          </span> 
          {shareStatus ? 'COPIED!' : 'SHARE SONG'}
        </button>


      </div>

      {/* Playlist Toggle Button */}
      {hasTunedIn && (
        <button 
          className="btn-control" 
          onClick={() => setIsPlaylistOpen(true)}
          style={{ 
            position: 'fixed', 
            top: '24px', 
            right: '24px', 
            width: '48px', 
            height: '48px',
            zIndex: 100
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6"></line>
            <line x1="8" y1="12" x2="21" y2="12"></line>
            <line x1="8" y1="18" x2="21" y2="18"></line>
            <line x1="3" y1="6" x2="3.01" y2="6"></line>
            <line x1="3" y1="12" x2="3.01" y2="12"></line>
            <line x1="3" y1="18" x2="3.01" y2="18"></line>
          </svg>
        </button>
      )}

      {/* Backdrop overlay */}
      {isPlaylistOpen && (
        <div 
          onClick={() => setIsPlaylistOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            zIndex: 1050,
            cursor: 'pointer',
            transition: 'opacity 0.3s ease-in-out'
          }}
        />
      )}

      {/* Slide-out Sidebar Drawer */}
      <div 
        className="glass-panel"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          height: '100vh',
          width: '380px',
          maxWidth: '100vw',
          zIndex: 1100,
          display: 'flex',
          flexDirection: 'column',
          padding: '24px',
          boxShadow: '-10px 0 30px rgba(0, 0, 0, 0.5)',
          transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          transform: isPlaylistOpen ? 'translateX(0)' : 'translateX(100%)'
        }}
      >
        {/* Drawer Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: '#fff', letterSpacing: '1px' }}>Playlist</h3>
          <button 
            className="btn-control" 
            onClick={() => setIsPlaylistOpen(false)}
            style={{ width: '36px', height: '36px' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Search Input */}
        <div style={{ position: 'relative', marginBottom: '16px' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tracks..."
            style={{
              width: '100%',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--color-border)',
              borderRadius: '20px',
              padding: '10px 16px 10px 38px',
              color: '#fff',
              fontSize: '14px',
              outline: 'none',
              transition: 'all 0.2s',
            }}
            onFocus={(e) => {
              e.target.style.border = '1px solid var(--color-primary)';
              e.target.style.background = 'rgba(255, 255, 255, 0.08)';
            }}
            onBlur={(e) => {
              e.target.style.border = '1px solid var(--color-border)';
              e.target.style.background = 'rgba(255, 255, 255, 0.05)';
            }}
          />
          <span className="material-symbols-outlined" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '18px', opacity: 0.5, pointerEvents: 'none' }}>
            search
          </span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: '#71717a',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px',
                outline: 'none'
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
            </button>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button 
            onClick={() => setActiveTab('all')}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '20px',
              background: activeTab === 'all' ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.05)',
              color: activeTab === 'all' ? '#050507' : '#a1a1aa',
              border: '1px solid ' + (activeTab === 'all' ? 'var(--color-primary)' : 'var(--color-border)'),
              fontSize: '13px',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: activeTab === 'all' ? '0 0 10px var(--color-primary-glow)' : 'none'
            }}
          >
            All Tracks
          </button>
          <button 
            onClick={() => setActiveTab('liked')}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '20px',
              background: activeTab === 'liked' ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.05)',
              color: activeTab === 'liked' ? '#050507' : '#a1a1aa',
              border: '1px solid ' + (activeTab === 'liked' ? 'var(--color-primary)' : 'var(--color-border)'),
              fontSize: '13px',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: activeTab === 'liked' ? '0 0 10px var(--color-primary-glow)' : 'none'
            }}
          >
            Liked
          </button>
        </div>

        {/* Scrollable Container */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
          {activeTab === 'all' ? (
            filteredPlaylist.length > 0 ? (
              filteredPlaylist.map((track) => {
                const isCurrent = track.originalIndex === currentTrackIndex;
                const isLiked = likedTrackUrls.includes(track.url);
                return (
                  <div
                    key={track.originalIndex}
                    onClick={() => {
                      setCurrentTrackIndex(track.originalIndex);
                      setIsPlaying(true);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '8px 12px',
                      borderRadius: '10px',
                      background: isCurrent ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid ' + (isCurrent ? 'rgba(255, 255, 255, 0.15)' : 'transparent'),
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      textAlign: 'left'
                    }}
                    onMouseOver={(e) => {
                      if (!isCurrent) {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (!isCurrent) {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                      }
                    }}
                  >
                    {/* Thumbnail */}
                    <div style={{ width: '40px', height: '40px', borderRadius: '6px', overflow: 'hidden', background: '#18181b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {track.logo ? (
                        <img src={track.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span className="material-symbols-outlined" style={{ fontSize: '20px', color: '#71717a' }}>music_note</span>
                      )}
                    </div>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 'bold', color: isCurrent ? '#ffffff' : '#a1a1aa', textShadow: isCurrent ? '0 0 10px rgba(255, 255, 255, 0.3)' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                          {track.title}
                        </span>
                        {isLiked && (
                          <span className="material-symbols-outlined material-symbols-filled" style={{ color: '#ef4444', fontSize: '14px', flexShrink: 0 }} title="Liked">favorite</span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: isCurrent ? '#e4e4e7' : '#71717a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {track.artist}
                      </div>
                    </div>
                    {/* Status/Duration */}
                    {isCurrent && isPlaying ? (
                      <span className="material-symbols-outlined" style={{ color: '#ffffff', fontSize: '18px' }}>volume_up</span>
                    ) : (
                      <span style={{ fontSize: '11px', color: '#71717a' }}>
                        {formatTime(track.duration)}
                      </span>
                    )}
                  </div>
                );
              })
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px', color: '#71717a', padding: '40px 0' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '36px', color: '#71717a' }}>search</span>
                <span style={{ fontSize: '14px', fontWeight: 'bold' }}>No tracks found</span>
                <span style={{ fontSize: '12px', textAlign: 'center', opacity: 0.8 }}>Try searching for a different name.</span>
              </div>
            )
          ) : filteredLikedTracks.length > 0 ? (
            filteredLikedTracks.map((track) => {
              const isCurrent = track.originalIndex === currentTrackIndex;
              return (
                <div
                  key={track.url}
                  onClick={() => {
                    setCurrentTrackIndex(track.originalIndex);
                    setIsPlaying(true);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    background: isCurrent ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid ' + (isCurrent ? 'rgba(255, 255, 255, 0.15)' : 'transparent'),
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textAlign: 'left'
                  }}
                  onMouseOver={(e) => {
                    if (!isCurrent) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                    }
                  }}
                  onMouseOut={(e) => {
                    if (!isCurrent) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                    }
                  }}
                >
                  {/* Thumbnail */}
                  <div style={{ width: '40px', height: '40px', borderRadius: '6px', overflow: 'hidden', background: '#18181b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {track.logo ? (
                      <img src={track.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span className="material-symbols-outlined" style={{ fontSize: '20px', color: '#71717a' }}>music_note</span>
                    )}
                  </div>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 'bold', color: isCurrent ? '#ffffff' : '#a1a1aa', textShadow: isCurrent ? '0 0 10px rgba(255, 255, 255, 0.3)' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                        {track.title}
                      </span>
                      <span className="material-symbols-outlined material-symbols-filled" style={{ color: '#ef4444', fontSize: '14px', flexShrink: 0 }}>favorite</span>
                    </div>
                    <div style={{ fontSize: '12px', color: isCurrent ? '#e4e4e7' : '#71717a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {track.artist}
                    </div>
                  </div>
                  {/* Status/Duration */}
                  {isCurrent && isPlaying ? (
                    <span className="material-symbols-outlined" style={{ color: '#ffffff', fontSize: '18px' }}>volume_up</span>
                  ) : (
                    <span style={{ fontSize: '11px', color: '#71717a' }}>
                      {formatTime(track.duration)}
                    </span>
                  )}
                </div>
              );
            })
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px', color: '#71717a', padding: '40px 0' }}>
              {likedTracks.length === 0 ? (
                <>
                  <span className="material-symbols-outlined material-symbols-filled" style={{ fontSize: '36px', color: '#ef4444' }}>favorite</span>
                  <span style={{ fontSize: '14px', fontWeight: 'bold' }}>Liked list is empty</span>
                  <span style={{ fontSize: '12px', textAlign: 'center', opacity: 0.8 }}>Tracks you liked will appear here.</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: '36px', color: '#71717a' }}>search</span>
                  <span style={{ fontSize: '14px', fontWeight: 'bold' }}>No liked tracks found</span>
                  <span style={{ fontSize: '12px', textAlign: 'center', opacity: 0.8 }}>Try searching for a different name.</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* LYRICS SIDEBAR DRAWER */}
      {isLyricsOpen && (
        <div 
          onClick={() => setIsLyricsOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            zIndex: 1050,
            cursor: 'pointer',
            transition: 'opacity 0.3s ease-in-out'
          }}
        />
      )}

      <div 
        className="glass-panel"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          height: '100vh',
          width: '500px',
          maxWidth: '100vw',
          zIndex: 1100,
          display: 'flex',
          flexDirection: 'column',
          padding: '24px',
          boxShadow: '10px 0 30px rgba(0, 0, 0, 0.5)',
          transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          transform: isLyricsOpen ? 'translateX(0)' : 'translateX(-100%)'
        }}
      >
        {/* Drawer Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '16px' }}>
          <div style={{ textAlign: 'left', flex: 1, marginRight: '16px', minWidth: 0 }}>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {currentTrack?.title || 'No track selected'}
            </h3>
            <p style={{ fontSize: '14px', color: '#d4d4d8', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {currentTrack?.artist || ''}
            </p>
          </div>
          <button 
            className="btn-control" 
            onClick={() => setIsLyricsOpen(false)}
            style={{ width: '36px', height: '36px', flexShrink: 0 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Translation Toolbar */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '20px',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          borderRadius: '12px',
          padding: '10px 14px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#a1a1aa' }}>
            <span>Translate to:</span>
            <select 
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              style={{
                background: '#18181b',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '6px',
                color: '#fff',
                padding: '4px 8px',
                fontSize: '12px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="en">en</option>
              <option value="ru">ru</option>
            </select>
          </div>
          
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn-control"
              onClick={handleTranslate}
              disabled={isTranslating || !currentTrack?.words}
              style={{
                background: translatedWords ? 'rgba(255, 255, 255, 0.15)' : '#ffffff',
                border: translatedWords ? '1px solid rgba(255, 255, 255, 0.3)' : 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                color: translatedWords ? '#ffffff' : '#050507',
                boxShadow: translatedWords ? '0 0 10px rgba(255, 255, 255, 0.2)' : 'none',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: (!currentTrack?.words) ? 'not-allowed' : 'pointer',
                opacity: (!currentTrack?.words) ? 0.5 : 1,
                width: 'auto',
                height: 'auto'
              }}
            >
              {isTranslating ? 'Translating...' : 'Translate'}
            </button>
            <button
              className="btn-control"
              onClick={() => setTranslatedWords(null)}
              disabled={isTranslating}
              style={{
                background: !translatedWords ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                border: !translatedWords ? '1px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '6px',
                padding: '6px 12px',
                color: !translatedWords ? '#fff' : '#e1e1e6',
                boxShadow: !translatedWords ? '0 0 10px rgba(255, 255, 255, 0.1)' : 'none',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer',
                width: 'auto',
                height: 'auto'
              }}
            >
              Original
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '8px', marginBottom: '8px' }}>
          <div 
            key={translatedWords ? 'translated' : 'original'}
            className="animate-fade-in"
            style={{ 
              textAlign: 'left',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              padding: '0 16px'
            }}
          >
            {(translatedWords || currentTrack?.words) ? (translatedWords || currentTrack.words).replace(/\\n/g, '\n').split('\n').map((line, idx) => {
              const trimmedLine = line.trim();
              if (!trimmedLine) {
                return <div key={idx} style={{ height: '8px' }} />;
              }

              const isHeader = trimmedLine.startsWith('[') && trimmedLine.endsWith(']');
              
              if (isHeader) {
                return (
                  <div 
                    key={idx} 
                    style={{ 
                      marginTop: idx === 0 ? '4px' : '22px', 
                      marginBottom: '6px',
                      opacity: 0.45, 
                      fontSize: '12px', 
                      fontWeight: '800', 
                      color: '#d4d4d8', 
                      letterSpacing: '1.5px',
                      textTransform: 'uppercase'
                    }}
                  >
                    {trimmedLine}
                  </div>
                );
              }

              return (
                <div 
                  key={idx} 
                  style={{ 
                    lineHeight: '1.8', 
                    fontSize: '15px', 
                    color: '#e1e1e6', 
                    opacity: 0.9 
                  }}
                >
                  {trimmedLine}
                </div>
              );
            }) : (
              <p style={{ color: '#71717a', textAlign: 'center' }}>No lyrics available</p>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
