/**
 * utils.js - Utility functions for CSV to PDF Streaming Exporter
 */

const Utils = {
  /**
   * Format file size in human-readable format
   * @param {number} bytes - Size in bytes
   * @returns {string} Formatted size string
   */
  formatFileSize: function(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },
  
  /**
   * Format a number with commas as thousands separators
   * @param {number} num - Number to format
   * @returns {string} Formatted number string
   */
  formatNumber: function(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  },
  
  /**
   * Get current memory usage information
   * @returns {Object} Memory usage information
   */
  getMemoryInfo: function() {
    if (window.performance && window.performance.memory) {
      const memory = window.performance.memory;
      return {
        totalJSHeapSize: this.formatFileSize(memory.totalJSHeapSize),
        usedJSHeapSize: this.formatFileSize(memory.usedJSHeapSize),
        jsHeapSizeLimit: this.formatFileSize(memory.jsHeapSizeLimit),
        percentUsed: Math.round((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100)
      };
    }
    return null;
  },
  
  /**
   * Update memory usage display
   * @param {HTMLElement} element - Element to update with memory info
   */
  updateMemoryUsage: function(element) {
    const memoryInfo = this.getMemoryInfo();
    if (memoryInfo) {
      element.textContent = `Memory: ${memoryInfo.usedJSHeapSize} / ${memoryInfo.jsHeapSizeLimit} (${memoryInfo.percentUsed}%)`;
    } else {
      element.textContent = 'Memory usage information not available';
    }
  },
  
  /**
   * Create a delay using Promise
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} Promise that resolves after the delay
   */
  delay: function(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
  
  /**
   * Check if the browser supports all required features
   * @returns {Object} Object containing support information
   */
  checkBrowserSupport: function() {
    const support = {
      fileReader: typeof FileReader !== 'undefined',
      promises: typeof Promise !== 'undefined',
      streams: typeof ReadableStream !== 'undefined',
      blob: typeof Blob !== 'undefined',
      supported: false
    };
    
    support.supported = support.fileReader && support.promises && 
                        support.streams && support.blob;
    
    return support;
  },
  
  /**
   * Safely parse JSON with error handling
   * @param {string} jsonString - JSON string to parse
   * @param {*} defaultValue - Default value if parsing fails
   * @returns {*} Parsed object or default value
   */
  safeJsonParse: function(jsonString, defaultValue = {}) {
    try {
      return JSON.parse(jsonString);
    } catch (e) {
      console.error('Error parsing JSON:', e);
      return defaultValue;
    }
  },
  
  /**
   * Generate a unique ID
   * @returns {string} Unique ID
   */
  generateId: function() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }
};

// Export for use in other modules
window.Utils = Utils;
