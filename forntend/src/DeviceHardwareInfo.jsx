import React, { useState } from "react";

/**
 * IMPORTANT:
 * - Browsers do NOT allow direct access to MAC address, IMEI, device serial number, or similar hardware identifiers for security and privacy reasons.
 * - IP address can be obtained with WebRTC trick or (more reliably) via a backend API.
 * - Any website or web app that claims it can get IMEI/MAC/Serial on a user's device is either misleading or using native code (not possible in a browser).
 * - This component will demonstrate best-effort methods for public IP, local IP (via WebRTC), and will explain the limitations.
 */

const DeviceHardwareInfo = () => {
  const [publicIP, setPublicIP] = useState("");
  const [localIPs, setLocalIPs] = useState([]);
  const [error, setError] = useState("");
  const [fetching, setFetching] = useState(false);

  // Get public IP using a public API
  const fetchPublicIP = async () => {
    setFetching(true);
    setError("");
    try {
      const res = await fetch("https://api.ipify.org?format=json");
      const data = await res.json();
      setPublicIP(data.ip);
    } catch {
      setError("Failed to fetch public IP.");
    }
    setFetching(false);
  };

  // Get local IPs using WebRTC (does NOT work in all browsers)
  const fetchLocalIPs = () => {
    setFetching(true);
    setError("");
    const ips = new Set();
    let pc;
    try {
      // Compatibility for different browsers
      const RTCPeerConnection =
        window.RTCPeerConnection ||
        window.mozRTCPeerConnection ||
        window.webkitRTCPeerConnection;

      if (!RTCPeerConnection) {
        setError("WebRTC not supported.");
        setFetching(false);
        return;
      }

      pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel("");
      pc.onicecandidate = (e) => {
        if (!e.candidate) {
          setLocalIPs(Array.from(ips));
          setFetching(false);
          pc.close();
          return;
        }
        const ipRegex = /([0-9]{1,3}(\.[0-9]{1,3}){3})/;
        const ipMatch = e.candidate.candidate.match(ipRegex);
        if (ipMatch) {
          ips.add(ipMatch[1]);
        }
      };
      pc.createOffer()
        .then((sdp) => pc.setLocalDescription(sdp))
        .catch(() => setError("WebRTC negotiation failed."));
    } catch {
      setError("Could not retrieve local IPs.");
      setFetching(false);
      if (pc) pc.close();
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-lg">
        <h1 className="text-2xl font-bold mb-4 text-center">
          Device Network & Hardware Info (Browser)
        </h1>
        <div className="mb-4">
          <button
            className="mr-2 mb-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            onClick={fetchPublicIP}
            disabled={fetching}
          >
            Get Public IP Address
          </button>
          <button
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            onClick={fetchLocalIPs}
            disabled={fetching}
          >
            Get Local IP Addresses (WebRTC)
          </button>
        </div>
        {fetching && <p className="text-gray-500 mb-2">Fetching info...</p>}
        {error && <p className="text-red-600 mb-2">{error}</p>}
        <div>
          {publicIP && (
            <p className="mb-2">
              <strong>Public IP: </strong>
              <span className="font-mono">{publicIP}</span>
            </p>
          )}
          {localIPs.length > 0 && (
            <div>
              <strong>Local IP Addresses:</strong>
              <ul className="list-disc ml-6">
                {localIPs.map((ip) => (
                  <li key={ip} className="font-mono">{ip}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="mt-8 text-xs text-gray-600 border-t pt-4">
          <strong>Disclaimer:</strong> <br />
          - Browsers do <b>not</b> allow access to MAC address, IMEI, or device serial numbers for privacy and security reasons.<br />
          - Local IP detection may not work in all browsers due to privacy restrictions.<br />
          - To get IMEI, MAC, or Serial Number, you need a native app—not a web app.
        </div>
      </div>
    </div>
  );
};

export default DeviceHardwareInfo;