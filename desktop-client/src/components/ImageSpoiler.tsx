import React, { useState, useEffect, useRef } from 'react';
import { Expand } from 'lucide-react';

interface ImageSpoilerProps {
  src: string;
  alt?: string;
  onClick?: () => void;           // Called when user clicks the "open preview" icon (revealed state)
  style?: React.CSSProperties;
  disableReveal?: boolean;        // For upload preview — shows effect but doesn't allow revealing
  isVideo?: boolean;              // Render a <video> element instead of <img>
}

const ImageSpoiler: React.FC<ImageSpoilerProps> = ({
  src,
  alt,
  onClick,
  style,
  disableReveal = false,
  isVideo = false,
}) => {
  // Always start hidden — resets on component remount (chat switch / reload)
  const [isRevealed, setIsRevealed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>();
  const particlesRef = useRef<Particle[]>([]);
  const timeRef = useRef(0);

  interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    opacity: number;
    baseOpacity: number;
    angle: number;
    speed: number;
  }

  // Run particle animation whenever the spoiler overlay is visible AND in viewport
  useEffect(() => {
    const overlayVisible = !isRevealed || disableReveal;
    if (!overlayVisible) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let isVisible = true;
    const intersectionObserver = new IntersectionObserver((entries) => {
      isVisible = entries[0].isIntersecting;
    }, { threshold: 0.1 });
    intersectionObserver.observe(container);

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      canvas.width = rect.width;
      canvas.height = rect.height;
    };
    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);

    // Reduced particle count for performance (cap at 25)
    const particleCount = Math.min(25, Math.max(15, Math.floor((canvas.width * canvas.height) / 3000)));
    particlesRef.current = Array.from({ length: particleCount }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 0.4 + 0.2;
      return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.5 + 0.2,
        baseOpacity: Math.random() * 0.5 + 0.2,
        angle,
        speed,
      };
    });

    const animate = () => {
      if (!isVisible) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      timeRef.current += 0.016;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particlesRef.current.forEach((particle, index) => {
        particle.x += particle.vx;
        particle.y += particle.vy;

        if (particle.x < -10) particle.x = canvas.width + 10;
        if (particle.x > canvas.width + 10) particle.x = -10;
        if (particle.y < -10) particle.y = canvas.height + 10;
        if (particle.y > canvas.height + 10) particle.y = -10;

        const pulse = Math.sin(timeRef.current * 1.5 + index * 0.5) * 0.15;
        const currentOpacity = Math.max(0, Math.min(1, particle.opacity + pulse));

        // Simplified drawing: single circle per particle for performance
        ctx.fillStyle = `rgba(255, 255, 255, ${currentOpacity})`;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * 1.5, 0, Math.PI * 2);
        ctx.fill();
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isRevealed, disableReveal]);

  // ── Click on the spoiler container ───────────────────────────────────────
  const handleContainerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disableReveal) return;

    // Toggle visibility
    setIsRevealed(prev => !prev);
  };

  // ── Click on the "open preview" expand icon (only when revealed) ─────────
  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.();
  };

  const showOverlay = !isRevealed || disableReveal;

  return (
    <div
      ref={containerRef}
      onClick={handleContainerClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        cursor: disableReveal ? 'default' : 'pointer',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* ── Media element (image or video) ── */}
      {isVideo ? (
        <video
          src={src}
          muted
          playsInline
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: showOverlay ? 'blur(12px)' : 'none',
            transition: 'filter 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: showOverlay ? 'scale(1.05)' : 'scale(1)',
            pointerEvents: 'none',
            willChange: 'transform, filter',
          }}
        />
      ) : (
        <img
          src={src}
          alt={alt}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: showOverlay ? 'blur(12px)' : 'none',
            transition: 'filter 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: showOverlay ? 'scale(1.05)' : 'scale(1)',
            pointerEvents: 'none',
            willChange: 'transform, filter',
          }}
        />
      )}

      {/* ── Spoiler overlay (shown when hidden) ── */}
      {showOverlay && (
        <>
          {/* Dark tint */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.65)',
              transition: 'background-color 0.3s',
            }}
          />

          {/* Particle canvas */}
          <canvas
            ref={canvasRef}
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              mixBlendMode: 'screen',
            }}
          />

          {/* Shimmer sweep — only for real messages (not upload preview) */}
          {!disableReveal && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: '-100%',
                width: '100%',
                height: '100%',
                background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent)',
                animation: 'shimmer 3s infinite',
                pointerEvents: 'none',
              }}
            />
          )}

          {/* SPOILER label — only for real messages */}
          {!disableReveal && (
            <div
              // style={{
              //   position: 'absolute',
              //   top: '50%',
              //   left: '50%',
              //   transform: `translate(-50%, -50%) scale(${isHovered ? 1.05 : 1})`,
              //   backgroundColor: 'rgba(0, 0, 0, 0.7)',
              //   backdropFilter: 'blur(10px)',
              //   padding: '12px 24px',
              //   borderRadius: 12,
              //   border: '2px solid rgba(255, 255, 255, 0.3)',
              //   boxShadow: isHovered
              //     ? '0 0 20px rgba(255, 255, 255, 0.3), inset 0 0 10px rgba(255, 255, 255, 0.1)'
              //     : '0 0 15px rgba(255, 255, 255, 0.2), inset 0 0 8px rgba(255, 255, 255, 0.05)',
              //   transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              //   pointerEvents: 'none',
              // }}
            >
              {/* <div style={{
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                textAlign: 'center',
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.5)',
                letterSpacing: '0.5px',
              }}>
                SPOILER
              </div>
              <div style={{
                color: 'rgba(255, 255, 255, 0.8)',
                fontSize: 11,
                textAlign: 'center',
                marginTop: 4,
                textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
              }}>
                Click to reveal
              </div> */}
            </div>
          )}
        </>
      )}

      {/* ── "Open preview" expand icon — shown on hover when revealed ── */}
      {isRevealed && !disableReveal && onClick && isHovered && (
        <button
          onClick={handleExpandClick}
          title="Open preview"
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 32,
            height: 32,
            borderRadius: '50%',
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            cursor: 'pointer',
            transition: 'transform 0.15s, background-color 0.15s',
            zIndex: 10,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(0,0,0,0.8)'; (e.currentTarget as HTMLElement).style.transform = 'scale(1.1)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(0,0,0,0.6)'; (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
        >
          <Expand size={16} />
        </button>
      )}

      {/* Re-hide hint — shown below image when revealed (non-preview mode) */}
      {isRevealed && !disableReveal && isHovered && (
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '6px 10px',
          background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)',
          color: 'rgba(255,255,255,0.8)',
          fontSize: 11,
          textAlign: 'center',
          pointerEvents: 'none',
          transition: 'opacity 0.2s',
        }}>
          Click to hide again
        </div>
      )}

      <style>{`
        @keyframes shimmer {
          0% { left: -100%; }
          50%, 100% { left: 200%; }
        }
      `}</style>
    </div>
  );
};

export default ImageSpoiler;
