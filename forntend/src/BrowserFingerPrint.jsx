import React, { useState, useEffect, useRef } from 'react';
import FingerprintJS from '@fingerprintjs/fingerprintjs';
import axios from 'axios';

const App = ({setAppResponse}) => {
  const [mouseMovements, setMouseMovements] = useState([]);
  const [sessionStart] = useState(Date.now());
  const [userConsent, setUserConsent] = useState(false);
  const [collecting, setCollecting] = useState(false);

  // Use a ref to avoid stale closures in event listeners
  const mouseMovementsRef = useRef(mouseMovements);
  useEffect(() => {
    mouseMovementsRef.current = mouseMovements;
  }, [mouseMovements]);

  // Throttle function to limit event frequency
  const throttle = (func, limit) => {
    let inThrottle = false;
    return function (...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  };

  // Behavioral Analysis: Mouse Movement Tracking
  useEffect(() => {
    if (!userConsent) return;

    const handleMouseMove = throttle((event) => {
      // Use ref to avoid stale state inside the event callback
      if (mouseMovementsRef.current.length < 100) {
        setMouseMovements((prev) => [
          ...prev,
          { x: event.clientX, y: event.clientY, time: Date.now() },
        ]);
      }
    }, 100); // Throttle to every 100ms

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [userConsent]);

  // Advanced Fingerprinting: AudioContext Fingerprint
  const getAudioFingerprint = () => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const analyser = audioContext.createAnalyser();
      oscillator.connect(analyser);
      analyser.connect(audioContext.destination);
      oscillator.type = 'sine';
      oscillator.frequency.value = 1000;
      oscillator.start();
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);
      oscillator.stop();
      audioContext.close(); // Properly close the context
      return Array.from(dataArray).join('');
    } catch (error) {
      console.error('Error generating audio fingerprint:', error);
      return 'N/A';
    }
  };



  // Main Data Collection Function
  const collectUserData = async () => {
    if (!userConsent) {
      alert('Please provide consent to collect data.');
      return;
    }
    setCollecting(true);

    try {
      // Initialize FingerprintJS
      const fp = await FingerprintJS.load();
      const fpResult = await fp.get();

      // Collect advanced fingerprinting data
      const audioFingerprint = getAudioFingerprint();
      // const ipData = await getIPData();

      // Collect device and browser data
      const userData = {
        // Device Information
        deviceType: /Mobile/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop',
        os: navigator.platform,
        deviceMemory: navigator.deviceMemory || 'N/A',
        cpuCores: navigator.hardwareConcurrency || 'N/A',
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        pixelRatio: window.devicePixelRatio,
        touchSupport: navigator.maxTouchPoints > 0 ? 'Yes' : 'No',
        orientation: window.screen.orientation?.type || 'N/A',

        // Browser Information
        userAgent: navigator.userAgent,
        language: navigator.language,
        languages: navigator.languages,
        cookiesEnabled: navigator.cookieEnabled,
        doNotTrack: navigator.doNotTrack || 'N/A',
        webRTCEnabled: !!window.RTCPeerConnection,

        // Canvas Fingerprint
        canvasFingerprint: (() => {
          try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.fillStyle = '#f60';
            ctx.fillRect(125, 1, 62, 20);
            ctx.fillStyle = '#069';
            ctx.fillText('Test String', 2, 15);
            return canvas.toDataURL();
          } catch {
            return 'N/A';
          }
        })(),

        // WebGL Fingerprint
        webGLFingerprint: (() => {
          try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl');
            if (!gl) return 'N/A';
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            return {
              vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'N/A',
              renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'N/A',
            };
          } catch {
            return 'N/A';
          }
        })(),

        // Network Information
        connectionType: navigator.connection?.effectiveType || 'N/A',
        downlinkSpeed: navigator.connection?.downlink || 'N/A',
        rtt: navigator.connection?.rtt || 'N/A',
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,

        // FingerprintJS Unique ID
        fingerprintId: fpResult.visitorId,

        // Behavioral Data
        mouseMovements,
        sessionDuration: Date.now() - sessionStart, // Time in milliseconds

        // Advanced Fingerprinting
        audioFingerprint,

        // Metadata
        timestamp: new Date().toISOString(),
      };

      console.log('Collected User Data:', userData);
      setAppResponse(userData); // Pass data to parent component

      // Send data to server (uncomment and configure endpoint as needed)
      // await fetch('/api/save-fingerprint', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(userData),
      // });
      // alert('User data collected and sent!');
    } catch (error) {
      console.error('Error collecting data:', error);
      alert('Error collecting data. See console for details.');
    } finally {
      setCollecting(false);
    }
  };

  // Handle user consent
  const handleConsent = () => {
    setUserConsent(true);
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Fraud Detection System</h1>
      {!userConsent ? (
        <div>
          <p>We need your consent to collect data for fraud detection purposes.</p>
          <button onClick={handleConsent}>I Agree</button>
        </div>
      ) : (
        <div>
          <button onClick={collectUserData} disabled={collecting}>
            {collecting ? 'Collecting...' : 'Collect User Data'}
          </button>
          {collecting && <p>Data collection in progress...</p>}
        </div>
      )}
    </div>
  );
};

export default App;