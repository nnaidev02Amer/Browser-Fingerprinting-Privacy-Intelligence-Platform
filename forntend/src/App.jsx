import { useState, useEffect, useRef } from 'react';
import FingerprintJS from '@fingerprintjs/fingerprintjs';
import axios from 'axios';
import './App.css';
import FinalFingerprint from './FinalFingerprint';
// import ResponsePanel from './ResponsePanel';

import IpInfo from './IpInfo';

const App = () => {
  const [appResponse, setAppResponse] = useState(null);
  return (

    <>
    <FinalFingerprint />
    </>
    
  );
};

export default App;