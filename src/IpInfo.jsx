import React, { useEffect, useState } from "react";

const IpInfo = () => {
  const [ipFromHeader, setIpFromHeader] = useState(null); // can't get this in frontend, but will explain
  const [ipFromJS, setIpFromJS] = useState(null);
  const [publicIp, setPublicIp] = useState(null);
  const [publicIpInfo, setPublicIpInfo] = useState(null);
  const [error, setError] = useState(null);

  // You CANNOT get the real "ipFromHeader" (like X-Forwarded-For) in frontend JS.
  // Browsers do not expose this for privacy.
  // We'll just leave it null or explain this.

  // Get public IP using ipify.org
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

  return (
    <div>
      <h2>IP & Geolocation Info</h2>
      <ul>
        <li>
          <b>ipFromHeader:</b> Not available in browser JS (only on server)
        </li>
        <li>
          <b>ipFromJS (public IP):</b> {ipFromJS || "Loading..."}
        </li>
        <li>
          <b>publicIp:</b> {publicIp || "Loading..."}
        </li>
        <li>
          <b>publicIp2 (geo info):</b>
          <pre>
            {publicIpInfo
              ? JSON.stringify(publicIpInfo, null, 2)
              : "Loading..."}
          </pre>
        </li>
      </ul>
      {error && <div style={{ color: "red" }}>Error: {error}</div>}
    </div>
  );
};

export default IpInfo;