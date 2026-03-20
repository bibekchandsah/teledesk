import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Message } from '@shared/types';
import { formatTime, formatFileSize } from '../utils/formatters';
import UserAvatar from './UserAvatar';
import { Ban, Phone, Video, Paperclip, Trash2, Pencil, Copy, X, CornerUpLeft, Forward, Pin, PinOff, CheckSquare, Bookmark, BookmarkCheck, Check, CheckCheck, SmilePlus, Play, Pause, PhoneIncoming, PhoneOutgoing, PhoneMissed, PhoneOff, VideoOff, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useBookmarkStore } from '../store/bookmarkStore';
import MessageContextMenu, { PRESET_EMOJIS } from './MessageContextMenu';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import SpoilerText from './SpoilerText';
import ImageSpoiler from './ImageSpoiler';

const VideoCallIcon = ({ type, size = 20 }: { type: 'incoming' | 'outgoing' | 'missed'; size?: number }) => {
  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Video size={size} />
      {type === 'incoming' && (
        <ArrowDownLeft 
          size={size * 0.6} 
          style={{ 
            position: 'absolute', 
            bottom: size * 0.7, 
            right: -size * 0.2,
            strokeWidth: 2
          }} 
        />
      )}
      {type === 'outgoing' && (
        <ArrowUpRight 
          size={size * 0.6} 
          style={{ 
            position: 'absolute', 
            top: -size * 0.3, 
            right: -size * 0.2,
            strokeWidth: 2
          }} 
        />
      )}
      {type === 'missed' && (
        <X 
          size={size * 0.6} 
          style={{ 
            position: 'absolute', 
            top: -size * 0.3, 
            right: -size * 0.2,
            strokeWidth: 2
          }} 
        />
      )}
    </div>
  );
};

// Simple deterministic hash to generate stable waveforms
const getHash = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const VoiceNotePlayer = ({ fileUrl, isOwn, messageId, messageDuration }: { fileUrl?: string; isOwn: boolean; messageId: string; messageDuration?: number }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(messageDuration || 0);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLDivElement>(null);

  const handleSeek = (e: MouseEvent | React.MouseEvent | TouchEvent | React.TouchEvent) => {
    if (!waveformRef.current || !duration || duration === 0) return;
    const rect = waveformRef.current.getBoundingClientRect();
    
    let clientX: number;
    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
    } else if ('changedTouches' in e && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
    } else {
      clientX = (e as MouseEvent | React.MouseEvent).clientX;
    }

    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const newTime = percentage * duration;
    
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setProgress(newTime);
    }
  };

  const onMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    handleSeek(e);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    // Don't preventDefault here as it might block scrolling if the user just wants to scroll
    // But if we're on the waveform, we probably want to seek.
    setIsDragging(true);
    handleSeek(e);
  };

  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e: MouseEvent) => {
      handleSeek(e);
    };

    const onTouchMove = (e: TouchEvent) => {
      // Prevent scrolling while dragging the waveform
      if (e.cancelable) e.preventDefault();
      handleSeek(e);
    };

    const onEnd = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onEnd);
    };
  }, [isDragging, duration]);

  const togglePlay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent message bubble click
    if (!audioRef.current || !fileUrl) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(console.error);
    }
  }, [isPlaying, fileUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => setProgress(audio.currentTime);
    const onLoadedMetadata = () => {
      // Prioritize duration from message metadata if available
      if (messageDuration && messageDuration > 0) {
        setDuration(messageDuration);
        return;
      }

      let d = audio.duration;
      // WebM/Ogg from MediaRecorder often have Infinity duration until checked
      if (d === Infinity || isNaN(d)) {
         audio.currentTime = 1e101;
         setTimeout(() => {
            if (audio.duration !== Infinity && !isNaN(audio.duration)) {
               setDuration(audio.duration);
            }
            audio.currentTime = 0;
         }, 50);
      } else if (d > 0) {
         setDuration(d);
      }
    };
    const onEnded = () => {
      setIsPlaying(false);
      setProgress(0);
    };

    if (messageDuration && (!duration || duration === 0)) {
      setDuration(messageDuration);
    }

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

    // Generate real waveform by decoding the audio file
    useEffect(() => {
      if (!fileUrl) return;

      let isMounted = true;
      const fetchAndDecodeWaveform = async () => {
        try {
          let arrayBuffer: ArrayBuffer;

          // Use native Electron fetcher if available to bypass CORS
          if (window.electronAPI?.fetchAudioData) {
            const uint8Array = await window.electronAPI.fetchAudioData(fileUrl);
            arrayBuffer = uint8Array.buffer as ArrayBuffer;
          } else {
            const response = await fetch(fileUrl);
            if (!response.ok) throw new Error('Fetch failed');
            arrayBuffer = await response.arrayBuffer();
          }
          
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          
          const rawData = audioBuffer.getChannelData(0); 
          const samples = 40; 
          const blockSize = Math.floor(rawData.length / samples);
          
          const filteredData = [];
          for (let i = 0; i < samples; i++) {
            const blockStart = blockSize * i;
            let sum = 0;
            for (let j = 0; j < Math.min(blockSize, rawData.length - blockStart); j++) {
              sum += Math.abs(rawData[blockStart + j]);
            }
            filteredData.push(sum / Math.max(1, blockSize));
          }

          const maxVal = Math.max(...filteredData) || 0.1;
          const normalized = filteredData.map(n => Math.min(1, n / maxVal));
          
          if (isMounted) {
            setWaveform(normalized);
            // Also update duration if it's still 0
            if (!duration || duration === 0) {
              setDuration(audioBuffer.duration);
            }
          }
        } catch (err) {
          console.warn('[Waveform] Fallback triggered:', err);
          if (isMounted) {
            const hash = getHash(messageId || 'default');
            const fallback = Array.from({ length: 40 }).map((_, i) => 
               (((hash * (i + 1)) % 13) + 4) / 16
            );
            setWaveform(fallback);
          }
        }
      };

      fetchAndDecodeWaveform();
      return () => { isMounted = false; };
    }, [fileUrl, messageId]);

    useEffect(() => {
      const audio = audioRef.current;
      if (!audio || duration > 0) return;
      
      const checkDuration = () => {
        if (audio.duration && audio.duration !== Infinity && !isNaN(audio.duration)) {
          setDuration(audio.duration);
        }
      };
      
      audio.addEventListener('durationchange', checkDuration);
      audio.addEventListener('loadeddata', checkDuration);
      return () => {
        audio.removeEventListener('durationchange', checkDuration);
        audio.removeEventListener('loadeddata', checkDuration);
      };
    }, [duration]);

    const formatSecs = (s: number) => {
      if (!s || isNaN(s) || s === Infinity) return '0:00';
      const mins = Math.floor(s / 60);
      const secs = Math.floor(s % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
      <div className="message-voice-note" style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 10, 
        padding: '4px 0',
        width: 'fit-content',
        maxWidth: '100%',
        minWidth: 200
      }}>
      <button
         style={{
           width: 40,
           height: 40,
           borderRadius: '50%',
           backgroundColor: isOwn ? 'rgba(255,255,255,0.25)' : 'var(--accent)',
           border: 'none',
           display: 'flex',
           alignItems: 'center',
           justifyContent: 'center',
           color: '#fff',
           cursor: fileUrl ? 'pointer' : 'default',
           opacity: fileUrl ? 1 : 0.5,
           boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
           transition: 'transform 0.15s ease, box-shadow 0.15s ease',
         }}
         onClick={togglePlay}
         disabled={!fileUrl}
         title={isPlaying ? "Pause" : "Play"}
         onMouseEnter={e => {
           if (fileUrl) {
             e.currentTarget.style.transform = 'scale(1.05)';
             e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
           }
         }}
         onMouseLeave={e => {
           e.currentTarget.style.transform = 'scale(1)';
           e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
         }}
      >
         {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />}
      </button>
      
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
         <div 
            ref={waveformRef}
            onMouseDown={onMouseDown}
            onTouchStart={onTouchStart}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 2, 
              height: 28,
              cursor: 'pointer',
              padding: '4px 0',
              boxSizing: 'content-box'
            }}
          >
            {/* Real waveform visualization */}
            {waveform.length > 0 ? (
               waveform.map((val, i) => (
                 <div 
                   key={i} 
                   style={{ 
                     flex: 1, 
                     height: `${Math.max(3, val * 28)}px`, 
                     minWidth: 2,
                     backgroundColor: (progress / (duration || 0.1)) > (i / waveform.length) 
                       ? (isOwn ? '#fff' : 'var(--accent)') 
                       : (isOwn ? 'rgba(255,255,255,0.35)' : 'rgba(99, 102, 241, 0.25)'), 
                     borderRadius: 3,
                     transition: 'background-color 0.1s, height 0.1s'
                   }} 
                 />
               ))
            ) : (
               /* Fallback while generating waveform */
               Array.from({ length: 40 }).map((_, i) => (
                 <div 
                   key={i} 
                   style={{ 
                     flex: 1, 
                     height: '3px', 
                     backgroundColor: isOwn ? 'rgba(255,255,255,0.35)' : 'rgba(99, 102, 241, 0.25)', 
                     borderRadius: 3
                   }} 
                 />
               ))
            )}
         </div>
         <div style={{ 
           fontSize: 11, 
           opacity: 0.85, 
           color: isOwn ? 'rgba(255,255,255,0.95)' : 'var(--text-secondary)',
           fontWeight: 500,
           letterSpacing: '0.02em',
         }}>
           {formatSecs(progress)} / {formatSecs(duration)}
         </div>
      </div>

      {fileUrl && <audio ref={audioRef} src={fileUrl} style={{ display: 'none' }} preload="auto" />}
    </div>
  );
};

// ==========================================
// Video Note Bubble Component
// ==========================================
const VideoNoteBubble = ({ message }: { message: Message }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // SVG Ring calculation
  const radius = 116; // 240 / 2 - 4 (stroke width)
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - progress * circumference;

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play().catch(console.error);
      } else {
        videoRef.current.pause();
      }
    }
  };

  return (
    <div className="message-video-note" style={{
      width: 240,
      maxWidth: '100%',
      aspectRatio: '1/1',
      borderRadius: '50%',
      position: 'relative',
      backgroundColor: '#000',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.15)',
      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    }} 
    onClick={togglePlay}
    onMouseEnter={e => {
      e.currentTarget.style.transform = 'scale(1.02)';
      e.currentTarget.style.boxShadow = '0 6px 24px rgba(0, 0, 0, 0.25), 0 3px 12px rgba(0, 0, 0, 0.2)';
    }}
    onMouseLeave={e => {
      e.currentTarget.style.transform = 'scale(1)';
      e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.15)';
    }}
    >
      
      {/* Premium Circular Playback Ring */}
      <svg 
         style={{ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            width: '100%', 
            height: '100%', 
            transform: 'rotate(-90deg)', 
            pointerEvents: 'none',
            zIndex: 10,
            filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2))',
         }}
      >
        {/* Background track */}
        <circle
          cx="120"
          cy="120"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="5"
        />
        {/* Progress track */}
        <circle
          cx="120"
          cy="120"
          r={radius}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: 'stroke-dashoffset 0.1s linear' }}
        />
      </svg>

      <div style={{
         width: 'calc(100% - 12px)',
         height: 'calc(100% - 12px)',
         borderRadius: '50%',
         overflow: 'hidden',
         position: 'relative'
      }}>
        {message.fileUrl ? (
          <video
            ref={videoRef}
            src={message.fileUrl}
            loop
            muted={false}
            playsInline
            controls={false}
            onTimeUpdate={() => {
              if (videoRef.current) {
                const perc = videoRef.current.currentTime / (videoRef.current.duration || 1);
                setProgress(Math.min(1, Math.max(0, perc)));
              }
            }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => {
              setIsPlaying(false);
              setProgress(0);
            }}
            style={{ 
              width: '100%', 
              height: '100%', 
              objectFit: 'cover',
              transform: message.mirrored ? 'scaleX(-1)' : 'none'
            }}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.5 }}>
            Video unavailable
          </div>
        )}
      </div>

      {!isPlaying && message.fileUrl && (
         <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 56,
            height: 56,
            backgroundColor: 'rgba(0,0,0,0.6)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(8px)',
            pointerEvents: 'none',
            zIndex: 11,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
         }}>
             <Play size={26} color="#fff" style={{ marginLeft: 4 }} fill="#fff" />
         </div>
      )}
    </div>
  );
};

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  senderName?: string;
  senderAvatar?: string;
  showSender?: boolean;
  onDelete?: (messageId: string, scope: 'me' | 'both') => void;
  onStartEdit?: (message: Message) => void;
  onCall?: (callType: 'voice' | 'video') => void;
  onReply?: (message: Message) => void;
  onForward?: (message: Message) => void;
  onBookmark?: (message: Message) => void;
  onDownload?: (message: Message) => void;
  onPin?: (message: Message, action: 'pin' | 'unpin') => void;
  isPinned?: boolean;
  onScrollToMessage?: (messageId: string) => void;
  onCloseChat?: () => void;
  onEnterSelect?: (messageId: string) => void;
  searchQuery?: string;
  isActiveSearchMatch?: boolean;
  isHighlighted?: boolean;
  currentUserShowMessageStatus?: boolean;
  otherUserShowMessageStatus?: boolean;
  onMessageReaction?: (messageId: string, emoji: string) => void;
  onPreview?: (message: Message) => void;
  currentUserId?: string;
  getUserName?: (uid: string) => string;
  onMentionClick?: (text: string, type: 'username' | 'email') => void;
  isTouchDevice?: boolean;
  onContextMenuOpen?: () => void;
  onContextMenuClose?: () => void;
  openBubbleMenuId?: string | null;
}


const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isOwn,
  senderName,
  senderAvatar,
  showSender = false,
  onDelete,
  onStartEdit,
  onCall,
  onReply,
  onForward,
  onBookmark,
  onDownload,
  onPin,
  isPinned = false,
  onScrollToMessage,
  onCloseChat,
  onEnterSelect,
  searchQuery,
  isActiveSearchMatch = false,
  isHighlighted = false,
  currentUserShowMessageStatus = true,
  otherUserShowMessageStatus = true,
  onMessageReaction,
  onPreview,
  currentUserId,
  getUserName,
  onMentionClick,
  isTouchDevice = false,
  onContextMenuOpen,
  onContextMenuClose,
  openBubbleMenuId,
}) => {
  // ─── Context menu state ───────────────────────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [adjustedPos, setAdjustedPos] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // ─── Swipe + long-press gesture state (touch devices) ────────────────────
  const swipeTouchStartX = useRef<number | null>(null);
  const swipeTouchStartY = useRef<number | null>(null);
  const swipeTranslateX = useRef<number>(0);
  const bubbleWrapperRef = useRef<HTMLDivElement | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swipeTriggered, setSwipeTriggered] = useState(false);
  // Track last touch position for context menu placement
  const lastTouchPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const SWIPE_THRESHOLD = 60;
  const SWIPE_MAX = 80;
  const TAP_MOVE_LIMIT = 8;

  // ─── Touch tap → context menu OR preview (depending on target) ───────────
  const tapStartPos = useRef<{ x: number; y: number } | null>(null);
  const tapCancelled = useRef(false);
  const menuWasOpenOnTapStart = useRef(false);
  const TOUCH_TAP_MOVE_LIMIT = 10;

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    tapStartPos.current = { x: t.clientX, y: t.clientY };
    lastTouchPos.current = { x: t.clientX, y: t.clientY };
    tapCancelled.current = false;
    // Snapshot own menu state BEFORE document touchstart listeners can close it
    menuWasOpenOnTapStart.current = ctxMenu !== null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!tapStartPos.current) return;
    const t = e.touches[0];
    lastTouchPos.current = { x: t.clientX, y: t.clientY };
    const dx = t.clientX - tapStartPos.current.x;
    const dy = t.clientY - tapStartPos.current.y;
    // Cancel tap if finger moved too much (scrolling)
    if (Math.abs(dx) > TOUCH_TAP_MOVE_LIMIT || Math.abs(dy) > TOUCH_TAP_MOVE_LIMIT) {
      tapCancelled.current = true;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (tapCancelled.current || !tapStartPos.current) {
      tapStartPos.current = null;
      tapCancelled.current = false;
      return;
    }

    const target = e.target as HTMLElement;
    
    // Check if tap was on interactive elements (buttons, reactions) — let them handle it
    const isInteractive = !!target.closest('button, a, input, [role="button"], .emoji-reaction');
    if (isInteractive) {
      tapStartPos.current = null;
      return;
    }

    // Check if tap was on media content (image, video, audio, file attachment)
    const isMediaContent = !!target.closest('img, video, audio, .message-image, .message-video, .message-file, .voice-note-player, .message-call-bubble, .video-note-bubble');
    
    if (isMediaContent) {
      // Tap on media → let default click handler open preview (do nothing here)
      tapStartPos.current = null;
      return;
    }

    // Tap on bubble background/text → toggle context menu
    if (onDelete) {
      if (menuWasOpenOnTapStart.current) {
        // Was open when finger went down → close it
        closeCtxMenu();
      } else {
        // Was closed → open it
        e.preventDefault();
        onContextMenuOpen?.();
        setCtxMenu({ x: lastTouchPos.current.x, y: lastTouchPos.current.y });
      }
    }

    tapStartPos.current = null;
    tapCancelled.current = false;
    menuWasOpenOnTapStart.current = false;
  };

  // ─── Swipe handlers (pointer events, touch only) ──────────────────────────
  const handleSwipePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    swipeTouchStartX.current = e.clientX;
    swipeTouchStartY.current = e.clientY;
    swipeTranslateX.current = 0;
    setSwipeTriggered(false);
  };

  const handleSwipePointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch' || swipeTouchStartX.current === null || swipeTouchStartY.current === null) return;
    const dx = e.clientX - swipeTouchStartX.current;
    const dy = e.clientY - swipeTouchStartY.current;
    if (Math.abs(dy) > Math.abs(dx)) return;
    const clamped = Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, dx));
    swipeTranslateX.current = clamped;
    setSwipeOffset(clamped);
  };

  const handleSwipePointerUp = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch' || swipeTouchStartX.current === null || swipeTouchStartY.current === null) return;
    const totalDx = e.clientX - swipeTouchStartX.current;
    const totalDy = e.clientY - swipeTouchStartY.current;
    const isTap = Math.abs(totalDx) < TAP_MOVE_LIMIT && Math.abs(totalDy) < TAP_MOVE_LIMIT;

    if (!isTap) {
      const dx = swipeTranslateX.current;
      if (!swipeTriggered) {
        if (dx < -SWIPE_THRESHOLD) {
          setSwipeTriggered(true);
          setReplyFlash(true);
          setTimeout(() => setReplyFlash(false), 400);
          onReply?.(message);
        } else if (dx > SWIPE_THRESHOLD) {
          setSwipeTriggered(true);
          onForward?.(message);
        }
      }
    }

    swipeTouchStartX.current = null;
    swipeTouchStartY.current = null;
    swipeTranslateX.current = 0;
    setSwipeOffset(0);
  };

  // ─── Double-click reply flash ─────────────────────────────────────────────
  const [replyFlash, setReplyFlash] = useState(false);
  // ─── Bookmark state ───────────────────────────────────────────────────────
  const { isBookmarked, addBookmark, removeBookmark } = useBookmarkStore();
  const bookmarked = isBookmarked(message.messageId);
  // ─── Reaction bar state ───────────────────────────────────────────────────
  const [showEmojiBar, setShowEmojiBar] = useState(false);
  const [isEmojiBarHovered, setIsEmojiBarHovered] = useState(false);
  const [showExtended, setShowExtended] = useState(false);
  const [pickerDirection, setPickerDirection] = useState<'up' | 'down'>('up');
  const [pickerPos, setPickerPos] = useState<{ top?: number; bottom?: number; left?: number; right?: number } | null>(null);
  // const [barPos, setBarPos] = useState<{ top?: number; bottom?: number; left?: number; right?: number } | null>(null);
  const [tooltipEmoji, setTooltipEmoji] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const emojiBarRef = useRef<HTMLDivElement>(null);
  const smilePlusBtnRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Global click-away listener for extended emoji picker
  useEffect(() => {
    if (!showExtended) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't close if clicking the + button (it handles its own toggle)
      if (smilePlusBtnRef.current?.contains(target)) return;
      // Don't close if clicking inside the picker
      if (pickerRef.current?.contains(target)) return;
      // Don't close if clicking inside the emoji bar
      if (emojiBarRef.current?.contains(target)) return;

      setShowExtended(false);
      setPickerPos(null);
      // Also close the small bar if we're clicking completely away
      if (!emojiBarRef.current?.contains(target)) {
        setShowEmojiBar(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showExtended]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // Close this bubble's menu when another bubble opens its own
  useEffect(() => {
    if (openBubbleMenuId !== undefined && openBubbleMenuId !== message.messageId) {
      setCtxMenu(null);
      // no need to call onContextMenuClose here — the other bubble's open already handles parent state
    }
  }, [openBubbleMenuId, message.messageId]);

  const closeCtxMenu = () => {
    setCtxMenu(null);
    onContextMenuClose?.();
  };

  // Handle context menu
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!onDelete) return;
    onContextMenuOpen?.();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  };


  const handleDelete = (scope: 'me' | 'both') => {
    setCtxMenu(null);
    onDelete?.(message.messageId, scope);
  };

  const handleStartEdit = () => {
    setCtxMenu(null);
    onStartEdit?.(message);
  };

  const convertToPng = useCallback((blob: Blob): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous'; // Important for canvas extraction from cross-origin URLs
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas context failed')); return; }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => {
        reject(new Error('Image load failed'));
        URL.revokeObjectURL(img.src);
      };
      img.src = URL.createObjectURL(blob);
    });
  }, []);

  const handleCopy = async (msg?: Message) => {
    const target = msg || message;
    const isImage = target.type === 'image' || target.type === 'gif' || target.type === 'sticker';
    
    if (isImage && target.fileUrl) {
      try {
        // 1. Electron native copy
        if (window.electronAPI?.copyImageToClipboard) {
          const ok = await window.electronAPI.copyImageToClipboard(target.fileUrl);
          if (ok) {
            showToast(`${target.type === 'sticker' ? 'Sticker' : target.type === 'gif' ? 'GIF' : 'Image'} copied`);
            return;
          }
        }

        // 2. Browser Clipboard API
        if (navigator.clipboard && (window as any).ClipboardItem) {
          try {
            // Add cache-buster to force fresh CORS request (bypasses non-CORS cached display images)
            const fetchUrl = target.fileUrl.includes('?') ? `${target.fileUrl}&cors=1` : `${target.fileUrl}?cors=1`;
            const res = await fetch(fetchUrl, { mode: 'cors' });
            if (!res.ok) throw new Error('Fetch failed');
            const blob = await res.blob();
            
            let finalBlob = blob;
            // Clipboard API mostly only supports image/png reliably across browsers
            if (blob.type !== 'image/png') {
              finalBlob = await convertToPng(blob);
            }
            
            await navigator.clipboard.write([
              new (window as any).ClipboardItem({ [finalBlob.type]: finalBlob })
            ]);
            showToast(`${target.type === 'sticker' ? 'Sticker' : target.type === 'gif' ? 'GIF' : 'Image'} copied to clipboard`);
            return;
          } catch (err) {
            // This is usually a CORS block on the web
            console.warn('Browser blocked direct image data access (CORS). Falling back to URL copy.');
          }
        }

        // 3. Fallback: Copy URL as text if blob fails (CORS or API issues)
        try {
          if (window.electronAPI?.copyTextToClipboard) {
            window.electronAPI.copyTextToClipboard(target.fileUrl);
          } else {
            await navigator.clipboard.writeText(target.fileUrl);
          }
          showToast(`Direct copy blocked by browser. Image link copied.`);
          return;
        } catch (err) {
          console.error('Copy URL fallback failed:', err);
        }

        // 4. Mobile Share Fallback
        if (navigator.share) {
          try {
            const fetchUrl = target.fileUrl.includes('?') ? `${target.fileUrl}&cors=1` : `${target.fileUrl}?cors=1`;
            const res = await fetch(fetchUrl, { mode: 'cors' });
            const blob = await res.blob();
            const ext = blob.type.split('/')[1] || 'png';
            const file = new File([blob], `image.${ext}`, { type: blob.type });
            await navigator.share({ 
              files: [file],
              title: 'Copy Image',
            });
            return;
          } catch (err) {
            console.error('Share failed:', err);
          }
        }

        showToast('Unable to copy image');
      } catch (err) {
        showToast('Unable to copy image');
        console.error('Copy error:', err);
      }
    } else if (target.content) {
      if (window.electronAPI?.copyTextToClipboard) {
        window.electronAPI.copyTextToClipboard(target.content);
      } else {
        navigator.clipboard.writeText(target.content).catch(() => {});
      }
      showToast('Text copied');
    }
  };

  const handleReply = () => {
    setCtxMenu(null);
    onReply?.(message);
  };

  const handleDoubleClick = () => {
    if (message.deleted || !onReply) return;
    setReplyFlash(true);
    setTimeout(() => setReplyFlash(false), 400);
    onReply(message);
  };

  const handleForward = () => {
    setCtxMenu(null);
    onForward?.(message);
  };

  const handleBookmark = () => {
    setCtxMenu(null);
    onBookmark?.(message);
  };

  const handlePin = () => {
    setCtxMenu(null);
    if (!message.deleted) onPin?.(message, isPinned ? 'unpin' : 'pin');
  };

  const handleEmojiClick = (emoji: string) => {
    setShowEmojiBar(false);
    setShowExtended(false);
    setPickerPos(null);
    // setBarPos(null);
    setCtxMenu(null);
    onMessageReaction?.(message.messageId, emoji);
  };

  const handleEmojiMartSelect = (emojiData: any) => {
    if (emojiData?.native) {
      handleEmojiClick(emojiData.native);
    }
  };

  const handleMouseEnterBubble = () => {
  // const handleMouseEnterBubble = (e: React.MouseEvent) => {
    if (message.deleted) return;
    if (isTouchDevice) return; // touch devices use tap → context menu instead
    
    // Calculate bar position relative to portal container
    // const bubble = e.currentTarget as HTMLElement;
    // const rect = bubble.getBoundingClientRect();
    // const chatContainer = document.getElementById('chat-emoji-picker-container');
    // const chatRect = chatContainer?.getBoundingClientRect() || { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth, width: window.innerWidth, height: window.innerHeight };
    
    // const barWidth = isTouchDevice ? 265 : 48; // Initial width (single emoji or touch row)
    // const expandedWidth = isTouchDevice ? 265 : 265; 
    
    // const relativeBottom = rect.top - chatRect.top;
    // const relativeLeft = rect.left - chatRect.left;
    // const relativeRight = rect.right - chatRect.left;

    // // Default to top of bubble
    // const top = relativeBottom - 42; // 36px height + 6px margin
    
    // // Horizontal positioning:
    // // For sender (isOwn), anchor to right of bubble, but don't go off-screen left
    // // For receiver, anchor to left of bubble, but don't go off-screen right
    // let left = isOwn ? (relativeRight - barWidth) : relativeLeft;
    
    // // Constraints: must be at least 8px from left and 8px from right of chat window
    // // Account for expanded width if we're on touch or planning to hover
    // const maxLeft = chatRect.width - expandedWidth - 8;
    // left = Math.max(8, Math.min(left, maxLeft));

    // setBarPos({ top, left });
    
    hoverTimerRef.current = setTimeout(() => setShowEmojiBar(true), 150);
  };

  const handleMouseLeaveBubble = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    // Small delay so user can move mouse from bubble to emoji bar
    setTimeout(() => {
      if (!emojiBarRef.current?.matches(':hover') && !showExtended) {
        setShowEmojiBar(false);
        setIsEmojiBarHovered(false);
        setShowExtended(false);
        setPickerPos(null);
        // setBarPos(null);
      }
    }, 120);
  };

  const reactions = message.reactions ?? {};
  const reactionEntries = Object.entries(reactions).filter(([, users]) => users.length > 0);

  const renderContent = () => {
    if (message.deleted) {
      return (
        <p style={{ margin: 0, fontStyle: 'italic', opacity: 0.6, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Ban size={14} /> This message was deleted
        </p>
      );
    }

    if (message.type === 'call') {
      const direction = isOwn ? 'outgoing' : 'incoming';
      const status = direction === 'outgoing' ? message.callStatus : (message.callStatusReceiver ?? message.callStatus);
      const isVideo = message.callType === 'video';

      let iconEl: React.ReactNode;
      let label: string;
      let callColor = 'var(--accent)';
      let isFailed = false;

      if (status === 'missed' || status === 'no_answer') {
        isFailed = true;
        callColor = '#f87171';
        iconEl = isVideo ? <VideoCallIcon type="missed" size={20} /> : <PhoneMissed size={20} />;
        label = status === 'missed' ? `Missed ${isVideo ? 'video' : 'voice'} call` : `${isVideo ? 'Video' : 'Voice'} call — no answer`;
      } else if (status === 'declined' || status === 'cancelled') {
        isFailed = true;
        callColor = '#f87171';
        iconEl = isVideo ? <VideoOff size={20} /> : <PhoneOff size={20} />;
        label = status === 'declined' ? `${isVideo ? 'Video' : 'Voice'} call declined` : `${isVideo ? 'Video' : 'Voice'} call cancelled`;
      } else if (direction === 'incoming') {
        callColor = '#34d399';
        iconEl = isVideo ? <VideoCallIcon type="incoming" size={20} /> : <PhoneIncoming size={20} />;
        label = `Incoming ${isVideo ? 'video' : 'voice'} call`;
      } else {
        callColor = 'var(--accent)';
        iconEl = isVideo ? <VideoCallIcon type="outgoing" size={20} /> : <PhoneOutgoing size={20} />;
        label = `Outgoing ${isVideo ? 'video' : 'voice'} call`;
      }

      const dur = message.callDuration ?? 0;
      const m = Math.floor(dur / 60);
      const s = dur % 60;
      const dStr = m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;

      return (
        <div
          className={`message-call-bubble ${isFailed ? 'call-failed' : ''}`}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 12, 
            cursor: onCall ? 'pointer' : 'default',
            minWidth: 220,
            filter: 'drop-shadow(2px 4px 6px black)',
          }}
          onClick={() => onCall?.(message.callType ?? 'voice')}
          title={onCall ? `Call back (${message.callType ?? 'voice'})` : undefined}
        >
          <div style={{ 
            width: 44, 
            height: 44, 
            borderRadius: '50%', 
            background: isFailed 
              ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(248, 113, 113, 0.2) 100%)'
              : 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(129, 140, 248, 0.2) 100%)',
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            color: callColor,
            flexShrink: 0,
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            // border: '1.5px solid rgba(255, 255, 255, 0.2)',
          }}>
            {iconEl}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ 
              fontSize: 14, 
              fontWeight: 600, 
              color: callColor,
              marginBottom: 2,
              letterSpacing: '0.01em',
              textShadow: '0 1px 2px rgba(0,0,0,0.4)',
            }}>
              {label}
            </div>
            {status === 'completed' && dur > 0 && (
              <div style={{ 
                fontSize: 12, 
                opacity: 0.9,
                color: 'var(--text-secondary)',
                fontWeight: 600,
                textShadow: '0 1px 2px rgba(0,0,0,0.4)',
              }}>
                Duration: {dStr}
              </div>
            )}
          </div>
        </div>
      );
    }

    switch (message.type) {
      case 'image':
      case 'gif':
      case 'sticker':
        return (
          <div className="message-image">
            {message.isSpoiler ? (
              <ImageSpoiler
                src={message.fileUrl!}
                alt={message.fileName || 'image'}
                onClick={() => {
                  if (onPreview) {
                    onPreview(message);
                  } else {
                    window.open(message.fileUrl, '_blank');
                  }
                }}
                style={{
                  maxWidth: '100%',
                  maxHeight: 320,
                  borderRadius: 8,
                }}
              />
            ) : (
              <img
                src={message.fileUrl}
                alt={message.fileName || 'image'}
                style={{ 
                  maxWidth: '100%', 
                  maxHeight: 320, 
                  borderRadius: 8, 
                  cursor: 'pointer',
                  objectFit: 'contain'
                }}
                onClick={() => {
                  if (onPreview) {
                    onPreview(message);
                  } else {
                    window.open(message.fileUrl, '_blank');
                  }
                }}
              />
            )}
            {message.content && (
              <div className="message-caption" style={{ margin: 0 }}>{renderMessageText(message.content, searchQuery, isOwn, onMentionClick)}</div>
            )}
          </div>
        );

      case 'video':
        return (
          <div
            className="message-video"
            onClick={message.isSpoiler ? undefined : () => onPreview?.(message)}
            style={{ cursor: (onPreview && !message.isSpoiler) ? 'pointer' : 'default', position: 'relative' }}
          >
            {message.isSpoiler ? (
              <ImageSpoiler
                src={message.fileUrl!}
                alt={message.fileName || 'video'}
                isVideo={true}
                onClick={() => {
                  if (onPreview) {
                    onPreview(message);
                  } else {
                    window.open(message.fileUrl, '_blank');
                  }
                }}
                style={{
                  maxWidth: '100%',
                  maxHeight: 320,
                  borderRadius: 8,
                }}
              />
            ) : (
              <>
                <video
                  src={message.fileUrl}
                  controls={!onPreview}
                  style={{ maxWidth: '100%', borderRadius: 8, pointerEvents: onPreview ? 'none' : 'auto' }}
                />
                {onPreview && (
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                    backdropFilter: 'blur(4px)',
                  }}>
                    <Play size={28} style={{ color: '#fff', marginLeft: 4 }} fill="#fff" />
                  </div>
                )}
              </>
            )}
          </div>
        );

      case 'audio':
      case 'voice_note':
        return <div className="voice-note-player"><VoiceNotePlayer fileUrl={message.fileUrl} isOwn={isOwn} messageId={message.messageId} messageDuration={message.duration} /></div>;

      case 'video_note':
        return <div className="video-note-bubble"><VideoNoteBubble message={message} /></div>;

      case 'file':
        return (
          <div
            onClick={() => onPreview?.(message)}
            className="message-file"
            style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            <Paperclip size={18} className="file-icon" />
            <div>
              <div className="file-name" style={{ fontSize: 14, fontWeight: 500 }}>
                {message.fileName || 'File'}
              </div>
              {message.fileSize && (
                <div className="file-size" style={{ fontSize: 12, opacity: 0.7 }}>
                  {formatFileSize(message.fileSize)}
                </div>
              )}
            </div>
          </div>
        );

      default:
        return (
          <div style={{ margin: 0, wordBreak: 'break-word' }}>{renderMessageText(message.content ?? '', searchQuery, isOwn, onMentionClick)}</div>
        );
    }
  };

  return (
    <>
    {toast && (
      <div style={{
        position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
        backgroundColor: 'rgba(30,30,30,0.92)', color: '#fff',
        padding: '8px 18px', borderRadius: 20, fontSize: 13, fontWeight: 500,
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)', zIndex: 9999,
        pointerEvents: 'none', whiteSpace: 'nowrap',
        animation: 'fadeIn 0.2s ease',
      }}>{toast}</div>
    )}
    <div
      ref={bubbleWrapperRef}
      className={`message-bubble-wrapper ${isOwn ? 'own' : 'other'}`}
      style={{
        display: 'flex',
        flexDirection: isOwn ? 'row-reverse' : 'row',
        alignItems: 'flex-end',
        gap: 8,
        marginBottom: reactionEntries.length > 0 ? 8 : 4,
        padding: '0 16px',
        position: 'relative',
        transform: swipeOffset !== 0 ? `translateX(${swipeOffset}px)` : undefined,
        transition: swipeOffset === 0 ? 'transform 0.2s ease' : 'none',
        touchAction: 'pan-y',
      }}
      onContextMenu={handleContextMenu}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={handleMouseEnterBubble}
      onMouseLeave={handleMouseLeaveBubble}
      onPointerDown={handleSwipePointerDown}
      onPointerMove={handleSwipePointerMove}
      onPointerUp={handleSwipePointerUp}
      onPointerCancel={handleSwipePointerUp}
      {...(isTouchDevice && {
        onTouchStart: handleTouchStart,
        onTouchMove: handleTouchMove,
        onTouchEnd: handleTouchEnd,
      })}
    >
      {!isOwn && showSender && (
        <UserAvatar name={senderName || 'User'} avatar={senderAvatar} size={28} />
      )}

      <div className="message-bubble-content" style={{ 
        maxWidth: '85%', 
        width: 'fit-content', 
        minWidth: 0, 
        position: 'relative', 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: isOwn ? 'flex-end' : 'flex-start'
      }}>
        {showSender && !isOwn && senderName && (
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', marginBottom: 2, paddingLeft: 2 }}>
            {senderName}
          </div>
        )}

        {/* ─── Hovering Emoji Quick-Bar ──────────────────────────────────── */}
        {showEmojiBar && !message.deleted && onMessageReaction && (
        // {showEmojiBar && !message.deleted && onMessageReaction && barPos && createPortal(
          <div
            ref={emojiBarRef}
            onMouseLeave={() => { 
              if (!showExtended) {
                setShowEmojiBar(false); 
                setShowExtended(false); 
                setPickerPos(null); 
                // setBarPos(null);
              }
            }}
            style={{
              position: 'absolute',
              // left: barPos.left,
              // top: barPos.top,
              [isOwn ? 'right' : 'left']: isTouchDevice ? 0 : 'calc(100% - 48px)',
              bottom: '100%',
              marginBottom: 6,
              zIndex: 200,
              display: 'flex',
              flexDirection: 'column',
              alignItems: isOwn ? 'flex-end' : 'flex-start',
              gap: 4,
              animation: 'reactionBarSlideUp 0.15s ease-out',
              // pointerEvents: 'auto',
            }}
          >
            <div 
              onMouseEnter={() => setIsEmojiBarHovered(true)}
              onMouseLeave={() => { 
                setIsEmojiBarHovered(false);
                if (!showExtended) setShowEmojiBar(false); 
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                flexDirection: isOwn ? 'row-reverse' : 'row',
                gap: (isEmojiBarHovered || isTouchDevice) ? 2 : 0,
                padding: '4px 8px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 24,
                boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                backdropFilter: 'blur(12px)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                width: (isEmojiBarHovered || isTouchDevice) ? 265 : 48,
                maxWidth: (isEmojiBarHovered || isTouchDevice) ? 510 : 48,
                height: 36,
                // justifyContent: 'flex-start',
                justifyContent: 'center',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              {/* {tooltipEmoji && (
                <div style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  backgroundColor: 'rgba(0,0,0,0.85)',
                  color: '#fff',
                  padding: '4px 8px',
                  borderRadius: 6,
                  fontSize: 12,
                  marginBottom: 8,
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                  zIndex: 1000,
                  backdropFilter: 'blur(4px)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                }}>
                  {tooltipEmoji}
                </div>
              )} */}
              {/* More emojis button (now at the start) */}
              <button
                ref={smilePlusBtnRef}
                onClick={() => {
                  if (!showExtended) {
                    const btn = smilePlusBtnRef.current;
                    if (btn) {
                      const rect = btn.getBoundingClientRect();
                      const chatContainer = document.getElementById('chat-emoji-picker-container');
                      const chatRect = chatContainer?.getBoundingClientRect() || { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth, width: window.innerWidth, height: window.innerHeight };
                      
                      const pickerHeight = 435;
                      const pickerWidth = 352;
                      
                      // Calculate positions relative to chat container
                      const relativeBtnBottom = rect.bottom - chatRect.top;
                      const relativeBtnTop = rect.top - chatRect.top;
                      const relativeBtnRight = rect.right - chatRect.left;
                      
                      const spaceBelow = chatRect.bottom - rect.bottom - 8;
                      const dir = spaceBelow >= pickerHeight ? 'down' : 'up';
                      setPickerDirection(dir);

                      const left = Math.min(relativeBtnRight - pickerWidth, chatRect.width - pickerWidth - 8);
                      const safeLeft = Math.max(8, left);

                      if (dir === 'down') {
                        setPickerPos({ top: relativeBtnBottom + 6, left: safeLeft });
                      } else {
                        setPickerPos({ bottom: (chatRect.height - relativeBtnTop) + 6, left: safeLeft });
                      }
                    }
                  } else {
                    setPickerPos(null);
                  }
                  setShowExtended(v => !v);
                }}
                title="More reactions"
                style={{
                  background: 'none',
                  border: 'none',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  padding: (isEmojiBarHovered || isTouchDevice) ? '4px 6px' : 0,
                  display: 'flex',
                  alignItems: 'center',
                  color: 'var(--text-secondary, #aaa)',
                  transition: 'transform 0.12s, color 0.12s, opacity 0.3s, width 0.3s, padding 0.3s',
                  opacity: (isEmojiBarHovered || isTouchDevice) ? 1 : 0,
                  transform: (isEmojiBarHovered || isTouchDevice) ? 'scale(1)' : 'scale(0.3)',
                  flexShrink: 0,
                  width: (isEmojiBarHovered || isTouchDevice) ? 'auto' : 0,
                  overflow: 'hidden',
                  pointerEvents: (isEmojiBarHovered || isTouchDevice) ? 'auto' : 'none',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.3)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary, #aaa)'; }}
              >
                <SmilePlus size={18} />
              </button>

              {PRESET_EMOJIS.map((em, idx) => {
                const alreadyReacted = (reactions[em] ?? []).includes(currentUserId ?? '');
                const isFirst = idx === 0;
                return (
                  <button
                    key={em}
                    onClick={() => handleEmojiClick(em)}
                    title={em}
                    style={{
                      background: alreadyReacted ? 'rgba(var(--accent-rgb,99,102,241),0.15)' : 'none',
                      border: 'none',
                      borderRadius: '50%',
                      cursor: 'pointer',
                      padding: (isFirst || isEmojiBarHovered || isTouchDevice) ? '4px' : 0,
                      fontSize: 20,
                      lineHeight: 1,
                      transition: 'transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.2s, width 0.2s, padding 0.2s',
                      opacity: (isFirst || isEmojiBarHovered || isTouchDevice) ? 1 : 0,
                      transform: (isFirst || isEmojiBarHovered || isTouchDevice) ? 'scale(1)' : 'scale(0.5)',
                      display: 'flex',
                      width: (isFirst || isEmojiBarHovered || isTouchDevice) ? 'auto' : 0,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      overflow: 'hidden',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.4)')}
                    onMouseLeave={e => (e.currentTarget.style.transform = isEmojiBarHovered ? 'scale(1)' : 'scale(1)')}
                  >
                    {em}
                  </button>
                );
              })}
            </div>
          </div>
          // </div>,
          // document.getElementById('chat-emoji-picker-container')!
        )}

        {/* ─── Emoji Picker Portal (renders inside chat window, never overlaps sidebar) ── */}
        {showExtended && pickerPos && createPortal(
          <div
            ref={pickerRef}
            onMouseDown={e => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: pickerPos.top,
              bottom: pickerPos.bottom,
              left: pickerPos.left,
              zIndex: 10000,
              pointerEvents: 'auto',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: 12,
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              backdropFilter: 'blur(12px)',
              overflow: 'hidden',
            }}
          >
            <Picker data={data} onEmojiSelect={handleEmojiMartSelect} theme="auto" previewPosition="none" skinTonePosition="none" navPosition="bottom" />
          </div>,
          document.getElementById('chat-emoji-picker-container') || document.body
        )}

        <div
          className={`message-bubble ${isOwn ? 'bubble-own' : 'bubble-other'} ${message.type === 'text' ? 'message-text-bubble' : ''}`}
          style={{
            backgroundColor: message.type === 'video_note' ? 'transparent' : message.type === 'call' ? 'transparent' : (isOwn ? 'var(--accent)' : 'var(--bg-secondary)'),
            color: isOwn ? '#fff' : 'var(--text-primary)',
            borderRadius: isOwn ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
            padding: message.type === 'video_note' ? 0 : message.type === 'call' ? 0 : '10px 14px',
            fontSize: 14,
            lineHeight: 1.5,
            outline: isHighlighted
              ? '2px solid var(--accent)'
              : isActiveSearchMatch
              ? '2px solid var(--accent)'
              : undefined,
            outlineOffset: isHighlighted || isActiveSearchMatch ? 2 : undefined,
            boxShadow: isHighlighted ? '0 0 0 4px rgba(var(--accent-rgb, 99,102,241), 0.25)' : undefined,
            transition: 'opacity 0.15s, box-shadow 0.3s, outline 0.3s',
            opacity: replyFlash ? 0.5 : 1,
            display: 'flex',
            flexDirection: 'column',
            width: 'fit-content',
            minWidth: 0,
            maxWidth: '100%',
            alignSelf: isOwn ? 'flex-end' : 'flex-start'
          }}
        >
          {/* Forwarded indicator */}
          {message.forwarded && !message.deleted && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                marginBottom: 4,
                opacity: 0.65,
                fontSize: 11,
                fontStyle: 'italic',
              }}
            >
              <Forward size={11} />
              Forwarded message
            </div>
          )}
          {/* Reply quote */}
          {message.replyTo && !message.deleted && (
              <div 
                style={{
                  borderLeft: `3px solid ${isOwn ? 'rgba(255,255,255,0.5)' : 'var(--accent)'}`,
                  paddingLeft: 8,
                  marginBottom: 6,
                  opacity: 0.8,
                  fontSize: 12,
                  maxWidth: '100%',
                  cursor: onScrollToMessage ? 'pointer' : 'default',
                  borderRadius: '0 4px 4px 0',
                  backgroundColor: isOwn ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.06)',
                  padding: '4px 8px',
                }}
                onClick={() => {
                  if (onScrollToMessage && message.replyTo?.messageId) {
                    onScrollToMessage(message.replyTo.messageId);
                  }
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {message.replyTo.senderName || 'Unknown'}
                </div>
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.85 }}>
                  {message.replyTo.type !== 'text' && !message.replyTo.content
                    ? `[${message.replyTo.type}]`
                    : message.replyTo.content || `[${message.replyTo.type}]`}
                </div>
              </div>
          )}
          {renderContent()}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 4,
              opacity: 0.7,
              fontSize: 11,
            }}
          >
            {/* Left side (e.g. video note duration) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
               {message.type === 'video_note' && message.duration !== undefined && (
                  <span style={{ fontWeight: 600 }}>
                     {Math.floor(message.duration / 60)}:{String(message.duration % 60).padStart(2, '0')}
                  </span>
               )}
            </div>

            {/* Right side (timestamp, pinned, status) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {isPinned && !message.deleted && (
                <Pin size={11} style={{ opacity: 0.8, flexShrink: 0 }} />
              )}
              <span>{formatTime(message.timestamp)}</span>
              {message.isEdited && !message.deleted && (
                <span style={{ fontSize: 10, opacity: 0.65, fontStyle: 'italic' }}>edited</span>
              )}
              {isOwn && !message.deleted && otherUserShowMessageStatus && (
                <span style={{ display: 'flex', alignItems: 'center', marginLeft: 1 }}>
                  {message.readBy.length > 1
                    ? (
                      // Double tick — read (blue)
                      <svg width="15" height="11" viewBox="0 0 15 11" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1 5.5L4.5 9L10 2" stroke="#363ef1" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M5 5.5L8.5 9L14 2" stroke="#363ef1" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )
                    : (message.deliveredTo ?? []).length > 0
                      ? (
                        // Double tick — delivered (dim)
                        <svg width="15" height="11" viewBox="0 0 15 11" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ opacity: 0.55 }}>
                          <path d="M1 5.5L4.5 9L10 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M5 5.5L8.5 9L14 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )
                      : (
                        // Single tick — sent (dim)
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ opacity: 0.55 }}>
                          <path d="M1.5 5.5L4.5 8.5L9.5 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )
                  }
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ─── Reaction Pill Badges ──────────────────────────────────────── */}
        {reactionEntries.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 4,
              marginTop: 4,
              justifyContent: isOwn ? 'flex-end' : 'flex-start',
            }}
          >
            {reactionEntries.map(([emoji, users]) => {
              const iMine = currentUserId ? users.includes(currentUserId) : false;
              const isHovered = tooltipEmoji === emoji;
              const names = getUserName
                ? users.map(id => getUserName(id)).filter(Boolean).join(', ')
                : `${users.length} ${users.length === 1 ? 'person' : 'people'}`;
              return (
                <div key={emoji} style={{ position: 'relative', display: 'inline-flex' }}>
                  {/* Tooltip */}
                  {isHovered && (
                    <div style={{
                      position: 'absolute',
                      bottom: '110%',
                      [isOwn ? 'right' : 'left']: 0,
                      backgroundColor: 'rgba(0,0,0,0.85)',
                      color: '#fff',
                      fontSize: 11,
                      padding: '4px 8px',
                      borderRadius: 6,
                      whiteSpace: 'nowrap',
                      pointerEvents: 'none',
                      zIndex: 300,
                      backdropFilter: 'blur(4px)',
                      maxWidth: 200,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {names}
                    </div>
                  )}
                  <button
                    onClick={() => onMessageReaction?.(message.messageId, emoji)}
                    onMouseEnter={() => setTooltipEmoji(emoji)}
                    onMouseLeave={() => setTooltipEmoji(null)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 8px',
                      borderRadius: 16,
                      backgroundColor: iMine ? 'rgba(var(--accent-rgb, 99, 102, 241), 0.15)' : 'var(--bg-tertiary)',
                      border: `1px solid ${iMine ? 'rgba(var(--accent-rgb, 99, 102, 241), 0.4)' : 'var(--border)'}`,
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'transform 0.1s, background-color 0.2s',
                    }}
                    onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.95)')}
                    onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  >
                    <span style={{ fontSize: 13, lineHeight: 1 }}>{emoji}</span>
                    {users.length > 1 && (
                      <span style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: iMine ? 'var(--accent)' : 'var(--text-secondary)'
                      }}>
                        {users.length}
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>

    {ctxMenu && (
      <MessageContextMenu
        message={message}
        x={ctxMenu.x}
        y={ctxMenu.y}
        onClose={() => closeCtxMenu()}
        isOwn={isOwn}
        bookmarked={bookmarked}
        isPinned={isPinned}
        onReply={onReply}
        onForward={onForward}
        onBookmark={handleBookmark}
        onPin={onPin}
        onDelete={onDelete}
        onStartEdit={onStartEdit}
        onCopy={handleCopy}
        onDownload={onDownload}
        onEnterSelect={onEnterSelect}
        onMessageReaction={onMessageReaction}
        onCloseChat={onCloseChat}
      />
    )}

    {/* ─── Reaction animation keyframes ─────────────────────────────────── */}
    <style>{`
      @keyframes reactionBarSlideUp {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes reactionPop {
        0%   { transform: scale(0.6); opacity: 0; }
        70%  { transform: scale(1.15); }
        100% { transform: scale(1);   opacity: 1; }
      }
      @media (max-width: 600px) {
        .message-bubble-content { maxWidth: 88% !important; }
        .bubble-own, .bubble-other { padding: 6px 10px !important; font-size: 13.5px !important; }
        .message-bubble-wrapper { padding: 0 8px !important; }
      }
    `}</style>
    </>
  );
};

const menuItemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '10px 16px',
  background: 'none',
  border: 'none',
  textAlign: 'left',
  cursor: 'pointer',
  fontSize: 14,
  color: 'var(--text-primary)',
};

/** Splits `text` and wraps occurrences of `query` in a yellow highlight span. */
const highlightText = (text: string, query?: string): React.ReactNode => {
  if (!query || !query.trim()) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} style={{ backgroundColor: '#facc15', color: '#1a1a1a', borderRadius: 2, padding: '0 1px' }}>
        {part}
      </mark>
    ) : (
      part
    ),
  );
};

/** Detects URLs in text and makes them clickable, while also highlighting search queries. */
/** Detects if a string consists ONLY of 1-3 emojis */
const isOnlyEmoji = (text: string): { only: boolean; count: number } => {
  if (!text) return { only: false, count: 0 };
  const trimmed = text.trim();
  // Robust emoji regex that handles variation selectors, skin tones, and ZWJ sequences
  // Updated to be more comprehensive for modern emojis
  const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g;
  const matches = trimmed.match(emojiRegex);
  
  if (!matches) return { only: false, count: 0 };
  
  // Remove all emojis and whitespace to see if anything else remains
  const remaining = trimmed.replace(emojiRegex, '').replace(/\s/g, '');
  const only = remaining.length === 0 && matches.length >= 1 && matches.length <= 3;
  
  return { only, count: matches.length };
};

export const renderMessageText = (text: string, query?: string, isOwn?: boolean, onMentionClick?: (text: string, type: 'username' | 'email') => void): React.ReactNode => {
  if (!text) return null;

  const { only, count } = isOnlyEmoji(text);
  if (only) {
    const fontSize = count === 1 ? 48 : count === 2 ? 40 : 32;
    return (
      <div style={{ 
        fontSize, 
        lineHeight: 1.1, 
        padding: '12px 0 8px',
        animation: 'emojiPop 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275) both',
        display: 'block',
        textAlign: isOwn ? 'right' : 'left',
        userSelect: 'none',
      }}>
        {text}
        <style>{`
          @keyframes emojiPop {
            0% { transform: scale(0.4) rotate(-5deg); opacity: 0; }
            70% { transform: scale(1.1) rotate(2deg); }
            100% { transform: scale(1) rotate(0deg); opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  // First, handle multi-line code blocks before splitting by lines
  const codeBlockRegex = /```\n?([\s\S]*?)\n?```/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let partIndex = 0;
  
  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Add text before the code block
    if (match.index > lastIndex) {
      const beforeText = text.substring(lastIndex, match.index);
      parts.push(
        <React.Fragment key={`before-${partIndex}`}>
          {renderTextWithFormatting(beforeText, query, isOwn, onMentionClick)}
        </React.Fragment>
      );
      partIndex++;
    }
    
    // Add the code block
    const codeContent = match[1];
    parts.push(
      <pre
        key={`codeblock-${partIndex}`}
        style={{
          backgroundColor: 'rgba(255,255,255,0.1)',
          padding: '8px 12px',
          borderRadius: 6,
          fontFamily: 'monospace',
          fontSize: '0.9em',
          overflowX: 'auto',
          margin: '4px 0',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word'
        }}
      >
        <code>{codeContent}</code>
      </pre>
    );
    partIndex++;
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    const remainingText = text.substring(lastIndex);
    parts.push(
      <React.Fragment key={`remaining-${partIndex}`}>
        {renderTextWithFormatting(remainingText, query, isOwn, onMentionClick)}
      </React.Fragment>
    );
  }
  
  return parts.length > 0 ? parts : renderTextWithFormatting(text, query, isOwn, onMentionClick);
};

/** Render text with line breaks and inline formatting */
const renderTextWithFormatting = (text: string, query?: string, isOwn?: boolean, onMentionClick?: (text: string, type: 'username' | 'email') => void): React.ReactNode => {
  // First check for spoilers (can span multiple lines)
  const spoilerRegex = /\|\|([\s\S]+?)\|\|/;
  const spoilerMatch = text.match(spoilerRegex);
  
  if (spoilerMatch && spoilerMatch.index !== undefined) {
    const before = text.substring(0, spoilerMatch.index);
    const spoilerContent = spoilerMatch[1];
    const after = text.substring(spoilerMatch.index + spoilerMatch[0].length);
    
    return (
      <>
        {renderTextWithFormatting(before, query, isOwn, onMentionClick)}
        <SpoilerText>
          {renderTextWithFormatting(spoilerContent, query, isOwn, onMentionClick)}
        </SpoilerText>
        {renderTextWithFormatting(after, query, isOwn, onMentionClick)}
      </>
    );
  }
  
  // Then handle line breaks
  const lines = text.split('\n');

  return lines.map((line, lineIndex) => (
    <React.Fragment key={`line-${lineIndex}`}>
      {lineIndex > 0 && <br />}
      {(() => {
        // Check if line starts with list markers or quote
        const numberedListMatch = line.match(/^(\d+)\.\s+(.*)$/);
        const bulletListMatch = line.match(/^•\s+(.*)$/);
        const quoteMatch = line.match(/^>\s+(.*)$/);
        
        let lineContent = line;
        let linePrefix: React.ReactNode = null;
        
        if (numberedListMatch) {
          linePrefix = <span style={{ marginRight: 6, fontWeight: 600 }}>{numberedListMatch[1]}.</span>;
          lineContent = numberedListMatch[2];
        } else if (bulletListMatch) {
          linePrefix = <span style={{ marginRight: 6 }}>•</span>;
          lineContent = bulletListMatch[1];
        } else if (quoteMatch) {
          lineContent = quoteMatch[1];
          return (
            <div style={{ 
              borderLeft: '3px solid var(--accent)', 
              paddingLeft: 10, 
              marginLeft: 4,
              opacity: 0.8,
              fontStyle: 'italic'
            }}>
              {parseInlineFormatting(lineContent, query, isOwn, onMentionClick)}
            </div>
          );
        }
        
        return (
          <>
            {linePrefix}
            {parseInlineFormatting(lineContent, query, isOwn, onMentionClick)}
          </>
        );
      })()}
    </React.Fragment>
  ));
};

/** Parse inline formatting (bold, italic, strikethrough, underline, inline code, URLs) with support for multiple formats */
const parseInlineFormatting = (text: string, query?: string, isOwn?: boolean, onMentionClick?: (text: string, type: 'username' | 'email') => void): React.ReactNode => {
  if (!text) return null;
  
  // Priority order: Markdown Links > URLs > Emails > Mentions > Code > Combined text formatting
  
  // 0. First, handle markdown-style links [text](url)
  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/;
  const markdownMatch = text.match(markdownLinkRegex);
  if (markdownMatch && markdownMatch.index !== undefined) {
    const before = text.substring(0, markdownMatch.index);
    const linkText = markdownMatch[1];
    const linkUrl = markdownMatch[2];
    const after = text.substring(markdownMatch.index + markdownMatch[0].length);
    
    return (
      <>
        {parseInlineFormatting(before, query, isOwn, onMentionClick)}
        <span
          onClick={async (e) => {
            e.stopPropagation();
            e.preventDefault();
            // Check if we're in Electron environment
            if (window.electronAPI?.openExternalUrl) {
              try {
                await window.electronAPI.openExternalUrl(linkUrl);
              } catch (err) {
                console.error('Error calling openExternalUrl:', err);
                window.open(linkUrl, '_blank', 'noopener,noreferrer');
              }
            } else {
              // Web browser - use standard window.open
              window.open(linkUrl, '_blank', 'noopener,noreferrer');
            }
          }}
          style={{ 
            color: isOwn ? '#fff' : 'var(--accent)', 
            textDecoration: 'underline', 
            cursor: 'pointer',
            transition: 'opacity 0.2s',
            fontWeight: 500
          }}
          title={linkUrl}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          {highlightText(linkText, query)}
        </span>
        {parseInlineFormatting(after, query, isOwn, onMentionClick)}
      </>
    );
  }
  
  // 1. Handle plain URLs (highest priority - no formatting inside URLs)
  const urlRegex = /(https?:\/\/[^\s]+)/;
  const urlMatch = text.match(urlRegex);
  if (urlMatch && urlMatch.index !== undefined) {
    const before = text.substring(0, urlMatch.index);
    const url = urlMatch[0];
    const after = text.substring(urlMatch.index + url.length);
    
    return (
      <>
        {parseInlineFormatting(before, query, isOwn, onMentionClick)}
        <span
          onClick={async (e) => {
            e.stopPropagation();
            e.preventDefault();
            // Check if we're in Electron environment
            if (window.electronAPI?.openExternalUrl) {
              try {
                await window.electronAPI.openExternalUrl(url);
              } catch (err) {
                console.error('Error calling openExternalUrl:', err);
                window.open(url, '_blank', 'noopener,noreferrer');
              }
            } else {
              // Web browser - use standard window.open
              window.open(url, '_blank', 'noopener,noreferrer');
            }
          }}
          style={{ 
            color: 'var(--text-primary)', 
            textDecoration: 'underline', 
            cursor: 'pointer',
            transition: 'opacity 0.2s'
          }}
          title={url}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          {highlightText(url, query)}
        </span>
        {parseInlineFormatting(after, query, isOwn, onMentionClick)}
      </>
    );
  }
  
  // 1.1 Handle emails
  const emailRegex = /\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,})\b/;
  const emailMatch = text.match(emailRegex);
  if (emailMatch && emailMatch.index !== undefined) {
    const before = text.substring(0, emailMatch.index);
    const email = emailMatch[0];
    const after = text.substring(emailMatch.index + email.length);
    return (
      <>
        {parseInlineFormatting(before, query, isOwn, onMentionClick)}
        <span
          onClick={(e) => {
            e.stopPropagation();
            if (onMentionClick) {
              onMentionClick(email, 'email');
            }
          }}
          style={{ 
            color: isOwn ? '#fff' : 'var(--accent)', 
            textDecoration: 'underline', 
            cursor: 'pointer',
            transition: 'opacity 0.2s',
            fontWeight: 500
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          {highlightText(email, query)}
        </span>
        {parseInlineFormatting(after, query, isOwn, onMentionClick)}
      </>
    );
  }

  // 1.2 Handle mentions (@username)
  const mentionRegex = /@([a-zA-Z0-9._]+)/;
  const mentionMatch = text.match(mentionRegex);
  if (mentionMatch && mentionMatch.index !== undefined) {
    const before = text.substring(0, mentionMatch.index);
    const mention = mentionMatch[0];
    const username = mentionMatch[1];
    const after = text.substring(mentionMatch.index + mention.length);
    return (
      <>
        {parseInlineFormatting(before, query, isOwn, onMentionClick)}
        <span
          onClick={(e) => {
            e.stopPropagation();
            if (onMentionClick) {
              onMentionClick(username, 'username');
            }
          }}
          style={{ 
            color: isOwn ? '#fff' : 'var(--accent)', 
            textDecoration: 'underline', 
            cursor: 'pointer',
            transition: 'opacity 0.2s',
            fontWeight: 600
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          {highlightText(mention, query)}
        </span>
        {parseInlineFormatting(after, query, isOwn, onMentionClick)}
      </>
    );
  }
  
  // 2. Handle inline code (no formatting inside code)
  const codeRegex = /`([^`]+)`/;
  const codeMatch = text.match(codeRegex);
  if (codeMatch && codeMatch.index !== undefined) {
    const before = text.substring(0, codeMatch.index);
    const codeText = codeMatch[1];
    const after = text.substring(codeMatch.index + codeMatch[0].length);
    
    return (
      <>
        {parseInlineFormatting(before, query, isOwn, onMentionClick)}
        <code
          style={{
            backgroundColor: 'rgba(255,255,255,0.1)',
            padding: '2px 6px',
            borderRadius: 4,
            fontFamily: 'monospace',
            fontSize: '0.9em'
          }}
        >
          {highlightText(codeText, query)}
        </code>
        {parseInlineFormatting(after, query, isOwn, onMentionClick)}
      </>
    );
  }
  
  // 3. Handle combined text formatting using bitwise flags (including spoiler)
  // Match any combination of formatting markers around text
  // Pattern: [markers]content[markers] where markers can be *, _, __, ~, ||
  
  // Try to find the longest valid formatting pattern
  let bestMatch: { start: number; end: number; flags: number; content: string; openLen: number; closeLen: number; rawContent: string } | null = null;
  
  for (let i = 0; i < text.length; i++) {
    // Try to match opening markers starting at position i
    let openMarkers = '';
    let pos = i;
    
    // Collect opening markers (*, _, ~, |)
    while (pos < text.length && (text[pos] === '*' || text[pos] === '_' || text[pos] === '~' || text[pos] === '|')) {
      openMarkers += text[pos];
      pos++;
    }
    
    if (openMarkers.length === 0) continue;
    
    const contentStart = pos;
    
    // Now we need to find matching closing markers
    // We'll search for a position where we have enough closing markers to match the opening
    for (let endPos = contentStart + 1; endPos <= text.length; endPos++) {
      // Look backwards from endPos to collect closing markers
      let closePos = endPos - 1;
      let closeMarkers = '';
      
      while (closePos >= contentStart && (text[closePos] === '*' || text[closePos] === '_' || text[closePos] === '~' || text[closePos] === '|')) {
        closeMarkers = text[closePos] + closeMarkers;
        closePos--;
      }
      
      if (closeMarkers.length === 0) continue;
      
      const rawContent = text.substring(contentStart, closePos + 1);
      if (rawContent.length === 0) continue;
      
      // Analyze ALL markers (opening + closing + any inside content)
      const allText = text.substring(i, endPos);
      let flags = 0;
      
      // Count occurrences of each marker type in the entire matched region
      const asteriskCount = (allText.match(/\*/g) || []).length;
      const underscoreCount = (allText.match(/_/g) || []).length;
      const tildeCount = (allText.match(/~/g) || []).length;
      const pipeCount = (allText.match(/\|/g) || []).length;
      
      // Bold: at least 2 asterisks
      if (asteriskCount >= 2) {
        flags |= 0b00001;
      }
      
      // Italic: odd number of underscores (after removing pairs for underline)
      // Underline: at least 4 underscores (__ on each side)
      if (underscoreCount >= 4) {
        flags |= 0b00100; // underline
        const remaining = underscoreCount - 4;
        if (remaining >= 2) {
          flags |= 0b00010; // italic
        }
      } else if (underscoreCount >= 2) {
        flags |= 0b00010; // italic
      }
      
      // Strikethrough: at least 2 tildes
      if (tildeCount >= 2) {
        flags |= 0b01000;
      }
      
      // Spoiler: at least 4 pipes (|| on each side)
      if (pipeCount >= 4) {
        flags |= 0b10000;
      }
      
      // Only consider this a valid match if we detected at least one format
      if (flags > 0) {
        const matchLength = endPos - i;
        // Check if this is a better match than what we found before
        if (!bestMatch || matchLength > (bestMatch.end - bestMatch.start)) {
          bestMatch = {
            start: i,
            end: endPos,
            flags: flags,
            content: rawContent,
            openLen: openMarkers.length,
            closeLen: closeMarkers.length,
            rawContent: rawContent
          };
        }
      }
    }
  }
  
  if (bestMatch) {
    const before = text.substring(0, bestMatch.start);
    const after = text.substring(bestMatch.end);
    
    // Apply formats based on flags
    let formattedContent: React.ReactNode = parseInlineFormatting(bestMatch.content, query, isOwn, onMentionClick);
    
    // Apply in order: bold, italic, underline, strikethrough, spoiler (outermost)
    if (bestMatch.flags & 0b00001) { // bold
      formattedContent = <strong>{formattedContent}</strong>;
    }
    if (bestMatch.flags & 0b00010) { // italic
      formattedContent = <em>{formattedContent}</em>;
    }
    if (bestMatch.flags & 0b00100) { // underline
      formattedContent = <span style={{ textDecoration: 'underline' }}>{formattedContent}</span>;
    }
    if (bestMatch.flags & 0b01000) { // strikethrough
      formattedContent = <span style={{ textDecoration: 'line-through' }}>{formattedContent}</span>;
    }
    if (bestMatch.flags & 0b10000) { // spoiler (applied last, wraps everything)
      formattedContent = <SpoilerText>{formattedContent}</SpoilerText>;
    }
    
    return (
      <>
        {parseInlineFormatting(before, query, isOwn, onMentionClick)}
        {formattedContent}
        {parseInlineFormatting(after, query, isOwn, onMentionClick)}
      </>
    );
  }
  
  // 4. Fallback to individual format matching (for non-symmetric patterns)
  const formatMatches = [];
  
  // Bold: *text*
  const boldMatch = text.match(/\*([^*\n]+)\*/);
  if (boldMatch && boldMatch.index !== undefined) {
    formatMatches.push({ type: 'bold', match: boldMatch, index: boldMatch.index });
  }
  
  // Italic: _text_ (but not __text__)
  let italicIndex = 0;
  while (italicIndex < text.length) {
    const searchText = text.substring(italicIndex);
    const italicMatch = searchText.match(/_([^_\n]+)_/);
    if (italicMatch && italicMatch.index !== undefined) {
      const actualIndex = italicIndex + italicMatch.index;
      const beforeChar = actualIndex > 0 ? text[actualIndex - 1] : '';
      const afterEndIndex = actualIndex + italicMatch[0].length;
      const afterChar = afterEndIndex < text.length ? text[afterEndIndex] : '';
      
      if (beforeChar !== '_' && afterChar !== '_') {
        formatMatches.push({ 
          type: 'italic', 
          match: italicMatch, 
          index: actualIndex,
          fullMatch: italicMatch[0]
        });
        break;
      }
      italicIndex = actualIndex + 1;
    } else {
      break;
    }
  }
  
  // Underline: __text__
  const underlineMatch = text.match(/__([^_\n]+?)__/);
  if (underlineMatch && underlineMatch.index !== undefined) {
    formatMatches.push({ type: 'underline', match: underlineMatch, index: underlineMatch.index });
  }
  
  // Strikethrough: ~text~
  const strikeMatch = text.match(/~([^~\n]+)~/);
  if (strikeMatch && strikeMatch.index !== undefined) {
    formatMatches.push({ type: 'strikethrough', match: strikeMatch, index: strikeMatch.index });
  }
  
  formatMatches.sort((a, b) => a.index - b.index);
  
  if (formatMatches.length > 0) {
    const first = formatMatches[0];
    const match = first.match!;
    const before = text.substring(0, first.index);
    const formattedText = match[1];
    const after = text.substring(first.index + match[0].length);
    
    let wrappedContent: React.ReactNode;
    
    switch (first.type) {
      case 'bold':
        wrappedContent = <strong>{parseInlineFormatting(formattedText, query, isOwn, onMentionClick)}</strong>;
        break;
      case 'italic':
        wrappedContent = <em>{parseInlineFormatting(formattedText, query, isOwn, onMentionClick)}</em>;
        break;
      case 'underline':
        wrappedContent = <span style={{ textDecoration: 'underline' }}>{parseInlineFormatting(formattedText, query, isOwn, onMentionClick)}</span>;
        break;
      case 'strikethrough':
        wrappedContent = <span style={{ textDecoration: 'line-through' }}>{parseInlineFormatting(formattedText, query, isOwn, onMentionClick)}</span>;
        break;
      default:
        wrappedContent = parseInlineFormatting(formattedText, query, isOwn, onMentionClick);
    }
    
    return (
      <>
        {parseInlineFormatting(before, query, isOwn, onMentionClick)}
        {wrappedContent}
        {parseInlineFormatting(after, query, isOwn, onMentionClick)}
      </>
    );
  }
  
  // No formatting found, return highlighted text
  return highlightText(text, query);
};

export default MessageBubble;
