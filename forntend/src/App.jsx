import { useState, useEffect, useRef } from 'react';
import FingerprintJS from '@fingerprintjs/fingerprintjs';
import axios from 'axios';
import './App.css';
import FinalFingerprint from './FinalFingerprint';
import F2 from './F2';
import FingerprintCollector from './FingerprintCollector';
import DeviceFingerprint from './FingerprintCollector';
// import ResponsePanel from './ResponsePanel';

import IpInfo from './IpInfo';

const App = () => {
  const [appResponse, setAppResponse] = useState(null);
  return (

    <>
    {/* <FinalFingerprint />
    <F2 /> 
     <IpInfo /> 
    <FingerprintCollector /> */}
    <DeviceFingerprint />

    </>
    
  );
};

export default App;