import React, { useState, useEffect, useRef } from 'react';

interface SpoilerTextProps {
  children: React.ReactNode;
}

const SpoilerText: React.FC<SpoilerTextProps> = ({ children }) => {
  const [isRevealed, setIsRevealed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLSpanElement>(null);
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

  useEffect(() => {
    if (isRevealed) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match container
    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };
    updateSize();
    
    // Update size on window resize or content change
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);

    // Create more particles for premium effect
    const particleCount = Math.max(30, Math.floor((canvas.width * canvas.height) / 80));
    particlesRef.current = Array.from({ length: particleCount }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 0.3 + 0.2;
      return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 2.5 + 0.5,
        opacity: Math.random() * 0.6 + 0.4,
        baseOpacity: Math.random() * 0.6 + 0.4,
        angle: angle,
        speed: speed
      };
    });

    // Premium animation loop with glow effects
    const animate = () => {
      timeRef.current += 0.016; // ~60fps
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particlesRef.current.forEach((particle, index) => {
        // Update position with smooth motion
        particle.x += particle.vx;
        particle.y += particle.vy;

        // Wrap around edges smoothly
        if (particle.x < -10) particle.x = canvas.width + 10;
        if (particle.x > canvas.width + 10) particle.x = -10;
        if (particle.y < -10) particle.y = canvas.height + 10;
        if (particle.y > canvas.height + 10) particle.y = -10;

        // Pulsating opacity for premium effect
        const pulse = Math.sin(timeRef.current * 2 + index * 0.5) * 0.2;
        particle.opacity = particle.baseOpacity + pulse;

        // Draw particle with glow effect
        const gradient = ctx.createRadialGradient(
          particle.x, particle.y, 0,
          particle.x, particle.y, particle.size * 3
        );
        gradient.addColorStop(0, `rgba(255, 255, 255, ${particle.opacity})`);
        gradient.addColorStop(0.5, `rgba(255, 255, 255, ${particle.opacity * 0.3})`);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * 3, 0, Math.PI * 2);
        ctx.fill();

        // Draw core particle
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, particle.opacity * 1.5)})`;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      resizeObserver.disconnect();
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isRevealed]);

  const handleClick = () => {
    // Only reveal once, don't toggle back
    if (!isRevealed) {
      setIsRevealed(true);
    }
  };

  return (
    <span
      ref={containerRef}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'relative',
        display: 'inline-block',
        cursor: isRevealed ? 'default' : 'pointer',
        userSelect: isRevealed ? 'text' : 'none',
        backgroundColor: isRevealed 
          ? 'transparent' 
          : isHovered 
            ? 'rgba(255, 255, 255, 0.15)' 
            : 'rgba(255, 255, 255, 0.1)',
        borderRadius: 6,
        padding: '3px 6px',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        boxShadow: isRevealed 
          ? 'none' 
          : isHovered 
            ? '0 0 12px rgba(255, 255, 255, 0.2), inset 0 0 8px rgba(255, 255, 255, 0.1)' 
            : '0 0 8px rgba(255, 255, 255, 0.1), inset 0 0 4px rgba(255, 255, 255, 0.05)',
        border: isRevealed 
          ? 'none' 
          : '1px solid rgba(255, 255, 255, 0.15)',
        transform: isHovered && !isRevealed ? 'scale(1.02)' : 'scale(1)',
      }}
    >
      {!isRevealed && (
        <>
          <canvas
            ref={canvasRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              borderRadius: 6,
              mixBlendMode: 'screen',
            }}
          />
          {/* Shimmer effect overlay */}
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
              borderRadius: 6,
            }}
          />
        </>
      )}
      <span
        style={{
          color: isRevealed ? 'inherit' : 'transparent',
          filter: isRevealed ? 'none' : 'blur(5px)',
          transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          textShadow: isRevealed 
            ? 'none' 
            : '0 0 10px rgba(255,255,255,0.6), 0 0 20px rgba(255,255,255,0.3)',
          whiteSpace: 'pre-wrap',
          display: 'inline-block',
          transform: isRevealed ? 'scale(1)' : 'scale(0.98)',
        }}
      >
        {children}
      </span>
      
      {/* Add keyframes for shimmer animation */}
      <style>{`
        @keyframes shimmer {
          0% { left: 0%; }
          50%, 100% { left: 0%; }
        }
      `}</style>
    </span>
  );
};

export default SpoilerText;
