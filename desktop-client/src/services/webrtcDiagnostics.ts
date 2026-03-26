/**
 * WebRTC Connection Diagnostics
 * Helps troubleshoot network connectivity issues
 */

export interface ConnectionDiagnostics {
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  iceGatheringState: RTCIceGatheringState;
  localCandidates: RTCIceCandidate[];
  remoteCandidates: RTCIceCandidate[];
  selectedCandidatePair?: RTCIceCandidatePair;
}

export const addConnectionDiagnostics = (
  peer: any,
  onError: (err: Error) => void,
  label: string = 'WebRTC'
): void => {
  if (!peer._pc) return;
  
  const pc = peer._pc as RTCPeerConnection;
  const candidates: RTCIceCandidate[] = [];
  
  // Enhanced connection state monitoring using addEventListener to avoid overwriting simple-peer's handlers
  pc.addEventListener('connectionstatechange', () => {
    console.log(`[${label}] Connection state changed:`, pc.connectionState);
    
    if (pc.connectionState === 'failed') {
      console.error(`[${label}] Connection failed - likely NAT/firewall issue`);
      logDiagnostics(pc, candidates, label);
      onError(new Error('Connection failed - network connectivity issue'));
    } else if (pc.connectionState === 'connected') {
      console.log(`[${label}] Connection established successfully`);
      logSelectedCandidates(pc, label);
    }
  });
  
  pc.addEventListener('iceconnectionstatechange', () => {
    console.log(`[${label}] ICE connection state:`, pc.iceConnectionState);
    
    if (pc.iceConnectionState === 'failed') {
      console.error(`[${label}] ICE connection failed - TURN server may be needed`);
      logDiagnostics(pc, candidates, label);
    } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
      console.log(`[${label}] ICE connection established`);
      logSelectedCandidates(pc, label);
    }
  });
  
  pc.addEventListener('icegatheringstatechange', () => {
    console.log(`[${label}] ICE gathering state:`, pc.iceGatheringState);
  });
  
  // Track ICE candidates for diagnostics using addEventListener
  pc.addEventListener('icecandidate', (event) => {
    if (event.candidate) {
      candidates.push(event.candidate);
      console.log(`[${label}] ICE candidate:`, {
        type: event.candidate.type,
        protocol: event.candidate.protocol,
        address: event.candidate.address,
        port: event.candidate.port
      });
    }
  });
};

const logDiagnostics = (
  pc: RTCPeerConnection,
  candidates: RTCIceCandidate[],
  label: string
): void => {
  console.group(`[${label}] Connection Diagnostics`);
  
  console.log('Connection State:', pc.connectionState);
  console.log('ICE Connection State:', pc.iceConnectionState);
  console.log('ICE Gathering State:', pc.iceGatheringState);
  
  console.log('Local Candidates:', candidates.filter(c => c.type));
  
  // Check for TURN candidates
  const turnCandidates = candidates.filter(c => c.type === 'relay');
  if (turnCandidates.length === 0) {
    console.warn('No TURN (relay) candidates found - may have issues with restrictive NATs');
  } else {
    console.log('TURN candidates available:', turnCandidates.length);
  }
  
  // Check for host candidates (direct connection)
  const hostCandidates = candidates.filter(c => c.type === 'host');
  console.log('Host candidates:', hostCandidates.length);
  
  // Check for server reflexive candidates (STUN)
  const stunCandidates = candidates.filter(c => c.type === 'srflx');
  console.log('STUN candidates:', stunCandidates.length);
  
  console.groupEnd();
};

const logSelectedCandidates = async (pc: RTCPeerConnection, label: string): Promise<void> => {
  try {
    const stats = await pc.getStats();
    const candidatePairs: RTCIceCandidatePairStats[] = [];
    
    stats.forEach((report) => {
      if (report.type === 'candidate-pair' && report.state === 'succeeded') {
        candidatePairs.push(report as RTCIceCandidatePairStats);
      }
    });
    
    if (candidatePairs.length > 0) {
      console.log(`[${label}] Active candidate pairs:`, candidatePairs);
      
      // Find local and remote candidate details
      candidatePairs.forEach(async (pair) => {
        const localCandidate = Array.from(stats.values()).find(
          s => s.id === pair.localCandidateId
        ) as any; // RTCIceCandidateStats type varies by browser
        
        const remoteCandidate = Array.from(stats.values()).find(
          s => s.id === pair.remoteCandidateId
        ) as any; // RTCIceCandidateStats type varies by browser
        
        if (localCandidate && remoteCandidate) {
          console.log(`[${label}] Connection path:`, {
            local: `${localCandidate.candidateType} ${localCandidate.address}:${localCandidate.port}`,
            remote: `${remoteCandidate.candidateType} ${remoteCandidate.address}:${remoteCandidate.port}`,
            protocol: localCandidate.protocol
          });
        }
      });
    }
  } catch (error) {
    console.warn(`[${label}] Could not get connection stats:`, error);
  }
};

export const testConnectivity = async (): Promise<{
  stunWorking: boolean;
  turnWorking: boolean;
  publicIP?: string;
}> => {
  const result = {
    stunWorking: false,
    turnWorking: false,
    publicIP: undefined as string | undefined
  };
  
  try {
    // Test STUN server
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    
    const candidates: RTCIceCandidate[] = [];
    
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        candidates.push(event.candidate);
        
        if (event.candidate.type === 'srflx') {
          result.stunWorking = true;
          result.publicIP = event.candidate.address || undefined;
        }
      }
    };
    
    // Create a dummy data channel to trigger ICE gathering
    pc.createDataChannel('test');
    await pc.createOffer();
    
    // Wait for ICE gathering
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 5000);
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timeout);
          resolve();
        }
      };
    });
    
    pc.close();
    
    console.log('Connectivity test results:', result);
    return result;
    
  } catch (error) {
    console.error('Connectivity test failed:', error);
    return result;
  }
};