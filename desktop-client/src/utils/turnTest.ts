/**
 * TURN Server Connectivity Test
 * Tests if TURN server is working properly
 */

export interface TurnTestResult {
  stunWorking: boolean;
  turnWorking: boolean;
  publicIP?: string;
  candidates: {
    host: number;
    srflx: number;
    relay: number;
  };
  errors: string[];
}

export const testTurnServer = async (
  turnUrl: string,
  username: string,
  credential: string
): Promise<TurnTestResult> => {
  const result: TurnTestResult = {
    stunWorking: false,
    turnWorking: false,
    candidates: { host: 0, srflx: 0, relay: 0 },
    errors: []
  };

  try {
    console.log('[TURN Test] Testing TURN server:', { turnUrl, username });

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
          urls: turnUrl,
          username: username,
          credential: credential
        }
      ]
    });

    const candidates: RTCIceCandidate[] = [];

    // Collect ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        candidates.push(event.candidate);
        
        console.log('[TURN Test] ICE candidate:', {
          type: event.candidate.type,
          protocol: event.candidate.protocol,
          address: event.candidate.address,
          port: event.candidate.port
        });

        // Count candidate types
        if (event.candidate.type === 'host') {
          result.candidates.host++;
        } else if (event.candidate.type === 'srflx') {
          result.candidates.srflx++;
          result.stunWorking = true;
          result.publicIP = event.candidate.address || undefined;
        } else if (event.candidate.type === 'relay') {
          result.candidates.relay++;
          result.turnWorking = true;
        }
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log('[TURN Test] Connection state:', pc.connectionState);
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[TURN Test] ICE connection state:', pc.iceConnectionState);
      
      if (pc.iceConnectionState === 'failed') {
        result.errors.push('ICE connection failed');
      }
    };

    // Create a dummy data channel to trigger ICE gathering
    pc.createDataChannel('test');
    
    // Create offer to start ICE gathering
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Wait for ICE gathering to complete
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        result.errors.push('ICE gathering timeout');
        resolve();
      }, 10000); // 10 second timeout

      pc.onicegatheringstatechange = () => {
        console.log('[TURN Test] ICE gathering state:', pc.iceGatheringState);
        
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timeout);
          resolve();
        }
      };
    });

    pc.close();

    // Analyze results
    console.log('[TURN Test] Results:', {
      candidates: result.candidates,
      stunWorking: result.stunWorking,
      turnWorking: result.turnWorking,
      publicIP: result.publicIP,
      errors: result.errors
    });

    return result;

  } catch (error) {
    console.error('[TURN Test] Error:', error);
    result.errors.push(`Test failed: ${error}`);
    return result;
  }
};

// Test current configuration
export const testCurrentTurnConfig = async (): Promise<TurnTestResult> => {
  const turnUrl = import.meta.env.VITE_TURN_URL || 'turn:openrelay.metered.ca:80';
  const username = import.meta.env.VITE_TURN_USERNAME || 'openrelayproject';
  const credential = import.meta.env.VITE_TURN_CREDENTIAL || 'openrelayproject';

  return testTurnServer(turnUrl, username, credential);
};