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

  return (
    <div className="connection-test">
      <h3>WebRTC Connection Test</h3>
      <p>Test your network connectivity for voice/video calls</p>
      
      <button 
        onClick={runTest} 
        disabled={testing}
        className="test-button"
      >
        {testing ? 'Testing...' : 'Test Connection'}
      </button>

      {result && (
        <div className="test-results">
          <h4>Test Results:</h4>
          <div className={`result-item ${result.stunWorking ? 'success' : 'error'}`}>
            <span>STUN Server: </span>
            <span>{result.stunWorking ? '✅ Working' : '❌ Failed'}</span>
          </div>
          
          {result.publicIP && (
            <div className="result-item">
              <span>Public IP: </span>
              <span>{result.publicIP}</span>
            </div>
          )}
          
          <div className="recommendations">
            <h5>Recommendations:</h5>
            {result.stunWorking ? (
              <p>✅ Basic connectivity is working. Calls should work on most networks.</p>
            ) : (
              <div>
                <p>❌ STUN server connection failed. This may cause issues with calls.</p>
                <p>Possible solutions:</p>
                <ul>
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

      <style jsx>{`
        .connection-test {
          padding: 20px;
          border: 1px solid #ddd;
          border-radius: 8px;
          margin: 20px 0;
        }
        
        .test-button {
          background: #007bff;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 4px;
          cursor: pointer;
          margin: 10px 0;
        }
        
        .test-button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        
        .test-results {
          margin-top: 20px;
          padding: 15px;
          background: #f8f9fa;
          border-radius: 4px;
        }
        
        .result-item {
          margin: 10px 0;
          padding: 5px;
        }
        
        .result-item.success {
          color: #28a745;
        }
        
        .result-item.error {
          color: #dc3545;
        }
        
        .recommendations {
          margin-top: 15px;
          padding-top: 15px;
          border-top: 1px solid #ddd;
        }
        
        .recommendations ul {
          margin: 10px 0;
          padding-left: 20px;
        }
      `}</style>
    </div>
  );
};