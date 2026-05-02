# Browser Fingerprint Project (React)

A React-based project that collects device/browser information step-by-step and generates a unique fingerprint hash for identifying a device.

⚠️ **Important:** This project is for educational and security research purposes only. Always obtain user consent before collecting fingerprint or IP-related data.

---

## ✨ Features

- Collect browser & device information
- Gather hardware-related signals
- Fetch IP-based location data (via external API)
- Step-by-step fingerprint building process
- Generate unique hash (device fingerprint)
- React frontend implementation
- Extendable architecture for backend verification

---

## 🛠️ Tech Stack

- React.js
- JavaScript (ES6+)
- Web APIs (Navigator, Screen, Canvas, WebGL)
- Crypto API (SHA-256 hashing)
- External IP API (optional backend or public service)

---

## ⚙️ How It Works (Pipeline)

1. Collect Browser Data  
2. Collect Screen & Hardware Info  
3. Collect Network / IP Info  
4. Normalize all data  
5. Generate final fingerprint string  
6. Hash the fingerprint → Unique Device ID  

---

## 📊 Data Collected

### 1. Browser Information
- User Agent  
- Language  
- Timezone  
- Platform  
- Cookies enabled  

### 2. Screen & Hardware Info
- Screen resolution  
- Color depth  
- Device memory (if available)  
- CPU cores  
- Touch support  

### 3. Graphics Fingerprint
- Canvas rendering data  
- WebGL vendor & renderer  

### 4. Network Information
- Public IP address (via API)  
- Country / Region / City (optional)  

---

## 🚀 Installation

Clone the repository:

git clone https://github.com/sufiun27/Browser-Fingerprint-Project-React-.git

Install dependencies:

npm install

Start development server:

npm start

Build for production:

npm run build

---

## 👨‍💻 Signature

Built with dedication by:

**Abu Sufiun**  
Backend Software Engineer | Scalable Systems & API Specialist  

GitHub: https://github.com/sufiun27  
LinkedIn: https://linkedin.com/in/abu-sufiun  

---

_"Code is not just logic, it's craftsmanship."_
