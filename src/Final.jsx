import React, { useState, useEffect, useRef } from 'react';
import FingerprintJS from '@fingerprintjs/fingerprintjs';
import CryptoJS from 'crypto-js';
import ResponsePanel from './ResponsePanel';

    // Web Worker for canvas fingerprinting
    const canvasWorker = new Worker(URL.createObjectURL(new Blob([`
      self.onmessage = function(e) {
        const canvas = new OffscreenCanvas(200, 200);
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = "14px 'Arial'";
        ctx.fillStyle = 'rgba(255, 102, 0, 0.8)';
        ctx.fillRect(50, 20, 100, 50);
        const gradient = ctx.createLinearGradient(0, 0, 200, 200);
        gradient.addColorStop(0, '#069');
        gradient.addColorStop(1, '#0ff');
        ctx.fillStyle = gradient;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 5;
        ctx.fillText('Advanced Fingerprint v2.0 😊', 10, 30);
        ctx.beginPath();
        ctx.arc(100, 100, 50, 0, Math.PI * 2);
        ctx.strokeStyle = '#f00';
        ctx.lineWidth = 2;
        ctx.stroke();
        canvas.convertToBlob().then(blob => {
          const reader = new FileReader();
          reader.onload = () => self.postMessage(reader.result);
          reader.readAsDataURL(blob);
        });
      };
    `], { type: 'application/javascript' })));

    // Helper: Generate SHA-256 hash
    async function generateHash(data, salt = 'xai-fingerprint-salt') {
      const jsonString = JSON.stringify(data) + salt;
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(jsonString);
      const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    //! /////////////////////////////////////////////////////////////////////////////////////
    const BestFingerprintCollector = () => {
        const [ipFromHeader, setIpFromHeader] = useState(null); // can't get this in frontend, but will explain
        const [ipFromJS, setIpFromJS] = useState(null);
        const [publicIp, setPublicIp] = useState(null);
        const [publicIpInfo, setPublicIpInfo] = useState(null);
       


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

      const [data, setData] = useState(null);

      useEffect(() => {
          const getIpAndGeo = async () => {
            try {
              // 1. Get public IP (as seen by external services)
              const ipRes = await fetch("https://api.ipify.org?format=json");
              if (!ipRes.ok) throw new Error("Failed to get public IP.");
              const ipData = await ipRes.json();
              setPublicIp(ipData.ip);
              setIpFromJS(ipData.ip); // this is what you can get from JS
      
              // 2. Get geolocation info for that IP
              const geoRes = await fetch(`https://ipapi.co/${ipData.ip}/json/`);
              const geoData = await geoRes.json();
              setPublicIpInfo(geoData);
      
              // 3. Optionally handle error from ipapi
              if (geoData.error) {
                setError(geoData.message || "Unknown error from ipapi.co");
              }
            } catch (e) {
              setError(e.message);
            }
          };
      
          getIpAndGeo();
        }, []);

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

      // Mouse Movement Tracking
      useEffect(() => {
        if (!userConsent.behavioral) return;
        const handleMouseMove = throttle((event) => {
          if (mouseMovementsRef.current.length < 200) {
            setMouseMovements((prev) => {
              const last = prev[prev.length - 1];
              const velocity = last ? calculateVelocity(last, { x: event.clientX, y: event.clientY, time: Date.now() }) : 0;
              const acceleration = last && prev.length > 1 ? calculateAcceleration(prev[prev.length - 2], last, { x: event.clientX, y: event.clientY, time: Date.now() }) : 0;
              return [
                ...prev,
                { x: event.clientX, y: event.clientY, time: Date.now(), velocity, acceleration, scrollY: window.scrollY },
              ];
            });
          }
        }, navigator.deviceMemory < 4 ? 100 : 50);
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
      }, [userConsent.behavioral]);

      // Keyboard Dynamics Tracking
      useEffect(() => {
        if (!userConsent.behavioral) return;
        const handleKeyDown = throttle((event) => {
          if (keystrokesRef.current.length < 100) {
            setKeystrokes((prev) => [
              ...prev,
              { key: event.key, keyCode: event.keyCode, time: Date.now(), dwellTime: 0, shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, altKey: event.altKey },
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
          if (touchGesturesRef.current.length < 100 && event.touches.length > 0) {
            const touch = event.touches[0];
            setTouchGestures((prev) => [
              ...prev,
              { x: touch.clientX, y: touch.clientY, time: Date.now(), pressure: touch.force || 'N/A', radius: touch.radiusX || 'N/A', touchType: event.type },
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

      // Calculate acceleration
      const calculateAcceleration = (prevPrev, prev, current) => {
        const v1 = prevPrev && prev ? calculateVelocity(prevPrev, prev) : 0;
        const v2 = calculateVelocity(prev, current);
        const dt = (current.time - prev.time) / 1000;
        return dt > 0 ? (v2 - v1) / dt : 0;
      };

      // Enhanced Canvas Fingerprint
      const getCanvasFingerprint = async () => {
        try {
          return new Promise((resolve) => {
            canvasWorker.onmessage = (e) => {
              const canvas = document.createElement('canvas');
              canvas.width = 200;
              canvas.height = 200;
              const ctx = canvas.getContext('2d');
              ctx.textBaseline = 'top';
              ctx.font = "14px 'Arial'";
              ctx.fillStyle = 'rgba(255, 102, 0, 0.8)';
              ctx.fillRect(50, 20, 100, 50);
              const gradient = ctx.createLinearGradient(0, 0, 200, 200);
              gradient.addColorStop(0, '#069');
              gradient.addColorStop(1, '#0ff');
              ctx.fillStyle = gradient;
              ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
              ctx.shadowBlur = 5;
              ctx.fillText('Advanced Fingerprint v2.0 😊', 10, 30);
              ctx.beginPath();
              ctx.arc(100, 100, 50, 0, Math.PI * 2);
              ctx.strokeStyle = '#f00';
              ctx.lineWidth = 2;
              ctx.stroke();
              const imageData = ctx.getImageData(0, 0, 200, 200);
              resolve({ dataUrl: e.data, imageDataHash: generateHash(Array.from(imageData.data)) });
            };
            canvasWorker.postMessage({});
          });
        } catch {
          return { dataUrl: 'N/A', imageDataHash: 'N/A' };
        }
      };

      // Enhanced WebGL Fingerprint
      const getWebGLFingerprint = () => {
        try {
          const canvas = document.createElement('canvas');
          const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
          if (!gl) return { vendor: 'N/A', renderer: 'N/A' };
          const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
          return {
            vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'N/A',
            renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'N/A',
            version: gl.getParameter(gl.VERSION),
            shaderPrecision: {
              vertex: gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.HIGH_FLOAT),
              fragment: gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT),
            },
            extensions: gl.getSupportedExtensions(),
            parameters: {
              maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
              maxViewportDims: gl.getParameter(gl.MAX_VIEWPORT_DIMS),
              maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
              maxVaryingVectors: gl.getParameter(gl.MAX_VARYING_VECTORS),
            },
          };
        } catch {
          return { vendor: 'N/A', renderer: 'N/A' };
        }
      };

      // Enhanced Audio Fingerprint
      const getAudioFingerprint = async () => {
        try {
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const waveforms = ['sine', 'square', 'sawtooth', 'triangle'];
          const fingerprints = [];
          for (let waveform of waveforms) {
            const oscillator = audioCtx.createOscillator();
            const analyser = audioCtx.createAnalyser();
            const gain = audioCtx.createGain();
            oscillator.type = waveform;
            oscillator.frequency.setValueAtTime(1000, audioCtx.currentTime);
            analyser.fftSize = 2048;
            oscillator.connect(gain);
            gain.connect(analyser);
            analyser.connect(audioCtx.destination);
            oscillator.start();
            await new Promise(resolve => setTimeout(resolve, 100));
            const data = new Float32Array(analyser.frequencyBinCount);
            analyser.getFloatFrequencyData(data);
            oscillator.stop();
            fingerprints.push({ waveform, hash: await generateHash(data) });
          }
          audioCtx.close();
          return { sampleRate: audioCtx.sampleRate, baseLatency: audioCtx.baseLatency || 'N/A', fingerprints };
        } catch {
          return { sampleRate: 'N/A', baseLatency: 'N/A', fingerprints: [] };
        }
      };

      // Device Motion
      const getDeviceMotion = async () => {
        if (!userConsent.behavioral || !window.DeviceMotionEvent) return 'N/A';
        try {
          return new Promise((resolve) => {
            const motions = [];
            const handler = (event) => {
              motions.push({ acceleration: event.acceleration, time: Date.now() });
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

      // Public IP
      const getPublicIP = async () => {
        try {
          const res = await fetch('https://api.ipify.org?format=json');
          const data = await res.json();
          return data.ip;
        } catch {
          return 'N/A';
        }
      };

      // Local IPs via WebRTC
      const getLocalIPs = async () => {
        try {
          const RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
          if (!RTCPeerConnection) return [];
          const pc = new RTCPeerConnection({ iceServers: [] });
          const ips = new Set();
          pc.createDataChannel('');
          pc.onicecandidate = (e) => {
            if (!e.candidate) return;
            const ipRegex = /([0-9]{1,3}(\.[0-9]{1,3}){3})/;
            const ipMatch = e.candidate.candidate.match(ipRegex);
            if (ipMatch) ips.add(ipMatch[1]);
          };
          await pc.createOffer().then(sdp => pc.setLocalDescription(sdp));
          await new Promise(resolve => setTimeout(resolve, 1000));
          pc.close();
          return Array.from(ips);
        } catch {
          return [];
        }
      };

      // IP Geolocation (Placeholder)
      const getIPData = async () => {
        return {
          ip: 'N/A',
          city: 'N/A',
          country: 'N/A',
          latitude: 'N/A',
          longitude: 'N/A',
          isp: 'N/A',
        };
        // Uncomment and configure with a valid API key for real geolocation
        /*
        try {
          const response = await axios.get('https://api.ipgeolocation.io/ipgeo', {
            params: { apiKey: 'YOUR_API_KEY' },
          });
          return {
            ip: response.data.ip,
            city: response.data.city,
            country: response.data.country_name,
            latitude: response.data.latitude,
            longitude: response.data.longitude,
            isp: response.data.isp,
          };
        } catch {
          return { ip: 'N/A', city: 'N/A', country: 'N/A', latitude: 'N/A', longitude: 'N/A', isp: 'N/A' };
        }
        */
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
        return {
          isHeadless: navigator.webdriver,
          missingImage: !document.createElement('img').src,
          performanceTiming: performance.timing?.fetchStart === performance.timing?.navigationStart,
          windowProperties: !window.chrome && !window.safari && !window.opr,
          pluginsLength: navigator.plugins.length === 0,
          mimeTypesLength: navigator.mimeTypes.length === 0,
          timingAnomaly: performance.now() === 0 || performance.now() % 1 !== 0,
          userAgentSuspicious: /headless|bot|crawler/i.test(navigator.userAgent),
          screenSizeAnomaly: window.screen.width < 100 || window.screen.height < 100,
        };
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

      // Network Timing
      const getNetworkTiming = async () => {
        try {
          const start = performance.now();
          const response = await fetch('https://example.com', { method: 'HEAD', mode: 'no-cors' });
          const end = performance.now();
          return { timing: end - start, headersAvailable: !!response.headers };
        } catch {
          return { timing: 'N/A', headersAvailable: false };
        }
      };

      // Sensor Data
      const getSensorData = async () => {
        try {
          const sensors = {};
          if (window.AmbientLightSensor) {
            const sensor = new AmbientLightSensor();
            await sensor.start();
            sensors.ambientLight = sensor.illuminance;
            sensor.stop();
          }
          if (window.Accelerometer) {
            const sensor = new Accelerometer({ frequency: 60 });
            await sensor.start();
            sensors.accelerometer = { x: sensor.x, y: sensor.y, z: sensor.z };
            sensor.stop();
          }
          return sensors;
        } catch {
          return {};
        }
      };

      // Performance Benchmark
      const runPerformanceBenchmark = () => {
        const start = performance.now();
        let result = 0;
        for (let i = 0; i < 1000000; i++) {
          result += Math.sin(i) * Math.cos(i);
        }
        return { executionTime: performance.now() - start, resultHash: generateHash(result) };
      };

      // Additional Helper Functions
      const getPlugins = () => {
        try {
          return Array.from(navigator.plugins || []).map(p => ({
            name: p.name,
            description: p.description,
            version: p.version || 'N/A',
          }));
        } catch {
          return [];
        }
      };

      const getPermissions = async () => {
        if (!navigator.permissions) return 'N/A';
        const types = [
          'geolocation', 'notifications', 'push', 'camera', 'microphone',
          'midi', 'background-sync', 'ambient-light-sensor', 'accelerometer',
          'gyroscope', 'magnetometer', 'clipboard-read', 'clipboard-write',
        ];
        const statuses = {};
        for (let type of types) {
          try {
            const perm = await navigator.permissions.query({ name: type });
            statuses[type] = perm.state;
          } catch {
            statuses[type] = 'unsupported';
          }
        }
        return statuses;
      };

      const getMediaDevices = async () => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return 'N/A';
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          return devices.map(dev => ({
            kind: dev.kind,
            label: dev.label,
            deviceId: dev.deviceId,
            groupId: dev.groupId,
          }));
        } catch {
          return 'N/A';
        }
      };

      const getNavigatorInfo = () => ({
        platform: navigator.platform,
        hardwareConcurrency: navigator.hardwareConcurrency || 'N/A',
        deviceMemory: navigator.deviceMemory || 'N/A',
        vendor: navigator.vendor,
        product: navigator.product,
        productSub: navigator.productSub,
        vendorSub: navigator.vendorSub,
        appVersion: navigator.appVersion,
        appName: navigator.appName,
        appCodeName: navigator.appCodeName,
        userAgent: navigator.userAgent,
        language: navigator.language,
        languages: navigator.languages,
      });

      const getScreenInfo = () => ({
        width: window.screen.width,
        height: window.screen.height,
        availWidth: window.screen.availWidth,
        availHeight: window.screen.availHeight,
        colorDepth: window.screen.colorDepth,
        pixelDepth: window.screen.pixelDepth,
        pixelRatio: window.devicePixelRatio || 1,
        orientation: window.screen.orientation ? window.screen.orientation.type : 'N/A',
      });

      const getConnectionInfo = () => {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (!connection) return 'N/A';
        return {
          effectiveType: connection.effectiveType,
          rtt: connection.rtt,
          downlink: connection.downlink,
          saveData: connection.saveData,
          type: connection.type,
        };
      };

      const getUserAgentData = () => {
        if (navigator.userAgentData) {
          return {
            brands: navigator.userAgentData.brands,
            mobile: navigator.userAgentData.mobile,
            platform: navigator.userAgentData.platform,
          };
        }
        return 'N/A';
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
          const [
            canvasFingerprint,
            webGLFingerprint,
            audioFingerprint,
            deviceMotion,
            publicIP,
            localIPs,
            ipData,
            batteryStatus,
            networkTiming,
            sensorData,
            permissions,
            mediaDevices,
            performanceBenchmark,
            
          ] = await Promise.all([
            getCanvasFingerprint(),
            Promise.resolve(getWebGLFingerprint()),
            getAudioFingerprint(),
            getDeviceMotion(),
            getPublicIP(),
            getLocalIPs(),
            getIPData(),
            getBatteryStatus(),
            getNetworkTiming(),
            getSensorData(),
            getPermissions(),
            getMediaDevices(),
            Promise.resolve(runPerformanceBenchmark()),
          ]);

          // const publicIpInfo = publicIpInfo? {
          //   details: publicIpInfo,
          // }:;

          const userData = {
            ipDetails: publicIpInfo ? {
              data: publicIpInfo,
            }:{} ,
            deviceInfo: userConsent.device ? {
              deviceType: /Mobile/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop',
              navigatorInfo: getNavigatorInfo(),
              screenInfo: getScreenInfo(),
              batteryStatus,
              plugins: getPlugins(),
              permissions,
              mediaDevices,
            } : {},
            fingerprints: userConsent.device ? {
              fingerprintId: fpResult.visitorId,
              canvasFingerprint,
              webGLFingerprint,
              audioFingerprint,
              fontFingerprint: getFontFingerprint(),
            } : {},
            behavioralData: userConsent.behavioral ? {
              mouseMovements,
              keystrokes,
              touchGestures,
              deviceMotion,
              sessionDuration: Date.now() - sessionStart,
              inputData: inputData || 'N/A',
              clickCount: mouseMovements.length,
              keyPressCount: keystrokes.length,
              touchCount: touchGestures.length,
            } : {},
            networkInfo: userConsent.device ? {
              publicIP,
              localIPs,
              ipData,
              connection: getConnectionInfo(),
              networkTiming,
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              localTime: new Date().toLocaleString(),
            } : {},
            environment: userConsent.device ? detectEnvironment() : {},
            performance: userConsent.device ? {
              performanceMetrics: window.performance && window.performance.timing ? {
                navigationStart: window.performance.timing.navigationStart,
                domContentLoaded: window.performance.timing.domContentLoadedEventEnd,
                loadEventEnd: window.performance.timing.loadEventEnd,
                memory: window.performance.memory || 'N/A',
              } : 'N/A',
              benchmark: performanceBenchmark,
            } : {},
            sensors: userConsent.device ? sensorData : {},
            metadata: {
              timestamp: new Date().toISOString(),
              sessionId: Math.random().toString(36).substring(2),
              url: window.location.href,
            },
          };

          userData.hash = await generateHash(userData);
          console.log('Collected User Data:', userData);
          setFingerprintData(userData);
          setData(userData);

          // Uncomment to send data to server
          /*
          await fetch('/api/save-fingerprint', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData),
          });
          */

          // alert('User data collected successfully!');
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

      // Handle Input Change
      const handleInputChange = (e) => {
        setInputData(e.target.value);
      };

      return (
        <div className="min-h-screen bg-gray-100 flex p-4 space-x-4">
          {/* Button/Input Section - 30% */}
          <div className="w-[30%] p-4 overflow-y-auto">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h1 className="text-2xl font-bold mb-6 text-center text-gray-800">
                Browser Fingerprint Collector
              </h1>
              {!userConsent.device && !userConsent.behavioral ? (
                <div className="space-y-4">
                  <button
                    className="w-full bg-purple-600 text-white py-2 px-4 rounded hover:bg-purple-700"
                    onClick={() => {
                      handleConsent('device');
                      handleConsent('behavioral');
                    }}
                  >
                    Allow All Data
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <input
                    type="text"
                    className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Type here to capture typing behavior..."
                    value={inputData}
                    onChange={handleInputChange}
                  />
                  <button
                    className="w-full bg-indigo-600 text-white py-2 px-4 rounded hover:bg-indigo-700 disabled:bg-gray-400"
                    onClick={collectUserData}
                    disabled={collecting}
                  >
                    {collecting ? 'Collecting...' : 'Collect User Data'}
                  </button>
                  {collecting && <p className="text-gray-500 text-center">Data collection in progress...</p>}
                  {error && <p className="text-red-600 text-center">{error}</p>}
                </div>
              )}
            </div>
          </div>
      
          {/* Data View Section - 70% */}
          <div className="w-[70%] p-4 overflow-y-auto">
            {fingerprintData && (
              <div className="bg-white rounded-lg shadow-lg p-6">
                {/* <h2 className="text-2xl font-semibold mb-4 text-gray-800">Collected User Data</h2> */}
                <ResponsePanel data={fingerprintData} />
                <p className="mt-4 text-xs text-gray-600">
                  <strong>Disclaimer:</strong> This tool collects browser and device data for research purposes. Hardware identifiers like IMEI or MAC addresses cannot be accessed via browsers due to privacy restrictions.
                </p>
              </div>
            )}
          </div>
        </div>
      );
      
    };

export default BestFingerprintCollector;