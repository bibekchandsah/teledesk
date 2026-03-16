import React, { useState, useEffect, useRef } from 'react';

interface SpoilerTextProps {
  children: React.ReactNode;
}

const SpoilerText: React.FC<SpoilerTextProps> = ({ children }) => {
  const [isRevealed, setIsRevealed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLSpanElement>(null);
  const animationRef = useRef<number>();
  const particlesRef = useRef<Particle[]>([]);

  interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    opacity: number;
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

    // Create particles
    const particleCount = Math.floor((canvas.width * canvas.height) / 100);
    particlesRef.current = Array.from({ length: particleCount }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      size: Math.random() * 2 + 1,
      opacity: Math.random() * 0.5 + 0.3
    }));

    // Animation loop
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particlesRef.current.forEach(particle => {
        // Update position
        particle.x += particle.vx;
        particle.y += particle.vy;

        // Wrap around edges
        if (particle.x < 0) particle.x = canvas.width;
        if (particle.x > canvas.width) particle.x = 0;
        if (particle.y < 0) particle.y = canvas.height;
        if (particle.y > canvas.height) particle.y = 0;

        // Draw particle
        ctx.fillStyle = `rgba(255, 255, 255, ${particle.opacity})`;
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
    setIsRevealed(true);
  };

  return (
    <span
      ref={containerRef}
      onClick={handleClick}
      style={{
        position: 'relative',
        display: 'inline-block',
        cursor: isRevealed ? 'default' : 'pointer',
        userSelect: isRevealed ? 'text' : 'none',
        backgroundColor: isRevealed ? 'transparent' : 'rgba(255, 255, 255, 0.1)',
        borderRadius: 4,
        padding: '2px 4px',
        transition: 'background-color 0.3s',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word'
      }}
    >
      {!isRevealed && (
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none'
          }}
        />
      )}
      <span
        style={{
          color: isRevealed ? 'inherit' : 'transparent',
          filter: isRevealed ? 'none' : 'blur(4px)',
          transition: 'all 0.3s',
          textShadow: isRevealed ? 'none' : '0 0 8px rgba(255,255,255,0.5)',
          whiteSpace: 'pre-wrap'
        }}
      >
        {children}
      </span>
    </span>
  );
};

export default SpoilerText;
