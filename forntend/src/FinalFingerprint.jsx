import { useState, useEffect, useRef } from 'react';
import FingerprintJS from '@fingerprintjs/fingerprintjs';
import axios from 'axios';
import './App.css';

const App = () => {

  const [fingerprintData, setFingerprintData] = useState(null);
 


  const [mouseMovements, setMouseMovements] = useState([]);
  const [keystrokes, setKeystrokes] = useState([]);
  const [touchGestures, setTouchGestures] = useState([]);
  const [sessionStart] = useState(Date.now());
  const [userConsent, setUserConsent] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [inputData, setInputData] = useState('');

  // Refs for avoiding stale closures
  const mouseMovementsRef = useRef(mouseMovements);
  const keystrokesRef = useRef(keystrokes);
  const touchGesturesRef = useRef(touchGestures);

  useEffect(() => {
    mouseMovementsRef.current = mouseMovements;
    keystrokesRef.current = keystrokes;
    touchGesturesRef.current = touchGestures;
  }, [mouseMovements, keystrokes, touchGestures]);

  // Throttle function
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

  // Mouse Movement Tracking with Acceleration
  useEffect(() => {
    if (!userConsent) return;

    const handleMouseMove = throttle((event) => {
      if (mouseMovementsRef.current.length < 200) {
        setMouseMovements((prev) => {
          const last = prev[prev.length - 1];
          const velocity = last ? calculateVelocity(last, { x: event.clientX, y: event.clientY, time: Date.now() }) : 0;
          const acceleration = last && prev.length > 1 ? calculateAcceleration(prev[prev.length - 2], last, { x: event.clientX, y: event.clientY, time: Date.now() }) : 0;
          return [
            ...prev,
            {
              x: event.clientX,
              y: event.clientY,
              time: Date.now(),
              velocity,
              acceleration,
              scrollY: window.scrollY,
            },
          ];
        });
      }
    }, 50);

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [userConsent]);

  // Keyboard Dynamics Tracking
  useEffect(() => {
    if (!userConsent) return;

    const handleKeyDown = throttle((event) => {
      if (keystrokesRef.current.length < 100) {
        setKeystrokes((prev) => [
          ...prev,
          {
            key: event.key,
            keyCode: event.keyCode,
            time: Date.now(),
            dwellTime: 0,
            shiftKey: event.shiftKey,
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
          },
        ]);
      }
    }, 10);

    const handleKeyUp = (event) => {
      setKeystrokes((prev) => {
        const lastKey = prev.findLast((k) => k.key === event.key && k.dwellTime === 0);
        if (lastKey) {
          lastKey.dwellTime = Date.now() - lastKey.time;
        }
        return [...prev];
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [userConsent]);

  // Touch Gesture Tracking
  useEffect(() => {
    if (!userConsent) return;

    const handleTouchMove = throttle((event) => {
      if (touchGesturesRef.current.length < 100 && event.touches.length > 0) {
        const touch = event.touches[0];
        setTouchGestures((prev) => [
          ...prev,
          {
            x: touch.clientX,
            y: touch.clientY,
            time: Date.now(),
            pressure: touch.force || 'N/A',
            radius: touch.radiusX || 'N/A',
            touchType: event.type,
          },
        ]);
      }
    }, 50);

    window.addEventListener('touchmove', handleTouchMove);
    return () => window.removeEventListener('touchmove', handleTouchMove);
  }, [userConsent]);

  // Calculate velocity
  const calculateVelocity = (prev, current) => {
    const dx = current.x - prev.x;
    const dy = current.y - prev.y;
    const dt = (current.time - prev.time) / 1000;
    return dt > 0 ? Math.sqrt(dx * dx + dy * dy) / dt : 0;
  };

  // Calculate acceleration
  const calculateAcceleration = (prevPrev, prev, current) => {
    const v1 = prevPrev && prev ? calculateVelocity(prevPrev, prev) : 0;
    const v2 = calculateVelocity(prev, current);
    const dt = (current.time - prev.time) / 1000;
    return dt > 0 ? (v2 - v1) / dt : 0;
  };

  // Audio Fingerprint
  const getAudioFingerprint = () => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const analyser = audioContext.createAnalyser();
      oscillator.connect(analyser);
      analyser.connect(audioContext.destination);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(1000, audioContext.currentTime);
      oscillator.start();
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);
      oscillator.stop();
      audioContext.close();
      return Array.from(dataArray).join('');
    } catch (error) {
      console.error('Error generating audio fingerprint:', error);
      return 'N/A';
    }
  };

  // Battery Status
  const getBatteryStatus = async () => {
    try {
      if (navigator.getBattery) {
        const battery = await navigator.getBattery();
        return {
          level: battery.level * 100,
          charging: battery.charging,
          chargingTime: battery.chargingTime,
          dischargingTime: battery.dischargingTime,
        };
      }
      return 'N/A';
    } catch {
      return 'N/A';
    }
  };

  // Emulator/Sandbox Detection
  const detectEnvironment = () => {
    const checks = {
      isHeadless: navigator.webdriver,
      missingImage: !document.createElement('img').src,
      performanceTiming: performance.timing?.fetchStart === performance.timing?.navigationStart,
      windowProperties: !window.chrome && !window.safari && !window.opr,
      pluginsLength: navigator.plugins.length === 0,
      mimeTypesLength: navigator.mimeTypes.length === 0,
      timingAnomaly: performance.now() === 0 || performance.now() % 1 !== 0,
      userAgentSuspicious: /headless|bot|crawler/i.test(navigator.userAgent),
      screenSizeAnomaly: window.screen.width < 100 || window.screen.height < 100,
      abnormalFrameRate: window.requestAnimationFrame ? detectFrameRate() : 'N/A',
    };
    return checks;
  };

  // Frame Rate Detection
  const detectFrameRate = () => {
    let frames = 0;
    let startTime = performance.now();
    const measure = () => {
      frames++;
      if (performance.now() - startTime < 1000) {
        requestAnimationFrame(measure);
      } else {
        return frames;
      }
    };
    requestAnimationFrame(measure);
    return frames;
  };

  // Font Enumeration
  const getFontFingerprint = () => {
    const fonts = [
      'Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Verdana',
      'Georgia', 'Palatino', 'Garamond', 'Bookman', 'Comic Sans MS',
      'Impact', 'Arial Black', 'Trebuchet MS', 'Calibri', 'Candara',
    ];
    const availableFonts = [];
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = '12px serif';
    const baseWidth = ctx.measureText('Test').width;

    fonts.forEach((font) => {
      ctx.font = `12px "${font}"`;
      if (ctx.measureText('Test').width !== baseWidth) {
        availableFonts.push(font);
      }
    });
    return availableFonts;
  };

  // Advanced Canvas Fingerprint
  const getAdvancedCanvasFingerprint = () => {
    try {
      const canvas = document.createElement('canvas');
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
      return canvas.toDataURL();
    } catch {
      return 'N/A';
    }
  };

  // WebGL Fingerprint
  const getWebGLFingerprint = () => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return 'N/A';
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'N/A',
        renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'N/A',
        version: gl.getParameter(gl.VERSION),
        shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
        extensions: gl.getSupportedExtensions(),
      };
    } catch {
      return 'N/A';
    }
  };

  // Network Information
  const getNetworkInfo = () => {
    return {
      connectionType: navigator.connection?.effectiveType || 'N/A',
      downlinkSpeed: navigator.connection?.downlink || 'N/A',
      rtt: navigator.connection?.rtt || 'N/A',
      saveData: navigator.connection?.saveData || 'N/A',
      effectiveTypeChanges: navigator.connection ? 0 : 'N/A',
    };
  };

  // IP Data (Using ipgeolocation.io)
  const getIPData = ()=> {
    return {
            ip: '10.3.13.252',
            city: '10.3.13.252',
            country: '10.3.13.252',
            latitude: '10.3.13.252',
            longitude: '10.3.13.252',
            isp: '10.3.13.252',
          };
  }
  


  // Collect User Data
  const collectUserData = async () => {
    if (!userConsent) {
      alert('Please provide consent to collect data.');
      return;
    }
    setCollecting(true);

    try {
      const fp = await FingerprintJS.load();
      const fpResult = await fp.get();
      const batteryStatus = await getBatteryStatus();
      const ipData = await getIPData();

      const userData = {
        // Device Information
        deviceType: /Mobile/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop',
        os: navigator.platform || 'N/A',
        deviceMemory: navigator.deviceMemory || 'N/A',
        cpuCores: navigator.hardwareConcurrency || 'N/A',
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        colorDepth: window.screen.colorDepth || 'N/A',
        pixelRatio: window.devicePixelRatio || 'N/A',
        touchSupport: navigator.maxTouchPoints > 0 ? 'Yes' : 'No',
        orientation: window.screen.orientation?.type || 'N/A',
        availableScreen: `${window.screen.availWidth}x${window.screen.availHeight}`,

        // Browser Information
        userAgent: navigator.userAgent,
        language: navigator.language,
        languages: navigator.languages || [],
        cookiesEnabled: navigator.cookieEnabled,
        doNotTrack: navigator.doNotTrack || 'N/A',
        webRTCEnabled: !!window.RTCPeerConnection,
        plugins: Array.from(navigator.plugins).map(p => ({
          name: p.name,
          description: p.description,
          filename: p.filename,
        })),

        // Fingerprints
        canvasFingerprint: getAdvancedCanvasFingerprint(),
        webGLFingerprint: getWebGLFingerprint(),
        audioFingerprint: getAudioFingerprint(),
        fontFingerprint: getFontFingerprint(),
        fingerprintId: fpResult.visitorId,

        // Behavioral Data
        mouseMovements,
        keystrokes,
        touchGestures,
        sessionDuration: Date.now() - sessionStart,
        inputData: inputData || 'N/A',
        clickCount: mouseMovements.length,
        keyPressCount: keystrokes.length,
        touchCount: touchGestures.length,

        // Network Information
        network: getNetworkInfo(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        localTime: new Date().toLocaleString(),
        ipData,

        // Environment Detection
        environmentChecks: detectEnvironment(),
        batteryStatus,

        // Performance Metrics
        performance: {
          loadTime: performance.timing?.domContentLoadedEventEnd - performance.timing?.navigationStart || 'N/A',
          memory: performance.memory
            ? {
                jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
                totalJSHeapSize: performance.memory.totalJSHeapSize,
                usedJSHeapSize: performance.memory.usedJSHeapSize,
              }
            : 'N/A',
        },

        // Metadata
        timestamp: new Date().toISOString(),
        sessionId: Math.random().toString(36).substring(2),
        url: window.location.href,
      };

      console.log('Collected User Data:', userData);
      setFingerprintData(userData);
      // Send data to server (uncomment and configure endpoint as needed)
      /*
      await fetch('/api/save-fingerprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
      });
      */
      alert('User data collected successfully!');
    } catch (error) {
      console.error('Error collecting data:', error);
      alert('Error collecting data. See console for details.');
    } finally {
      setCollecting(false);
    }
  };

  // Handle Input Change
  const handleInputChange = (e) => {
    setInputData(e.target.value);
  };

  // Handle Consent
  const handleConsent = () => {
    setUserConsent(true);
  };

  return (

    <div className="min-h-screen bg-gray-100 p-4 overflow-y-auto">
  <div className="container">
    <h1>Fraud Detection System</h1>
    {!userConsent ? (
      <div className="consent-box">
        <p>We need your consent to collect data for fraud detection purposes.</p>
        <button onClick={handleConsent}>I Agree</button>
      </div>
    ) : (
      <div className="collect-box">
        <input
          type="text"
          className="input-field"
          placeholder="Type here to capture typing behavior..."
          value={inputData}
          onChange={handleInputChange}
        />
        <button onClick={collectUserData} disabled={collecting}>
          {collecting ? 'Collecting...' : 'Collect User Data'}
        </button>
        {collecting && <p>Data collection in progress...</p>}
      </div>
    )}
  </div>
</div>




    
  );
};

export default App;