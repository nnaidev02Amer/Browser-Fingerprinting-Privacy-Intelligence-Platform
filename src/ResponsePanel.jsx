import { useState, useMemo } from 'react';
import copy from 'clipboard-copy';
import { FaCopy, FaDownload } from 'react-icons/fa';
import MonacoEditor from '@monaco-editor/react';
import { saveAs } from 'file-saver';

function ResponsePanel({ data, loading = false, requestTime = 0 }) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('body');
  const [responseFormat, setResponseFormat] = useState('json');

  // Calculate response size with error handling
  const responseSize = useMemo(() => {
    try {
      if (!data) return '0 B';
      
      let sizeInBytes;
      if (data instanceof Blob) {
        sizeInBytes = data.size;
      } else {
        const dataString = typeof data === 'string' ? data : JSON.stringify(data);
        sizeInBytes = new TextEncoder().encode(dataString).length;
      }

      if (sizeInBytes < 1024) return `${sizeInBytes} B`;
      if (sizeInBytes < 1024 * 1024) return `${(sizeInBytes / 1024).toFixed(2)} KB`;
      return `${(sizeInBytes / (1024 * 1024)).toFixed(2)} MB`;
    } catch {
      return '0 B';
    }
  }, [data]);

  // Format response data for display
  const formattedData = useMemo(() => {
    try {
      if (!data) return '';
      
      if (responseFormat === 'json') {
        return typeof data === 'string' && isValidJson(data)
          ? JSON.stringify(JSON.parse(data), null, 2)
          : typeof data === 'string'
          ? data
          : JSON.stringify(data, null, 2);
      }
      
      return typeof data === 'string' ? data : String(data);
    } catch {
      return String(data || '');
    }
  }, [data, responseFormat]);

  // Helper function to check if string is valid JSON
  const isValidJson = (str) => {
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  };

  // Copy handler with proper async handling
  const handleCopy = async () => {
    try {
      const content = responseFormat === 'json' && typeof data !== 'string'
        ? JSON.stringify(data, null, 2)
        : String(data || '');
      
      await copy(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Copy failed:', error);
    }
  };

  // Download handler with proper file extension
  const handleDownload = () => {
    try {
      const formatConfig = {
        json: { type: 'application/json', ext: 'json' },
        xml: { type: 'application/xml', ext: 'xml' },
        html: { type: 'text/html', ext: 'html' },
        text: { type: 'text/plain', ext: 'txt' }
      };
      
      const { type, ext } = formatConfig[responseFormat] || formatConfig.text;
      const content = responseFormat === 'json' && typeof data !== 'string'
        ? JSON.stringify(data, null, 2)
        : String(data || '');
      
      const blob = new Blob([content], { type });
      saveAs(blob, `response-${new Date().toISOString()}.${ext}`);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  // Loader component
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 bg-gray-50 rounded-lg">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading...</span>
      </div>
    );
  }

  // Empty state
  if (data === null || data === undefined) {
    return (
      <div className="text-center p-8 bg-gray-50 rounded-lg text-gray-600">
        No response data yet. Send a request to see the response.
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 bg-gray-50 rounded-lg h-full">
      {/* <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-800">Response</h2>
        <div className="text-sm text-gray-600 space-x-4">
          <span>Time: {requestTime.toFixed(2)} ms</span>
          <span>Size: {responseSize}</span>
        </div>
      </div> */}

      <div className="flex border-b border-gray-200">
        {['body', 'raw'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-blue-600'
            }`}
            type="button"
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
        <span>Size: {responseSize}</span>
      </div>

      {activeTab === 'body' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between space-x-4">
  {/* Select Dropdown */}
  <select
    value={responseFormat}
    onChange={(e) => setResponseFormat(e.target.value)}
    className="p-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 bg-white"
  >
    <option value="json">JSON</option>
    <option value="xml">XML</option>
    <option value="html">HTML</option>
    <option value="text">Text</option>
  </select>

  {/* Button Group */}
  <div className="flex space-x-2">
    <button
      onClick={handleCopy}
      className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
      disabled={!data}
      type="button"
    >
      <FaCopy className="mr-2" />
      {copied ? 'Copied!' : 'Copy'}
    </button>
    <button
      onClick={handleDownload}
      className="flex items-center px-3 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 transition-colors disabled:opacity-50"
      disabled={!data}
      type="button"
    >
      <FaDownload className="mr-2" />
      Download
    </button>
  </div>
</div>

          <div className="border rounded-md overflow-hidden">
            <MonacoEditor
              height="100vh"
              language={responseFormat}
              value={formattedData}
              theme="vs-dark"
              options={{
                readOnly: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                automaticLayout: true,
                fontSize: 14,
                padding: { top: 10 },
              }}
            />
          </div>
        </div>
      )}

      {activeTab === 'raw' && (
        <div className="border rounded-md overflow-hidden">
          <MonacoEditor
            height="100vh"
            language="json"
            value={typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
            theme="vs-dark"
            options={{
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              automaticLayout: true,
              fontSize: 14,
              padding: { top: 10 },
            }}
          />
        </div>
      )}
    </div>
  );
}

export default ResponsePanel;