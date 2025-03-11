/**
 * csv-parser.js - CSV parsing functionality with streaming support
 */

class CSVParser {
  /**
   * Create a new CSVParser instance
   * @param {Object} options - Parser options
   */
  constructor(options = {}) {
    this.options = {
      delimiter: ',',
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      ...options
    };
    
    this.abortController = null;
    this.isProcessing = false;
  }
  
  /**
   * Parse a CSV file using streaming to handle large files
   * @param {File} file - The CSV file to parse
   * @param {Object} callbacks - Callback functions for the parsing process
   * @returns {Promise} Promise that resolves when parsing is complete
   */
  parseFile(file, callbacks = {}) {
    const { 
      onChunk = () => {}, 
      onComplete = () => {}, 
      onError = () => {},
      onProgress = () => {}
    } = callbacks;
    
    return new Promise((resolve, reject) => {
      if (!file) {
        const error = new Error('No file provided');
        onError(error);
        reject(error);
        return;
      }
      
      this.isProcessing = true;
      this.abortController = new AbortController();
      const signal = this.abortController.signal;
      
      // Set up Papa Parse for streaming
      const config = {
        ...this.options,
        chunk: (results, parser) => {
          if (signal.aborted) {
            parser.abort();
            return;
          }
          
          try {
            onChunk(results.data);
          } catch (e) {
            onError(e);
            parser.abort();
            reject(e);
          }
        },
        complete: (results) => {
          this.isProcessing = false;
          if (!signal.aborted) {
            onComplete(results);
            resolve(results);
          }
        },
        error: (error) => {
          this.isProcessing = false;
          onError(error);
          reject(error);
        },
        step: (results, parser) => {
          if (signal.aborted) {
            parser.abort();
            return;
          }
        }
      };
      
      // Use FileReader to read the file in chunks for progress tracking
      const fileSize = file.size;
      let loadedBytes = 0;
      
      const updateProgress = (event) => {
        if (event.lengthComputable) {
          loadedBytes = event.loaded;
          const progress = Math.round((loadedBytes / fileSize) * 100);
          onProgress(progress, loadedBytes, fileSize);
        }
      };
      
      // Start parsing with Papa Parse
      Papa.parse(file, {
        ...config,
        download: false,
        beforeFirstChunk: function() {
          updateProgress({ lengthComputable: true, loaded: 0 });
        }
      });
      
      // Set up a separate FileReader just for progress tracking
      const reader = new FileReader();
      reader.onprogress = updateProgress;
      reader.onload = () => {
        updateProgress({ lengthComputable: true, loaded: fileSize });
      };
      reader.readAsArrayBuffer(file);
      
      // Handle abort signal
      signal.addEventListener('abort', () => {
        this.isProcessing = false;
        reject(new Error('CSV parsing aborted'));
      });
    });
  }
  
  /**
   * Parse a CSV string
   * @param {string} csvString - The CSV string to parse
   * @returns {Array} Parsed CSV data
   */
  parseString(csvString) {
    return Papa.parse(csvString, {
      ...this.options,
      download: false
    }).data;
  }
  
  /**
   * Abort the current parsing operation
   */
  abort() {
    if (this.isProcessing && this.abortController) {
      this.abortController.abort();
      this.isProcessing = false;
    }
  }
  
  /**
   * Check if a file is likely a CSV file
   * @param {File} file - File to check
   * @returns {boolean} True if the file appears to be CSV
   */
  static isCSVFile(file) {
    if (!file) return false;
    
    // Check by MIME type
    if (file.type === 'text/csv' || file.type === 'application/vnd.ms-excel') {
      return true;
    }
    
    // Check by extension
    const extension = file.name.split('.').pop().toLowerCase();
    return extension === 'csv';
  }
  
  /**
   * Estimate the number of rows in a CSV file
   * @param {File} file - CSV file
   * @param {number} sampleSize - Size of sample to read in bytes
   * @returns {Promise<number>} Estimated number of rows
   */
  static async estimateRowCount(file, sampleSize = 100000) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const sample = e.target.result;
          const newlineCount = (sample.match(/\n/g) || []).length;
          
          if (newlineCount === 0) {
            resolve(1); // At least one row (header)
            return;
          }
          
          // Calculate average bytes per row
          const bytesPerRow = sample.length / newlineCount;
          
          // Estimate total rows based on file size
          const estimatedRows = Math.ceil(file.size / bytesPerRow);
          resolve(estimatedRows);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => reject(new Error('Error reading file'));
      
      // Read a sample of the file to estimate row count
      const blob = file.slice(0, Math.min(sampleSize, file.size));
      reader.readAsText(blob);
    });
  }
}

// Export for use in other modules
window.CSVParser = CSVParser;
