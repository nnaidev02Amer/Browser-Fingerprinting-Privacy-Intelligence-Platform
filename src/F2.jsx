import { useState, useEffect, useRef } from 'react';
import FingerprintJS from '@fingerprintjs/fingerprintjs';
import axios from 'axios';
import './App.css';

// Web Worker for canvas fingerprinting
const canvasWorker = new Worker(URL.createObjectURL(new Blob([`
  self.onmessage = function(e) {
    const canvas = new OffscreenCanvas(200, 200);
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('Test String 😊', 2, 15);
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.7)';
    ctx.beginPath();
    ctx.arc(100, 75, 50, 0, Math.PI * 2);
    ctx.stroke();
    canvas.convertToBlob().then(blob => {
      const reader = new FileReader();
      reader.onload = () => self.postMessage(reader.result);
      reader.readAsDataURL(blob);
    });
  };
`], { type: 'application/javascript' })));

const App = () => {
  const [fingerprintData, setFingerprintData] = useState(null);
  const [mouseMovements, setMouseMovements] = useState([]);
  const [keystrokes, setKeystrokes] = useState([]);
  const [touchGestures, setTouchGestures] = useState([]);
  const [sessionStart] = useState(Date.now());
  const [userConsent, setUserConsent] = useState({ device: false, behavioral: false });
  const [collecting, setCollecting] = useState(false);
  const [inputData, setInputData] = useState('');
  const [error, setError] = useState(null);

  const mouseMovementsRef = useRef(mouseMovements);
  const keystrokesRef = useRef(keystrokes);
  const touchGesturesRef = useRef(touchGestures);

  useEffect(() => {
    mouseMovementsRef.current = mouseMovements;
    keystrokesRef.current = keystrokes;
    touchGesturesRef.current = touchGestures;
  }, [mouseMovements, keystrokes, touchGestures]);

  // Throttle function with dynamic adjustment
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

  // Mouse Movement Tracking
  useEffect(() => {
    if (!userConsent.behavioral) return;

    const handleMouseMove = throttle((event) => {
      if (mouseMovementsRef.current.length < 100) { // Reduced limit for performance
        setMouseMovements((prev) => {
          const last = prev[prev.length - 1];
          const velocity = last ? calculateVelocity(last, { x: event.clientX, y: event.clientY, time: Date.now() }) : 0;
          return [
            ...prev,
            { x: event.clientX, y: event.clientY, time: Date.now(), velocity, scrollY: window.scrollY },
          ];
        });
      }
    }, navigator.deviceMemory < 4 ? 100 : 50); // Dynamic throttling based on device memory

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [userConsent.behavioral]);

  // Keyboard Dynamics Tracking
  useEffect(() => {
    if (!userConsent.behavioral) return;

    const handleKeyDown = throttle((event) => {
      if (keystrokesRef.current.length < 50) {
        setKeystrokes((prev) => [
          ...prev,
          { key: event.key, time: Date.now(), dwellTime: 0 },
        ]);
      }
    }, 10);

    const handleKeyUp = (event) => {
      setKeystrokes((prev) => {
        const lastKey = prev.findLast((k) => k.key === event.key && k.dwellTime === 0);
        if (lastKey) lastKey.dwellTime = Date.now() - lastKey.time;
        return [...prev];
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [userConsent.behavioral]);

  // Touch Gesture Tracking
  useEffect(() => {
    if (!userConsent.behavioral) return;

    const handleTouchMove = throttle((event) => {
      if (touchGesturesRef.current.length < 50 && event.touches.length > 0) {
        const touch = event.touches[0];
        setTouchGestures((prev) => [
          ...prev,
          { x: touch.clientX, y: touch.clientY, time: Date.now(), pressure: touch.force || 'N/A' },
        ]);
      }
    }, 50);

    window.addEventListener('touchmove', handleTouchMove);
    return () => window.removeEventListener('touchmove', handleTouchMove);
  }, [userConsent.behavioral]);

  // Calculate velocity
  const calculateVelocity = (prev, current) => {
    const dx = current.x - prev.x;
    const dy = current.y - prev.y;
    const dt = (current.time - prev.time) / 1000;
    return dt > 0 ? Math.sqrt(dx * dx + dy * dy) / dt : 0;
  };

  // Advanced Canvas Fingerprint using Web Worker
  const getAdvancedCanvasFingerprint = async () => {
    try {
      return new Promise((resolve) => {
        canvasWorker.onmessage = (e) => resolve(e.data);
        canvasWorker.postMessage({});
      });
    } catch {
      return 'N/A';
    }
  };

  // WebRTC Fingerprint
  const getWebRTCFingerprint = async () => {
    if (!userConsent.device || !window.RTCPeerConnection) return 'N/A';
    try {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      const candidates = [];
      pc.onicecandidate = (event) => {
        if (event.candidate) candidates.push(event.candidate.candidate);
      };
      await pc.createDataChannel('fingerprint');
      await pc.createOffer().then(offer => pc.setLocalDescription(offer));
      await new Promise(resolve => setTimeout(resolve, 1000));
      pc.close();
      return candidates.join('|');
    } catch {
      return 'N/A';
    }
  };

  // Device Motion (Mobile)
  const getDeviceMotion = async () => {
    if (!userConsent.behavioral || !window.DeviceMotionEvent) return 'N/A';
    try {
      return new Promise((resolve) => {
        const motions = [];
        const handler = (event) => {
          motions.push({
            acceleration: event.acceleration,
            time: Date.now(),
          });
          if (motions.length >= 10) {
            window.removeEventListener('devicemotion', handler);
            resolve(motions);
          }
        };
        window.addEventListener('devicemotion', handler);
        setTimeout(() => {
          window.removeEventListener('devicemotion', handler);
          resolve(motions);
        }, 2000);
      });
    } catch {
      return 'N/A';
    }
  };

  // Real IP Data
  const getIPData = async () => {
    return {
      ip: "demo_ip", // Replace with actual IP fetching logic
      city: "demo_city", // Replace with actual city fetching logic
      country: "demo_country", // Replace with actual country fetching logic
      latitude: "demo_latitude", // Replace with actual latitude fetching logic
      longitude: "demo_longitude", // Replace with actual longitude fetching logic
      isp: "demo_isp", // Replace with actual ISP fetching logic
    };

    // try {
    //   const response = await axios.get('https://api.ipgeolocation.io/ipgeo', {
    //     params: { apiKey: 'YOUR_API_KEY' }, // Replace with your API key
    //   });
    //   return {
    //     ip: response.data.ip,
    //     city: response.data.city,
    //     country: response.data.country_name,
    //     latitude: response.data.latitude,
    //     longitude: response.data.longitude,
    //     isp: response.data.isp,
    //   };
    // } catch (error) {
    //   console.error('Error fetching IP data:', error);
    //   return 'N/A';
    // }
  };

  // Collect User Data
  const collectUserData = async () => {
    if (!userConsent.device && !userConsent.behavioral) {
      setError('Please provide consent to collect data.');
      return;
    }
    setCollecting(true);
    setError(null);

    try {
      const fp = await FingerprintJS.load();
      const fpResult = await fp.get();
      const [canvasFingerprint, webRTCFingerprint, deviceMotion, ipData] = await Promise.all([
        getAdvancedCanvasFingerprint(),
        getWebRTCFingerprint(),
        getDeviceMotion(),
        getIPData(),
      ]);

      const userData = {
        deviceInfo: userConsent.device ? {
          deviceType: /Mobile/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop',
          os: navigator.platform || 'N/A',
          screenResolution: `${window.screen.width}x${window.screen.height}`,
        } : {},
        behavioralData: userConsent.behavioral ? {
          mouseMovements,
          keystrokes,
          touchGestures,
          deviceMotion,
          sessionDuration: Date.now() - sessionStart,
        } : {},
        fingerprints: userConsent.device ? {
          canvasFingerprint,
          webRTCFingerprint,
          fingerprintId: fpResult.visitorId,
        } : {},
        networkInfo: userConsent.device ? {
          ipData,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        } : {},
        timestamp: new Date().toISOString(),
        sessionId: Math.random().toString(36).substring(2),
      };

      // Send to server (configure your endpoint)
      /*
      await axios.post('/api/save-fingerprint', userData, {
        headers: { 'Content-Type': 'application/json' },
      });
      */

      setFingerprintData(userData);
      alert('User data collected successfully!');
    } catch (error) {
      console.error('Error collecting data:', error);
      setError('Error collecting data. See console for details.');
    } finally {
      setCollecting(false);
    }
  };

  // Handle Consent
  const handleConsent = (type) => {
    setUserConsent((prev) => ({ ...prev, [type]: true }));
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <div className="w-1/2 p-4 border-r overflow-y-auto">
        <div className="container">
          <h1>Fraud Detection System</h1>
          {!userConsent.device && !userConsent.behavioral ? (
            <div className="consent-box">
              <p>We need your consent to collect data for fraud detection.</p>
              <button onClick={() => handleConsent('device')}>Allow Device Data</button>
              <button onClick={() => handleConsent('behavioral')}>Allow Behavioral Data</button>
            </div>
          ) : (
            <div className="collect-box">
              <input
                type="text"
                className="input-field"
                placeholder="Type here to capture typing behavior..."
                value={inputData}
                onChange={(e) => setInputData(e.target.value)}
              />
              <button onClick={collectUserData} disabled={collecting}>
                {collecting ? 'Collecting...' : 'Collect User Data'}
              </button>
              {collecting && <p>Data collection in progress...</p>}
              {error && <p className="error">{error}</p>}
            </div>
          )}
        </div>
      </div>
      <div className="w-1/2 p-4 overflow-y-auto">
        {fingerprintData && (
          <div className="response-panel">
            <h2>Collected User Data</h2>
            <pre>{JSON.stringify(fingerprintData, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;