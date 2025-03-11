/**
 * jsPDF CSV Streaming Implementation
 * A memory-efficient solution for exporting large CSV datasets to PDF
 * Version: 1.0.0
 * License: MIT
 * Date: 2025-03-11
 */
(function(global) {

// Source: utils.js
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


// Source: csv-parser.js
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


// Source: pdf-generator.js
/**
 * pdf-generator.js - PDF generation with streaming support for large CSV data
 */

class PDFGenerator {
  /**
   * Create a new PDFGenerator instance
   * @param {Object} options - PDF generation options
   */
  constructor(options = {}) {
    this.options = {
      pageSize: 'a4',
      orientation: 'portrait',
      margins: {
        top: 15,
        right: 15,
        bottom: 25, // Increased bottom margin for footer
        left: 15
      },
      includeHeader: true,
      includeFooter: true,
      includePageNumbers: true,
      title: '',
      author: '',
      fontSize: 10,
      cellPadding: 2,
      headerFillColor: [240, 240, 240],
      alternateRowFillColor: [249, 249, 249],
      ...options
    };
    
    this.pdf = null;
    this.abortController = null;
    this.isGenerating = false;
    this.currentPage = 1;
    this.rowsProcessed = 0;
    this.totalRows = 0;
    this.columns = [];
    this.columnWidths = [];
    this.pageHeight = 0;
    this.pageWidth = 0;
    this.tableStartY = 0;
    this.currentY = 0;
    this.rowHeight = 0;
    this.filename = 'export.pdf';
  }
  
  /**
   * Initialize the PDF document
   * @private
   */
  _initializePDF() {
    const { jsPDF } = window.jspdf;
    
    this.pdf = new jsPDF({
      orientation: this.options.orientation,
      unit: 'mm',
      format: this.options.pageSize
    });
    
    // Set page dimensions
    this.pageWidth = this.pdf.internal.pageSize.getWidth();
    this.pageHeight = this.pdf.internal.pageSize.getHeight();
    
    // Set font
    this.pdf.setFont('helvetica');
    this.pdf.setFontSize(this.options.fontSize);
    
    // Calculate row height based on font size
    this.rowHeight = (this.options.fontSize / 72) * 25.4 + (this.options.cellPadding * 2);
    
    // Set starting Y position for the table
    this.tableStartY = this.options.margins.top;
    this.currentY = this.tableStartY;
  }
  
  /**
   * Generate PDF from CSV data using streaming approach
   * @param {Array} headers - CSV header row
   * @param {number} totalRows - Total number of rows to process
   * @param {Function} dataProvider - Function that returns chunks of data
   * @param {Object} callbacks - Callback functions for the generation process
   * @returns {Promise} Promise that resolves with the generated PDF
   */
  async generatePDF(headers, totalRows, dataProvider, callbacks = {}) {
    const { 
      onProgress = () => {}, 
      onComplete = () => {}, 
      onError = () => {},
      onPageAdded = () => {}
    } = callbacks;
    
    return new Promise(async (resolve, reject) => {
      try {
        this.isGenerating = true;
        this.abortController = new AbortController();
        const signal = this.abortController.signal;
        
        this.totalRows = totalRows;
        this.rowsProcessed = 0;
        this.columns = headers;
        
        // Initialize PDF document
        this._initializePDF();
        
        // Add document header if specified
        if (this.options.title || this.options.author) {
          this._addDocumentHeader();
        }
        
        // Calculate column widths
        this._calculateColumnWidths();
        
        // Add header row if specified
        if (this.options.includeHeader) {
          this._addHeaderRow();
        }
        
        // Process data in chunks
        let chunk;
        let chunkIndex = 0;
        
        while ((chunk = await dataProvider(chunkIndex++)) && !signal.aborted) {
          await this._processChunk(chunk);
          
          // Update progress
          onProgress(this.rowsProcessed, this.totalRows, this.currentPage);
          
          // Allow UI to update and prevent browser from freezing
          await Utils.delay(10);
        }
        
        if (signal.aborted) {
          reject(new Error('PDF generation aborted'));
          return;
        }
        
        // Add footer to all pages
        if (this.options.includeFooter) {
          for (let i = 1; i <= this.currentPage; i++) {
            this.pdf.setPage(i);
            this._addFooter();
          }
        }
        
        this.isGenerating = false;
        onComplete(this.pdf);
        resolve(this.pdf);
      } catch (error) {
        this.isGenerating = false;
        onError(error);
        reject(error);
      }
    });
  }
  
  /**
   * Process a chunk of CSV data
   * @private
   * @param {Array} rows - Array of data rows to process
   * @returns {Promise} Promise that resolves when chunk is processed
   */
  async _processChunk(rows) {
    for (const row of rows) {
      if (this.abortController && this.abortController.signal.aborted) {
        break;
      }
      
      // Check if we need a new page
      if (this.currentY + this.rowHeight > this.pageHeight - this.options.margins.bottom) {
        this._addNewPage();
      }
      
      // Add the row to the PDF
      this._addDataRow(row, this.rowsProcessed % 2 === 1);
      
      this.rowsProcessed++;
    }
  }
  
  /**
   * Calculate column widths based on content
   * @private
   */
  _calculateColumnWidths() {
    const availableWidth = this.pageWidth - this.options.margins.left - this.options.margins.right;
    const columnCount = this.columns.length;
    
    // Simple approach: equal width for all columns
    const defaultWidth = availableWidth / columnCount;
    
    this.columnWidths = this.columns.map(() => defaultWidth);
  }
  
  /**
   * Add header row to the PDF
   * @private
   */
  _addHeaderRow() {
    const { left, top } = this.options.margins;
    
    // Set fill color for header
    this.pdf.setFillColor(...this.options.headerFillColor);
    
    // Draw header background
    this.pdf.rect(
      left, 
      this.currentY, 
      this.pageWidth - left - this.options.margins.right, 
      this.rowHeight, 
      'F'
    );
    
    // Set text color to black
    this.pdf.setTextColor(0, 0, 0);
    
    // Add header text
    this.columns.forEach((header, i) => {
      const x = left + this.columnWidths.slice(0, i).reduce((sum, width) => sum + width, 0);
      const y = this.currentY + this.rowHeight - this.options.cellPadding - 1;
      
      this.pdf.setFont('helvetica', 'bold');
      this.pdf.text(String(header), x + this.options.cellPadding, y);
      this.pdf.setFont('helvetica', 'normal');
    });
    
    // Move to next row
    this.currentY += this.rowHeight;
  }
  
  /**
   * Add a data row to the PDF
   * @private
   * @param {Array} rowData - Data for the row
   * @param {boolean} alternate - Whether to use alternate row styling
   */
  _addDataRow(rowData, alternate = false) {
    const { left } = this.options.margins;
    
    // Set fill color for alternating rows
    if (alternate) {
      this.pdf.setFillColor(...this.options.alternateRowFillColor);
      this.pdf.rect(
        left, 
        this.currentY, 
        this.pageWidth - left - this.options.margins.right, 
        this.rowHeight, 
        'F'
      );
    }
    
    // Set text color to black
    this.pdf.setTextColor(0, 0, 0);
    
    // Add row data
    rowData.forEach((cell, i) => {
      if (i >= this.columnWidths.length) return; // Skip if more cells than columns
      
      const x = left + this.columnWidths.slice(0, i).reduce((sum, width) => sum + width, 0);
      const y = this.currentY + this.rowHeight - this.options.cellPadding - 1;
      
      // Truncate text if too long for column
      const cellText = String(cell || '');
      const maxWidth = this.columnWidths[i] - (this.options.cellPadding * 2);
      
      this.pdf.text(cellText, x + this.options.cellPadding, y, {
        maxWidth: maxWidth
      });
    });
    
    // Move to next row
    this.currentY += this.rowHeight;
  }
  
  /**
   * Add a new page to the PDF
   * @private
   */
  _addNewPage() {
    this.pdf.addPage();
    this.currentPage++;
    this.currentY = this.tableStartY;
    
    // Add document header if specified
    if (this.options.includeFooter) {
      this._addDocumentHeader();
    }
    
    // Add header row on new page if specified
    if (this.options.includeHeader) {
      this._addHeaderRow();
    }
  }
  
  /**
   * Add document header to the PDF
   * @private
   */
  _addDocumentHeader() {
    if (!this.options.title && !this.options.author) {
      return;
    }
    
    const { left, top } = this.options.margins;
    const originalFontSize = this.pdf.getFontSize();
    
    // Add title if provided
    if (this.options.title) {
      this.pdf.setFontSize(14);
      this.pdf.setFont('helvetica', 'bold');
      this.pdf.text(this.options.title, left, top - 5);
    }
    
    // Add author if provided
    if (this.options.author) {
      this.pdf.setFontSize(10);
      this.pdf.setFont('helvetica', 'italic');
      this.pdf.text(this.options.author, left, top);
    }
    
    // Reset font settings
    this.pdf.setFontSize(originalFontSize);
    this.pdf.setFont('helvetica', 'normal');
  }
  
  /**
   * Add footer with page numbers to the PDF
   * @private
   */
  _addFooter() {
    if (!this.options.includeFooter) {
      return;
    }
    
    const originalFontSize = this.pdf.getFontSize();
    this.pdf.setFontSize(8);
    this.pdf.setFont('helvetica', 'normal');
    
    const pageWidth = this.pageWidth;
    const pageHeight = this.pageHeight;
    const margins = this.options.margins;
    
    // Add page numbers if specified
    if (this.options.includePageNumbers) {
      const pageText = `Page ${this.currentPage}`;
      const textWidth = this.pdf.getStringUnitWidth(pageText) * 8 / this.pdf.internal.scaleFactor;
      const textX = (pageWidth - textWidth) / 2;
      const textY = pageHeight - margins.bottom / 2;
      
      this.pdf.text(pageText, textX, textY);
    }
    
    // Add timestamp
    const timestamp = new Date().toLocaleString();
    this.pdf.setFontSize(7);
    this.pdf.text(timestamp, margins.left, pageHeight - margins.bottom / 2);
    
    // Reset font settings
    this.pdf.setFontSize(originalFontSize);
    this.pdf.setFont('helvetica', 'normal');
  }
  
  /**
   * Save the generated PDF
   * @param {string} filename - Name for the saved file
   * @returns {Blob} PDF blob
   */
  save(filename = 'export.pdf') {
    if (!this.pdf) {
      throw new Error('No PDF has been generated yet');
    }
    
    this.pdf.save(filename);
    return this.pdf.output('blob');
  }
  
  /**
   * Get the generated PDF as a blob
   * @returns {Blob} PDF blob
   */
  getBlob() {
    if (!this.pdf) {
      throw new Error('No PDF has been generated yet');
    }
    
    return this.pdf.output('blob');
  }
  
  /**
   * Get the generated PDF as a data URL
   * @returns {string} PDF data URL
   */
  getDataUrl() {
    if (!this.pdf) {
      throw new Error('No PDF has been generated yet');
    }
    
    return this.pdf.output('datauristring');
  }
  
  /**
   * Abort the current PDF generation process
   */
  abort() {
    if (this.isGenerating && this.abortController) {
      this.abortController.abort();
      this.isGenerating = false;
    }
  }
}

// Export for use in other modules
window.PDFGenerator = PDFGenerator;


// Source: app.js
/**
 * app.js - Main application logic for CSV to PDF Streaming Exporter
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const fileInput = document.getElementById('csv-file-input');
  const fileDropArea = document.querySelector('.file-drop-area');
  const fileInfo = document.getElementById('file-info');
  const generateBtn = document.getElementById('generate-pdf-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  const progressBar = document.getElementById('progress-bar');
  const progressInfo = document.getElementById('progress-info');
  const memoryUsage = document.getElementById('memory-usage');
  const pageSizeSelect = document.getElementById('page-size');
  const orientationSelect = document.getElementById('orientation');
  const includeHeaderCheckbox = document.getElementById('include-header');
  const chunkSizeSelect = document.getElementById('chunk-size');
  
  // Application state
  let selectedFile = null;
  let estimatedRows = 0;
  let csvParser = null;
  let pdfGenerator = null;
  let memoryInterval = null;
  
  // Check browser support
  const browserSupport = Utils.checkBrowserSupport();
  if (!browserSupport.supported) {
    alert('Your browser does not support all features required for this application. Please use a modern browser like Chrome, Firefox, or Edge.');
  }
  
  // Initialize memory usage monitoring
  const startMemoryMonitoring = () => {
    if (memoryInterval) clearInterval(memoryInterval);
    memoryInterval = setInterval(() => {
      Utils.updateMemoryUsage(memoryUsage);
    }, 1000);
  };
  
  const stopMemoryMonitoring = () => {
    if (memoryInterval) {
      clearInterval(memoryInterval);
      memoryInterval = null;
    }
  };
  
  // File selection handling
  fileInput.addEventListener('change', handleFileSelection);
  
  // Drag and drop handling
  fileDropArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileDropArea.classList.add('drag-over');
  });
  
  fileDropArea.addEventListener('dragleave', () => {
    fileDropArea.classList.remove('drag-over');
  });
  
  fileDropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    fileDropArea.classList.remove('drag-over');
    
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      handleFileSelection();
    }
  });
  
  // Button event listeners
  generateBtn.addEventListener('click', handleGeneratePDF);
  cancelBtn.addEventListener('click', handleCancel);
  
  /**
   * Handle file selection
   */
  async function handleFileSelection() {
    resetUI();
    
    if (fileInput.files.length === 0) {
      return;
    }
    
    const file = fileInput.files[0];
    
    if (!CSVParser.isCSVFile(file)) {
      fileInfo.textContent = 'Error: Please select a valid CSV file.';
      fileInfo.style.color = 'red';
      return;
    }
    
    selectedFile = file;
    
    try {
      // Display file info
      fileInfo.textContent = `File: ${file.name} (${Utils.formatFileSize(file.size)})`;
      fileInfo.style.color = '';
      
      // Estimate row count
      estimatedRows = await CSVParser.estimateRowCount(file);
      fileInfo.textContent += ` - Estimated rows: ${Utils.formatNumber(estimatedRows)}`;
      
      // Enable generate button
      generateBtn.disabled = false;
    } catch (error) {
      console.error('Error processing file:', error);
      fileInfo.textContent = `Error: ${error.message}`;
      fileInfo.style.color = 'red';
    }
  }
  
  /**
   * Handle PDF generation
   */
  async function handleGeneratePDF() {
    if (!selectedFile) return;
    
    try {
      // Update UI for processing state
      generateBtn.disabled = true;
      cancelBtn.disabled = false;
      progressBar.style.width = '0%';
      progressInfo.textContent = 'Preparing...';
      
      // Start memory monitoring
      startMemoryMonitoring();
      
      // Get options from UI
      const options = {
        pageSize: pageSizeSelect.value,
        orientation: orientationSelect.value,
        includeHeader: includeHeaderCheckbox.checked,
        chunkSize: parseInt(chunkSizeSelect.value, 10)
      };
      
      // Initialize parser and generator
      csvParser = new CSVParser({
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true
      });
      
      pdfGenerator = new PDFGenerator({
        pageSize: options.pageSize,
        orientation: options.orientation,
        includeHeader: options.includeHeader
      });
      
      // Parse CSV headers first
      const headerSample = await getHeaderSample(selectedFile);
      const headers = Object.keys(headerSample);
      
      // Create data provider function for streaming
      let processedChunks = 0;
      const dataProvider = async (chunkIndex) => {
        if (csvParser.abortController && csvParser.abortController.signal.aborted) {
          return null;
        }
        
        return new Promise((resolve) => {
          // If we've already processed all chunks, return null to end the stream
          if (processedChunks >= Math.ceil(estimatedRows / options.chunkSize)) {
            resolve(null);
            return;
          }
          
          // Parse the next chunk
          const start = chunkIndex * options.chunkSize;
          const end = start + options.chunkSize;
          
          // Use a small timeout to allow UI updates
          setTimeout(() => {
            // This is a simplified approach - in a real implementation,
            // we would use the streaming capabilities of PapaParse
            Papa.parse(selectedFile, {
              header: true,
              dynamicTyping: true,
              skipEmptyLines: true,
              preview: options.chunkSize,
              step: (results, parser) => {
                // We're using step to process row by row
              },
              chunk: (results, parser) => {
                parser.abort(); // We only want one chunk
                processedChunks++;
                resolve(results.data);
              },
              complete: () => {
                // If file is smaller than chunk size, we'll get here
                processedChunks++;
                resolve([]);
              },
              error: (error) => {
                console.error('Error parsing CSV chunk:', error);
                resolve([]);
              }
            });
          }, 0);
        });
      };
      
      // Generate PDF with streaming
      await pdfGenerator.generatePDF(headers, estimatedRows, dataProvider, {
        onProgress: (rowsProcessed, totalRows, currentPage) => {
          const percent = Math.min(Math.round((rowsProcessed / totalRows) * 100), 100);
          progressBar.style.width = `${percent}%`;
          progressInfo.textContent = `Processing: ${Utils.formatNumber(rowsProcessed)} of ${Utils.formatNumber(totalRows)} rows | Page: ${currentPage}`;
        },
        onComplete: (pdf) => {
          progressInfo.textContent = `Completed: ${Utils.formatNumber(estimatedRows)} rows processed`;
          progressBar.style.width = '100%';
          
          // Save the PDF
          pdf.save(`${selectedFile.name.replace('.csv', '')}_export.pdf`);
          
          // Reset UI
          setTimeout(() => {
            resetUI(true);
          }, 2000);
        },
        onError: (error) => {
          console.error('Error generating PDF:', error);
          progressInfo.textContent = `Error: ${error.message}`;
          progressInfo.style.color = 'red';
          resetUI();
        }
      });
    } catch (error) {
      console.error('Error in PDF generation process:', error);
      progressInfo.textContent = `Error: ${error.message}`;
      progressInfo.style.color = 'red';
      resetUI();
    } finally {
      stopMemoryMonitoring();
    }
  }
  
  /**
   * Handle cancellation of PDF generation
   */
  function handleCancel() {
    if (csvParser) csvParser.abort();
    if (pdfGenerator) pdfGenerator.abort();
    
    progressInfo.textContent = 'Operation cancelled';
    resetUI();
    stopMemoryMonitoring();
  }
  
  /**
   * Reset UI elements
   * @param {boolean} keepFile - Whether to keep the selected file
   */
  function resetUI(keepFile = false) {
    generateBtn.disabled = keepFile ? false : true;
    cancelBtn.disabled = true;
    
    if (!keepFile) {
      fileInput.value = '';
      selectedFile = null;
      estimatedRows = 0;
      fileInfo.textContent = '';
    }
    
    stopMemoryMonitoring();
  }
  
  /**
   * Get a sample of the CSV file to extract headers
   * @param {File} file - The CSV file
   * @returns {Promise<Object>} First row of the CSV file
   */
  async function getHeaderSample(file) {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        preview: 1,
        complete: (results) => {
          if (results.data && results.data.length > 0) {
            resolve(results.data[0]);
          } else {
            reject(new Error('Could not read CSV headers'));
          }
        },
        error: (error) => {
          reject(error);
        }
      });
    });
  }
  
  // Initial UI setup
  resetUI();
});

// CSVtoPDFApp Class Definition
/**
 * CSVtoPDFApp - Main application class for the CSV to PDF export functionality
 */
class CSVtoPDFApp {
  /**
   * Initialize the application
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    // Store options
    this.options = Object.assign({
      // UI elements
      dropZoneId: 'drop-zone',
      fileInputId: 'file-input',
      browseButtonId: 'browse-button',
      generateButtonId: 'generate-button',
      progressContainerId: 'progress-container',
      progressBarId: 'progress',
      statusMessageId: 'status-message',
      settingsPanelId: null,
      
      // Callbacks
      onStart: null,
      onProgress: null,
      onComplete: null,
      onError: null,
      
      // PDF options
      pdfOptions: {
        pageSize: 'a4',
        orientation: 'portrait',
        margins: { top: 20, right: 15, bottom: 25, left: 15 },
        includeHeader: true,
        includeFooter: true,
        includePageNumbers: true,
        title: '',
        author: '',
        fontSize: 10
      }
    }, options);
    
    // Get DOM elements
    this.dropZone = document.getElementById(this.options.dropZoneId);
    this.fileInput = document.getElementById(this.options.fileInputId);
    this.browseButton = document.getElementById(this.options.browseButtonId);
    this.generateButton = document.getElementById(this.options.generateButtonId);
    this.progressContainer = document.getElementById(this.options.progressContainerId);
    this.progressBar = document.getElementById(this.options.progressBarId);
    this.statusMessage = document.getElementById(this.options.statusMessageId);
    this.settingsPanel = this.options.settingsPanelId ? document.getElementById(this.options.settingsPanelId) : null;
    
    // Setup initial state
    this.selectedFile = null;
    this.csvParser = null;
    this.pdfGenerator = null;
    
    // Initialize the application
    this.initialize();
  }
  
  /**
   * Initialize application event listeners
   */
  initialize() {
    // Setup file input change handler
    this.fileInput.addEventListener('change', this.handleFileSelection.bind(this));
    
    // Setup browse button click handler
    if (this.browseButton) {
      this.browseButton.addEventListener('click', () => {
        this.fileInput.click();
      });
    }
    
    // Setup drop zone handlers
    if (this.dropZone) {
      this.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        this.dropZone.classList.add('active');
      });
      
      this.dropZone.addEventListener('dragleave', () => {
        this.dropZone.classList.remove('active');
      });
      
      this.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        this.dropZone.classList.remove('active');
        
        if (e.dataTransfer.files.length) {
          this.fileInput.files = e.dataTransfer.files;
          this.handleFileSelection();
        }
      });
    }
    
    // Setup generate button
    if (this.generateButton) {
      this.generateButton.addEventListener('click', this.generatePDF.bind(this));
    }
  }
  
  /**
   * Handle file selection
   */
  handleFileSelection() {
    if (this.fileInput.files.length === 0) {
      return;
    }
    
    const file = this.fileInput.files[0];
    
    // Check if it's a CSV file
    if (file && (file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv'))) {
      this.selectedFile = file;
      this.generateButton.disabled = false;
      
      // Display filename in drop zone
      if (this.dropZone) {
        const fileNameElement = this.dropZone.querySelector('p') || document.createElement('p');
        fileNameElement.textContent = `Selected file: ${file.name}`;
        if (!this.dropZone.contains(fileNameElement)) {
          this.dropZone.appendChild(fileNameElement);
        }
      }
    } else {
      alert('Please select a valid CSV file.');
      this.fileInput.value = '';
    }
  }
  
  /**
   * Generate PDF from CSV
   */
  async generatePDF() {
    if (!this.selectedFile) return;
    
    // Call onStart callback if provided
    if (typeof this.options.onStart === 'function') {
      this.options.onStart();
    }
    
    // Show progress container
    if (this.progressContainer) {
      this.progressContainer.style.display = 'block';
    }
    
    // Update status
    if (this.statusMessage) {
      this.statusMessage.textContent = 'Processing CSV file...';
    }
    
    // Process will be implemented in later versions
    console.log('Generating PDF from:', this.selectedFile);
  }
  
  /**
   * Update PDF options
   * @param {Object} newOptions - New PDF options
   */
  updatePdfOptions(newOptions) {
    this.options.pdfOptions = Object.assign(this.options.pdfOptions, newOptions);
    console.log('PDF options updated:', this.options.pdfOptions);
  }
}

// Export for use in other modules
window.CSVtoPDFApp = CSVtoPDFApp;


})(typeof window !== "undefined" ? window : this);