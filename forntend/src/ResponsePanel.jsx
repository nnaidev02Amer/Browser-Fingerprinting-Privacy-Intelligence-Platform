import { useState, useMemo } from 'react';
import copy from 'clipboard-copy';
import { FaCopy, FaDownload, FaSearch } from 'react-icons/fa';
import MonacoEditor from '@monaco-editor/react';
import { saveAs } from 'file-saver';

function ResponsePanel({ response, loading, requestTime }) {
  // Always call hooks at the top level, before any early returns!
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('body');
  const [headerFilter, setHeaderFilter] = useState('');
  const [responseFormat, setResponseFormat] = useState('json');

  // Safe destructuring with fallback
  const status = response?.status ?? '';
  const headers = response?.headers ?? {};
  const data = response?.data ?? '';
  const attemptCount = response?.attemptCount ?? 1;

  // Calculate response size
  const responseSize = useMemo(() => {
    let sizeInBytes;
    try {
      let dataString;
      if (typeof data === 'string') {
        dataString = data;
      } else if (data instanceof Blob) {
        sizeInBytes = data.size;
      } else {
        dataString = JSON.stringify(data);
      }
      if (sizeInBytes === undefined) {
        sizeInBytes = new Blob([dataString ?? '']).size;
      }
    } catch {
      sizeInBytes = 0;
    }
    return sizeInBytes < 1024
      ? `${sizeInBytes} B`
      : sizeInBytes < 1024 * 1024
      ? `${(sizeInBytes / 1024).toFixed(2)} KB`
      : `${(sizeInBytes / (1024 * 1024)).toFixed(2)} MB`;
  }, [data]);

  // Status color determination
  const statusColor =
    status >= 200 && status < 300
      ? 'text-green-500'
      : status >= 400
      ? 'text-red-500'
      : 'text-yellow-500';

  // Filtered headers
  const filteredHeaders = useMemo(() => {
    if (!headerFilter) return headers;
    const filterLower = headerFilter.toLowerCase();
    return Object.fromEntries(
      Object.entries(headers).filter(([key, value]) =>
        key.toLowerCase().includes(filterLower) ||
        String(value).toLowerCase().includes(filterLower)
      )
    );
  }, [headers, headerFilter]);

  // Get editor language based on format
  const editorLanguage =
    responseFormat === 'json' ? 'json'
    : responseFormat === 'xml' ? 'xml'
    : responseFormat === 'html' ? 'html'
    : 'plaintext';

  // Format response data
  const formattedData = useMemo(() => {
    try {
      if (responseFormat === 'json') {
        return typeof data === 'string'
          ? data
          : JSON.stringify(data, null, 2);
      } else if (responseFormat === 'xml' || responseFormat === 'html') {
        return typeof data === 'string' ? data : String(data);
      }
      return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }, [data, responseFormat]);

  // Handler functions (no hooks inside)
  const handleCopy = () => {
    let content = '';
    try {
      content =
        responseFormat === 'json'
          ? JSON.stringify(data, null, 2)
          : typeof data === 'string'
          ? data
          : JSON.stringify(data);
    } catch {
      content = String(data);
    }
    copy(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    let content = '';
    let type = 'application/octet-stream';
    let ext = 'txt';
    try {
      if (responseFormat === 'json') {
        content = JSON.stringify(data, null, 2);
        type = 'application/json';
        ext = 'json';
      } else if (responseFormat === 'xml') {
        content = typeof data === 'string' ? data : String(data);
        type = 'application/xml';
        ext = 'xml';
      } else if (responseFormat === 'html') {
        content = typeof data === 'string' ? data : String(data);
        type = 'text/html';
        ext = 'html';
      } else {
        content = typeof data === 'string' ? data : JSON.stringify(data);
      }
    } catch {
      content = String(data);
    }
    const blob = new Blob([content], { type });
    saveAs(blob, `response-${new Date().toISOString()}.${ext}`);
  };

  // Early returns (AFTER hooks)
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 bg-gray-50 rounded-lg">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading...</span>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="text-center p-8 bg-gray-50 rounded-lg text-gray-600">
        No response yet. Send a request to see the response.
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Response</h2>
        <div className="text-sm text-gray-600 space-x-2">
          <span className={`font-semibold ${statusColor}`}>Status: {status}</span>
          <span>Time: {requestTime?.toFixed(2)} ms</span>
          <span>Size: {responseSize}</span>
          {attemptCount > 1 && <span>Attempts: {attemptCount}</span>}
        </div>
      </div>

      <div className="flex border-b border-gray-200">
        {['body', 'headers', 'raw'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
            type="button"
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'body' && (
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <div className="flex space-x-2">
              <select
                value={responseFormat}
                onChange={(e) => setResponseFormat(e.target.value)}
                className="p-1 border rounded-md text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="json">JSON</option>
                <option value="xml">XML</option>
                <option value="html">HTML</option>
                <option value="text">Text</option>
              </select>
            </div>
            <div className="space-x-2">
              <button
                onClick={handleCopy}
                className="flex items-center px-3 py-1 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 transition-colors"
                type="button"
              >
                <FaCopy className="mr-1" />
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center px-3 py-1 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 transition-colors"
                type="button"
              >
                <FaDownload className="mr-1" />
                Download
              </button>
            </div>
          </div>
          <MonacoEditor
            height="100vh"
            language={editorLanguage}
            value={formattedData}
            theme="vs-dark"
            options={{
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              automaticLayout: true,
              fontSize: 14,
            }}
          />
        </div>
      )}

      {activeTab === 'headers' && (
        <div className="space-y-2">
          <div className="relative">
            <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={headerFilter}
              onChange={(e) => setHeaderFilter(e.target.value)}
              placeholder="Filter headers..."
              className="w-full pl-10 p-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="bg-gray-800 text-white p-4 rounded-md text-sm overflow-auto max-h-[60vh]">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-600">
                  <th className="text-left p-2">Header</th>
                  <th className="text-left p-2">Value</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(filteredHeaders).map(([key, value]) => (
                  <tr key={key} className="border-b border-gray-700">
                    <td className="p-2 font-mono">{key}</td>
                    <td className="p-2 font-mono break-all">{String(value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'raw' && (
        <MonacoEditor
          height="100vh"
          language="json"
          value={JSON.stringify(response, null, 2)}
          theme="vs-dark"
          options={{
            readOnly: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            automaticLayout: true,
            fontSize: 14,
          }}
        />
      )}
    </div>
  );
}

export default ResponsePanel;