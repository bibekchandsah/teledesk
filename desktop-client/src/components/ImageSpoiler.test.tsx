import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImageSpoiler from './ImageSpoiler';

/**
 * Bug Condition Exploration Test
 * 
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**
 * 
 * Property 1: Bug Condition - Spoiler State Persistence and Upload Preview UI
 * 
 * CRITICAL: This test MUST FAIL on unfixed code - failure confirms the bug exists
 * DO NOT attempt to fix the test or the code when it fails
 * NOTE: This test encodes the expected behavior - it will validate the fix when it passes after implementation
 * GOAL: Surface counterexamples that demonstrate the bug exists
 * 
 * Test Scenarios:
 * 1. State Persistence: Render ImageSpoiler, click to reveal (isRevealed=true), 
 *    unmount component, remount component → assert isRevealed=false and spoiler effects visible
 * 2. Upload Preview UI: Render ImageSpoiler with disableReveal=true → 
 *    assert shimmer effect is NOT visible and "SPOILER - Click to reveal" label is NOT visible
 */

describe('ImageSpoiler - Bug Condition Exploration', () => {
  beforeEach(() => {
    // Mock requestAnimationFrame for particle animation
    global.requestAnimationFrame = (cb: FrameRequestCallback) => {
      return setTimeout(() => cb(Date.now()), 16) as unknown as number;
    };
    global.cancelAnimationFrame = (id: number) => {
      clearTimeout(id);
    };
  });

  afterEach(() => {
    cleanup();
  });

  describe('Scenario 1: State Persistence Bug', () => {
    it('should reset spoiler to hidden state after component remount', async () => {
      const user = userEvent.setup();
      const testSrc = 'https://example.com/test-image.jpg';
      
      // First mount: Render ImageSpoiler
      const { unmount, container } = render(
        <ImageSpoiler src={testSrc} alt="Test spoiler" />
      );

      // Verify initial state: spoiler should be hidden with effects visible
      const initialImage = container.querySelector('img');
      expect(initialImage).toBeInTheDocument();
      expect(initialImage).toHaveStyle({ filter: 'blur(20px)' });
      
      // Verify spoiler label is visible
      expect(screen.getByText('SPOILER')).toBeInTheDocument();
      expect(screen.getByText('Click to reveal')).toBeInTheDocument();

      // Click to reveal the spoiler
      const spoilerContainer = container.firstChild as HTMLElement;
      await user.click(spoilerContainer);

      // Wait for state update
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify spoiler is revealed (no blur)
      const revealedImage = container.querySelector('img');
      expect(revealedImage).toHaveStyle({ filter: 'none' });
      
      // Verify label is hidden after reveal
      expect(screen.queryByText('SPOILER')).not.toBeInTheDocument();
      expect(screen.queryByText('Click to reveal')).not.toBeInTheDocument();

      // Unmount the component (simulates chat switch or page reload)
      unmount();

      // Remount the component (simulates returning to chat or page reload)
      const { container: newContainer } = render(
        <ImageSpoiler src={testSrc} alt="Test spoiler" />
      );

      // Wait for render
      await new Promise(resolve => setTimeout(resolve, 100));

      // EXPECTED BEHAVIOR: Spoiler should be hidden again with all effects visible
      const remountedImage = newContainer.querySelector('img');
      expect(remountedImage).toBeInTheDocument();
      
      // Assert: isRevealed should be false (blur should be applied)
      expect(remountedImage).toHaveStyle({ filter: 'blur(20px)' });
      
      // Assert: Spoiler effects should be visible
      expect(screen.getByText('SPOILER')).toBeInTheDocument();
      expect(screen.getByText('Click to reveal')).toBeInTheDocument();
      
      // Verify canvas for particles is present
      const canvas = newContainer.querySelector('canvas');
      expect(canvas).toBeInTheDocument();
    });
  });

  describe('Scenario 2: Upload Preview UI Bug', () => {
    it('should NOT display shimmer effect when disableReveal=true', () => {
      const testSrc = 'https://example.com/test-image.jpg';
      
      // Render ImageSpoiler with disableReveal=true (upload preview mode)
      const { container } = render(
        <ImageSpoiler src={testSrc} alt="Upload preview" disableReveal={true} />
      );

      // EXPECTED BEHAVIOR: Shimmer effect should NOT be visible
      // The shimmer is a div with linear-gradient background and shimmer animation
      const shimmerElement = container.querySelector('[style*="shimmer"]');
      
      // Assert: Shimmer effect should NOT be present in upload preview
      expect(shimmerElement).not.toBeInTheDocument();
    });

    it('should NOT display "SPOILER - Click to reveal" label when disableReveal=true', () => {
      const testSrc = 'https://example.com/test-image.jpg';
      
      // Render ImageSpoiler with disableReveal=true (upload preview mode)
      render(
        <ImageSpoiler src={testSrc} alt="Upload preview" disableReveal={true} />
      );

      // EXPECTED BEHAVIOR: Interactive label should NOT be visible
      // Assert: "SPOILER" label should NOT be present
      expect(screen.queryByText('SPOILER')).not.toBeInTheDocument();
      
      // Assert: "Click to reveal" label should NOT be present
      expect(screen.queryByText('Click to reveal')).not.toBeInTheDocument();
    });

    it('should display only blur and particles effects when disableReveal=true', () => {
      const testSrc = 'https://example.com/test-image.jpg';
      
      // Render ImageSpoiler with disableReveal=true (upload preview mode)
      const { container } = render(
        <ImageSpoiler src={testSrc} alt="Upload preview" disableReveal={true} />
      );

      // EXPECTED BEHAVIOR: Should show blur and particles, but NOT shimmer or label
      
      // Assert: Blur effect should be applied
      const image = container.querySelector('img');
      expect(image).toHaveStyle({ filter: 'blur(20px)' });
      
      // Assert: Particles canvas should be present
      const canvas = container.querySelector('canvas');
      expect(canvas).toBeInTheDocument();
      
      // Assert: Dark overlay should be present
      const overlay = container.querySelector('[style*="rgba(0, 0, 0, 0.4)"]');
      expect(overlay).toBeInTheDocument();
      
      // Assert: Shimmer should NOT be present
      const shimmer = container.querySelector('[style*="shimmer"]');
      expect(shimmer).not.toBeInTheDocument();
      
      // Assert: Label should NOT be present
      expect(screen.queryByText('SPOILER')).not.toBeInTheDocument();
      expect(screen.queryByText('Click to reveal')).not.toBeInTheDocument();
    });
  });
});
