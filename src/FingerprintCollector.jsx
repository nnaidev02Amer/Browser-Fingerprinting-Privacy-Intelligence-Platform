import React, { useState, useEffect } from 'react';

        // Helper: Generate SHA-256 hash with salt
        async function generateHash(data, salt = 'xai-fingerprint-salt') {
            const jsonString = JSON.stringify(data) + salt;
            const encoder = new TextEncoder();
            const dataBuffer = encoder.encode(jsonString);
            const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
        }

        // Enhanced Canvas Fingerprint
        function getCanvasFingerprint() {
            try {
                const canvas = document.createElement("canvas");
                canvas.width = 200;
                canvas.height = 200;
                const ctx = canvas.getContext("2d");
                
                // Complex rendering
                ctx.textBaseline = "top";
                ctx.font = "14px 'Arial'";
                ctx.fillStyle = "rgba(255, 102, 0, 0.8)";
                ctx.fillRect(50, 20, 100, 50);
                
                // Gradient and shadow
                const gradient = ctx.createLinearGradient(0, 0, 200, 200);
                gradient.addColorStop(0, "#069");
                gradient.addColorStop(1, "#0ff");
                ctx.fillStyle = gradient;
                ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
                ctx.shadowBlur = 5;
                ctx.fillText("Advanced Fingerprint v2.0", 10, 30);
                
                // Path rendering
                ctx.beginPath();
                ctx.arc(100, 100, 50, 0, Math.PI * 2);
                ctx.strokeStyle = "#f00";
                ctx.lineWidth = 2;
                ctx.stroke();
                
                // Image data
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                return {
                    dataUrl: canvas.toDataURL(),
                    imageDataHash: generateHash(Array.from(imageData.data))
                };
            } catch {
                return { dataUrl: "N/A", imageDataHash: "N/A" };
            }
        }

        // Enhanced WebGL Fingerprint
        function getWebGLFingerprint() {
            try {
                const canvas = document.createElement("canvas");
                const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
                if (!gl) return { vendor: "N/A", renderer: "N/A" };
                
                const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
                const capabilities = {
                    vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : "N/A",
                    renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : "N/A",
                    version: gl.getParameter(gl.VERSION),
                    shaderPrecision: {
                        vertex: gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.HIGH_FLOAT),
                        fragment: gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)
                    },
                    extensions: gl.getSupportedExtensions(),
                    parameters: {
                        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
                        maxViewportDims: gl.getParameter(gl.MAX_VIEWPORT_DIMS),
                        maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
                        maxVaryingVectors: gl.getParameter(gl.MAX_VARYING_VECTORS)
                    }
                };
                
                return capabilities;
            } catch {
                return { vendor: "N/A", renderer: "N/A" };
            }
        }

        // Enhanced Audio Fingerprint
        async function getAudioFingerprint() {
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
                    fingerprints.push({
                        waveform,
                        hash: await generateHash(data)
                    });
                }
                
                audioCtx.close();
                return {
                    sampleRate: audioCtx.sampleRate,
                    baseLatency: audioCtx.baseLatency || "N/A",
                    fingerprints
                };
            } catch {
                return { sampleRate: "N/A", baseLatency: "N/A", fingerprints: [] };
            }
        }

        // Network Timing Analysis
        async function getNetworkTiming() {
            try {
                const start = performance.now();
                const response = await fetch('https://example.com', { method: 'HEAD', mode: 'no-cors' });
                const end = performance.now();
                return {
                    timing: end - start,
                    headersAvailable: !!response.headers
                };
            } catch {
                return { timing: "N/A", headersAvailable: false };
            }
        }

        // Hardware Sensors
        async function getSensorData() {
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
                    sensors.accelerometer = {
                        x: sensor.x,
                        y: sensor.y,
                        z: sensor.z
                    };
                    sensor.stop();
                }
                
                return sensors;
            } catch {
                return {};
            }
        }

        // Performance Benchmark
        function runPerformanceBenchmark() {
            const start = performance.now();
            let result = 0;
            for (let i = 0; i < 1000000; i++) {
                result += Math.sin(i) * Math.cos(i);
            }
            return {
                executionTime: performance.now() - start,
                resultHash: generateHash(result)
            };
        }

        // Enhanced Component
        const DeviceFingerprint = () => {
            const [fingerprint, setFingerprint] = useState(null);
            const [loading, setLoading] = useState(true);
            const [error, setError] = useState(null);

            useEffect(() => {
                (async () => {
                    try {
                        setLoading(true);
                        const [
                            canvasFingerprint,
                            webGLFingerprint,
                            audioFingerprint,
                            networkTiming,
                            sensorData,
                            batteryStatus,
                            permissions,
                            mediaDevices
                        ] = await Promise.all([
                            Promise.resolve(getCanvasFingerprint()),
                            Promise.resolve(getWebGLFingerprint()),
                            getAudioFingerprint(),
                            getNetworkTiming(),
                            getSensorData(),
                            getBatteryStatus(),
                            getPermissions(),
                            getMediaDevices()
                        ]);

                        const fingerprintData = {
                            timestamp: new Date().toISOString(),
                            canvasFingerprint,
                            webGLFingerprint,
                            audioFingerprint,
                            networkTiming,
                            sensorData,
                            availableFonts: getAvailableFonts(),
                            plugins: getPlugins(),
                            storage: getStorageSupport(),
                            batteryStatus,
                            webRTC: getWebRTCSupport(),
                            deviceOrientation: getDeviceOrientationSupport(),
                            touchSupport: getTouchSupport(),
                            workerSupport: getWorkerSupport(),
                            navigatorInfo: getNavigatorInfo(),
                            screenInfo: getScreenInfo(),
                            timezoneInfo: getTimezoneInfo(),
                            connection: getConnectionInfo(),
                            userAgentData: getUserAgentData(),
                            cookiesEnabled: navigator.cookieEnabled,
                            doNotTrack: navigator.doNotTrack || "N/A",
                            permissions,
                            mediaDevices,
                            performance: {
                                ...getPerformanceMetrics(),
                                benchmark: runPerformanceBenchmark()
                            }
                        };

                        fingerprintData.hash = await generateHash(fingerprintData);
                        console.log("Advanced Fingerprint Data:", fingerprintData);
                        setFingerprint(fingerprintData);
                    } catch (err) {
                        setError("Failed to collect complete fingerprint: " + err.message);
                    } finally {
                        setLoading(false);
                    }
                })();
            }, []);

            return (
                <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-4xl">
                        <h1 className="text-3xl font-bold mb-6 text-center">
                            Enhanced Device Fingerprint Collector
                        </h1>
                        <div className="space-y-4">
                            {loading && (
                                <p className="text-gray-600 text-center animate-pulse">
                                    Collecting advanced fingerprint...
                                </p>
                            )}
                            {error && (
                                <p className="text-red-600 text-center">
                                    {error}
                                </p>
                            )}
                            {fingerprint && (
                                <div className="text-center space-y-4">
                                    <p className="text-green-700 font-semibold">
                                        Fingerprint collected successfully. Check console for details.
                                    </p>
                                    <div className="bg-gray-50 p-4 rounded-lg">
                                        <p className="text-sm">
                                            Unique Fingerprint Hash:
                                            <span className="font-mono block mt-2 break-all">
                                                {fingerprint.hash}
                                            </span>
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="bg-blue-50 p-4 rounded">
                                            <h3 className="font-semibold">Canvas Fingerprint</h3>
                                            <p className="text-xs">Hash: {fingerprint.canvasFingerprint.imageDataHash}</p>
                                        </div>
                                        <div className="bg-blue-50 p-4 rounded">
                                            <h3 className="font-semibold">Audio Fingerprint</h3>
                                            <p className="text-xs">Waveforms: {fingerprint.audioFingerprint.fingerprints.length}</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            );
        };

        // Original helper functions (unchanged)
        function getAvailableFonts() {
            const fonts = [
                "Arial", "Courier", "Georgia", "Impact", "Times New Roman",
                "Verdana", "Helvetica", "Palatino", "Garamond", "Bookman",
                "Trebuchet MS", "Comic Sans MS", "Arial Black", "Monaco"
            ];
            const availableFonts = [];
            try {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                ctx.font = "12px serif";
                const baseWidth = ctx.measureText("abcdefghijklmnopqrstuvwxyz0123456789").width;
                fonts.forEach(font => {
                    ctx.font = `12px "${font}", serif`;
                    const width = ctx.measureText("abcdefghijklmnopqrstuvwxyz0123456789").width;
                    if (Math.abs(width - baseWidth) > 0.1) availableFonts.push(font);
                });
                return availableFonts;
            } catch {
                return [];
            }
        }

        function getPlugins() {
            try {
                return Array.from(navigator.plugins || []).map(p => ({
                    name: p.name,
                    description: p.description,
                    version: p.version || "N/A",
                }));
            } catch {
                return [];
            }
        }

        async function getBatteryStatus() {
            if (!navigator.getBattery) return "N/A";
            try {
                const battery = await navigator.getBattery();
                return {
                    level: battery.level,
                    charging: battery.charging,
                    chargingTime: battery.chargingTime,
                    dischargingTime: battery.dischargingTime,
                    timestamp: new Date().toISOString(),
                };
            } catch {
                return "N/A";
            }
        }

        function getWebRTCSupport() {
            return {
                enabled: !!(window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection),
                dataChannel: !!window.RTCDataChannel,
            };
        }

        function getDeviceOrientationSupport() {
            return {
                supported: !!window.DeviceOrientationEvent,
                absolute: window.DeviceOrientationEvent ? (() => {
                    try {
                        return "absolute" in new window.DeviceOrientationEvent("deviceorientation");
                    } catch {
                        return false;
                    }
                })() : false,
            };
        }

        function getStorageSupport() {
            let local = false, session = false, indexedDB = false;
            try {
                local = !!window.localStorage;
                session = !!window.sessionStorage;
                indexedDB = !!window.indexedDB;
            } catch {}
            return { local, session, indexedDB };
        }

        async function getPermissions() {
            if (!navigator.permissions) return "N/A";
            const types = [
                "geolocation", "notifications", "push", "camera", "microphone",
                "midi", "background-sync", "ambient-light-sensor", "accelerometer",
                "gyroscope", "magnetometer", "clipboard-read", "clipboard-write"
            ];
            const statuses = {};
            for (let type of types) {
                try {
                    const perm = await navigator.permissions.query({ name: type });
                    statuses[type] = perm.state;
                } catch {
                    statuses[type] = "unsupported";
                }
            }
            return statuses;
        }

        async function getMediaDevices() {
            if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return "N/A";
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                return devices.map(dev => ({
                    kind: dev.kind,
                    label: dev.label,
                    deviceId: dev.deviceId,
                    groupId: dev.groupId,
                }));
            } catch {
                return "N/A";
            }
        }

        function getPerformanceMetrics() {
            if (window.performance && window.performance.timing) {
                const t = window.performance.timing;
                return {
                    navigationStart: t.navigationStart,
                    domContentLoaded: t.domContentLoadedEventEnd,
                    loadEventEnd: t.loadEventEnd,
                    memory: window.performance.memory || "N/A",
                };
            }
            return "N/A";
        }

        function getTouchSupport() {
            return {
                maxTouchPoints: navigator.maxTouchPoints || 0,
                touchEvent: "ontouchstart" in window,
                pointerEvent: !!window.PointerEvent,
            };
        }

        function getWorkerSupport() {
            return {
                worker: !!window.Worker,
                sharedWorker: !!window.SharedWorker,
                serviceWorker: "serviceWorker" in navigator,
            };
        }

        function getNavigatorInfo() {
            return {
                platform: navigator.platform,
                hardwareConcurrency: navigator.hardwareConcurrency || "N/A",
                deviceMemory: navigator.deviceMemory || "N/A",
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
            };
        }

        function getScreenInfo() {
            return {
                width: window.screen.width,
                height: window.screen.height,
                availWidth: window.screen.availWidth,
                availHeight: window.screen.availHeight,
                colorDepth: window.screen.colorDepth,
                pixelDepth: window.screen.pixelDepth,
                pixelRatio: window.devicePixelRatio || 1,
                orientation: window.screen.orientation ? window.screen.orientation.type : "N/A",
            };
        }

        function getTimezoneInfo() {
            return {
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                offset: new Date().getTimezoneOffset(),
                locale: Intl.DateTimeFormat().resolvedOptions().locale,
            };
        }

        function getConnectionInfo() {
            const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            if (!connection) return "N/A";
            return {
                effectiveType: connection.effectiveType,
                rtt: connection.rtt,
                downlink: connection.downlink,
                saveData: connection.saveData,
                type: connection.type,
            };
        }

        function getUserAgentData() {
            if (navigator.userAgentData) {
                return {
                    brands: navigator.userAgentData.brands,
                    mobile: navigator.userAgentData.mobile,
                    platform: navigator.userAgentData.platform,
                };
            }
            return "N/A";
        }

//Export default DeviceFingerprint;
        export default DeviceFingerprint;