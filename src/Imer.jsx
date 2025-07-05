const DeviceInfoCollector = () => {
  const [deviceInfo, setDeviceInfo] = React.useState({
    imei: '',
    serialNumber: '',
    licenseKey: '',
    model: '',
    manufacturer: ''
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setDeviceInfo(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Device Information:', deviceInfo);
    alert('Device information submitted successfully!');
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center text-gray-800">
          Device Information Collector
        </h1>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">IMEI Number</label>
            <input
              type="text"
              name="imei"
              value={deviceInfo.imei}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              placeholder="Enter IMEI number"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Serial Number</label>
            <input
              type="text"
              name="serialNumber"
              value={deviceInfo.serialNumber}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              placeholder="Enter serial number"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">License Key</label>
            <input
              type="text"
              name="licenseKey"
              value={deviceInfo.licenseKey}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              placeholder="Enter license key"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Model</label>
            <input
              type="text"
              name="model"
              value={deviceInfo.model}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              placeholder="Enter device model"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Manufacturer</label>
            <input
              type="text"
              name="manufacturer"
              value={deviceInfo.manufacturer}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              placeholder="Enter manufacturer"
            />
          </div>
          <button
            onClick={handleSubmit}
            className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            Submit
          </button>
        </div>
        {Object.values(deviceInfo).some(val => val) && (
          <div className="mt-6 p-4 bg-gray-50 rounded-md">
            <h2 className="text-lg font-semibold text-gray-800">Entered Information</h2>
            <ul className="mt-2 space-y-1 text-gray-600">
              {deviceInfo.imei && <li><strong>IMEI:</strong> {deviceInfo.imei}</li>}
              {deviceInfo.serialNumber && <li><strong>Serial Number:</strong> {deviceInfo.serialNumber}</li>}
              {deviceInfo.licenseKey && <li><strong>License Key:</strong> {deviceInfo.licenseKey}</li>}
              {deviceInfo.model && <li><strong>Model:</strong> {deviceInfo.model}</li>}
              {deviceInfo.manufacturer && <li><strong>Manufacturer:</strong> {deviceInfo.manufacturer}</li>}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeviceInfoCollector;