import React, { useState } from 'react';
import { testConnectivity } from '../services/webrtcService';

interface ConnectionTestResult {
  stunWorking: boolean;
  turnWorking: boolean;
  publicIP?: string;
}

export const ConnectionTest: React.FC = () => {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ConnectionTestResult | null>(null);

  const runTest = async () => {
    setTesting(true);
    setResult(null);
    
    try {
      const testResult = await testConnectivity();
      setResult(testResult);
    } catch (error) {
      console.error('Connection test failed:', error);
    } finally {
      setTesting(false);
    }
  };

  const styles = {
    container: {
      padding: '20px',
      border: '1px solid #ddd',
      borderRadius: '8px',
      margin: '20px 0',
    },
    button: {
      background: testing ? '#ccc' : '#007bff',
      color: 'white',
      border: 'none',
      padding: '10px 20px',
      borderRadius: '4px',
      cursor: testing ? 'not-allowed' : 'pointer',
      margin: '10px 0',
    },
    results: {
      marginTop: '20px',
      padding: '15px',
      background: '#f8f9fa',
      borderRadius: '4px',
    },
    resultItem: {
      margin: '10px 0',
      padding: '5px',
    },
    success: {
      color: '#28a745',
    },
    error: {
      color: '#dc3545',
    },
    recommendations: {
      marginTop: '15px',
      paddingTop: '15px',
      borderTop: '1px solid #ddd',
    },
  };

  return (
    <div style={styles.container}>
      <h3>WebRTC Connection Test</h3>
      <p>Test your network connectivity for voice/video calls</p>
      
      <button 
        onClick={runTest} 
        disabled={testing}
        style={styles.button}
      >
        {testing ? 'Testing...' : 'Test Connection'}
      </button>

      {result && (
        <div style={styles.results}>
          <h4>Test Results:</h4>
          <div style={{...styles.resultItem, ...(result.stunWorking ? styles.success : styles.error)}}>
            <span>STUN Server: </span>
            <span>{result.stunWorking ? '✅ Working' : '❌ Failed'}</span>
          </div>
          
          {result.publicIP && (
            <div style={styles.resultItem}>
              <span>Public IP: </span>
              <span>{result.publicIP}</span>
            </div>
          )}
          
          <div style={styles.recommendations}>
            <h5>Recommendations:</h5>
            {result.stunWorking ? (
              <p>✅ Basic connectivity is working. Calls should work on most networks.</p>
            ) : (
              <div>
                <p>❌ STUN server connection failed. This may cause issues with calls.</p>
                <p>Possible solutions:</p>
                <ul style={{margin: '10px 0', paddingLeft: '20px'}}>
                  <li>Check your internet connection</li>
                  <li>Disable VPN temporarily</li>
                  <li>Check firewall settings</li>
                  <li>Contact your network administrator</li>
                </ul>
              </div>
            )}
            
            {!result.turnWorking && (
              <div>
                <p>ℹ️ TURN server not configured. This may cause issues on restrictive networks.</p>
                <p>For better connectivity, configure TURN servers in your environment variables.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};