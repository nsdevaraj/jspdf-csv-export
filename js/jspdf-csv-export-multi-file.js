/**
 * jsPDF CSV Streaming Implementation with Multi-File Support
 * A memory-efficient solution for exporting large CSV datasets to PDF
 * Version: 1.1.0
 * License: MIT
 * Date: 2025-03-12
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


// Source: multi-file-pdf-generator.js
/**
 * Enhanced PDF Generator with multi-file support for extremely large datasets
 * This class extends the original PDFGenerator with functionality to split output
 * into multiple PDF files when handling very large datasets (e.g., 1M+ rows)
 */
class MultiFilePDFGenerator {
  /**
   * Create a new MultiFilePDFGenerator instance
   * @param {Object} options - PDF generation options
   */
  constructor(options = {}) {
    this.options = {
      pageSize: 'a4',
      orientation: 'portrait',
      margins: {
        top: 15,
        right: 15,
        bottom: 25,
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
      
      // Multi-file specific options
      rowsPerFile: 50000, // Default: 50,000 rows per file
      maxFilesInMemory: 1, // Default: generate one file at a time
      fileNamePattern: 'export-{index}.pdf', // Pattern for file naming
      createZipArchive: true, // Whether to create a ZIP archive of all files
      ...options
    };
    
    this.pdfGenerators = []; // Array of PDFGenerator instances
    this.currentFileIndex = 0;
    this.currentRowInFile = 0;
    this.totalFilesNeeded = 0;
    this.completedFiles = [];
    this.abortController = null;
    this.isGenerating = false;
    this.totalRows = 0;
    this.rowsProcessed = 0;
    this.columns = [];
  }
  
  /**
   * Generate multiple PDF files from CSV data using streaming approach
   * @param {Array} headers - CSV header row
   * @param {number} totalRows - Total number of rows to process
   * @param {Function} dataProvider - Function that returns chunks of data
   * @param {Object} callbacks - Callback functions for the generation process
   * @returns {Promise} Promise that resolves with array of generated PDFs
   */
  async generatePDFs(headers, totalRows, dataProvider, callbacks = {}) {
    const { 
      onProgress = () => {}, 
      onComplete = () => {}, 
      onError = () => {},
      onFileComplete = () => {},
      onFileStart = () => {}
    } = callbacks;
    
    return new Promise(async (resolve, reject) => {
      try {
        this.isGenerating = true;
        this.abortController = new AbortController();
        const signal = this.abortController.signal;
        
        this.totalRows = totalRows;
        this.rowsProcessed = 0;
        this.columns = headers;
        this.completedFiles = [];
        
        // Calculate how many files we'll need
        this.totalFilesNeeded = Math.ceil(totalRows / this.options.rowsPerFile);
        console.log(`Splitting ${totalRows} rows into ${this.totalFilesNeeded} files`);
        
        // Initialize first PDF generator
        this._initializeNewPdfGenerator();
        
        // Process data in chunks
        let chunk;
        let chunkIndex = 0;
        
        while ((chunk = await dataProvider(chunkIndex++)) && !signal.aborted) {
          await this._processChunk(chunk, onFileComplete, onFileStart);
          
          // Update progress
          onProgress(this.rowsProcessed, this.totalRows, this.currentFileIndex + 1, this.totalFilesNeeded);
          
          // Allow UI to update and prevent browser from freezing
          await Utils.delay(10);
        }
        
        if (signal.aborted) {
          reject(new Error('PDF generation aborted'));
          return;
        }
        
        // Finalize the last file if it has any rows
        if (this.currentRowInFile > 0) {
          const finalPdf = await this._finalizeCurrentFile();
          this.completedFiles.push({
            index: this.currentFileIndex,
            pdf: finalPdf,
            fileName: this._getFileName(this.currentFileIndex)
          });
          
          if (onFileComplete) {
            onFileComplete(this.currentFileIndex, finalPdf, this._getFileName(this.currentFileIndex));
          }
        }
        
        this.isGenerating = false;
        
        // Create ZIP archive if requested and if we have multiple files
        let zipArchive = null;
        if (this.options.createZipArchive && this.completedFiles.length > 1) {
          zipArchive = await this._createZipArchive();
        }
        
        onComplete({
          files: this.completedFiles,
          totalFiles: this.totalFilesNeeded,
          zipArchive: zipArchive
        });
        
        resolve({
          files: this.completedFiles,
          totalFiles: this.totalFilesNeeded,
          zipArchive: zipArchive
        });
      } catch (error) {
        this.isGenerating = false;
        onError(error);
        reject(error);
      }
    });
  }
  
  /**
   * Process a chunk of CSV data
   * @param {Array} rows - Array of data rows
   * @param {Function} onFileComplete - Callback when a file is completed
   * @param {Function} onFileStart - Callback when a new file is started
   * @private
   */
  async _processChunk(rows, onFileComplete, onFileStart) {
    for (const row of rows) {
      // Check if we need to start a new file
      if (this.currentRowInFile >= this.options.rowsPerFile) {
        // Finalize current file
        const completedPdf = await this._finalizeCurrentFile();
        this.completedFiles.push({
          index: this.currentFileIndex,
          pdf: completedPdf,
          fileName: this._getFileName(this.currentFileIndex)
        });
        
        if (onFileComplete) {
          onFileComplete(this.currentFileIndex, completedPdf, this._getFileName(this.currentFileIndex));
        }
        
        // Start new file
        this.currentFileIndex++;
        this.currentRowInFile = 0;
        this._initializeNewPdfGenerator();
        
        if (onFileStart) {
          onFileStart(this.currentFileIndex, this._getFileName(this.currentFileIndex));
        }
        
        // Allow UI to update and prevent browser from freezing
        await Utils.delay(50);
      }
      
      // Add row to current PDF
      const currentGenerator = this.pdfGenerators[0];
      await currentGenerator._addDataRow(row);
      
      this.currentRowInFile++;
      this.rowsProcessed++;
    }
  }
  
  /**
   * Initialize a new PDF generator
   * @private
   */
  _initializeNewPdfGenerator() {
    // Create new PDF generator with current options
    const generator = new PDFGenerator({
      ...this.options,
      title: this._getTitle(this.currentFileIndex)
    });
    
    // Initialize PDF document
    generator._initializePDF();
    
    // Add document header if specified
    if (this.options.title || this.options.author) {
      generator._addDocumentHeader();
    }
    
    // Calculate column widths
    generator.columns = this.columns;
    generator._calculateColumnWidths();
    
    // Add header row if specified
    if (this.options.includeHeader) {
      generator._addHeaderRow();
    }
    
    // Add to array of generators
    this.pdfGenerators.unshift(generator);
    
    // If we have more generators than allowed in memory, remove the oldest one
    if (this.pdfGenerators.length > this.options.maxFilesInMemory) {
      this.pdfGenerators.pop();
    }
  }
  
  /**
   * Finalize the current PDF file
   * @returns {Object} The completed PDF document
   * @private
   */
  async _finalizeCurrentFile() {
    const currentGenerator = this.pdfGenerators[0];
    
    // Add footer to all pages
    if (this.options.includeFooter) {
      for (let i = 1; i <= currentGenerator.currentPage; i++) {
        currentGenerator.pdf.setPage(i);
        currentGenerator._addFooter();
      }
    }
    
    return currentGenerator.pdf;
  }
  
  /**
   * Get file name for a specific file index
   * @param {number} index - File index
   * @returns {string} File name
   * @private
   */
  _getFileName(index) {
    return this.options.fileNamePattern.replace('{index}', index + 1);
  }
  
  /**
   * Get title for a specific file index
   * @param {number} index - File index
   * @returns {string} Title
   * @private
   */
  _getTitle(index) {
    if (!this.options.title) return '';
    return `${this.options.title} (Part ${index + 1} of ${this.totalFilesNeeded})`;
  }
  
  /**
   * Create a ZIP archive containing all PDF files
   * @returns {Blob} ZIP archive as Blob
   * @private
   */
  async _createZipArchive() {
    // This requires JSZip library to be available
    if (typeof JSZip === 'undefined') {
      console.warn('JSZip library not found. ZIP archive creation skipped.');
      return null;
    }
    
    const zip = new JSZip();
    
    // Add each PDF to the ZIP
    for (const file of this.completedFiles) {
      const pdfBlob = file.pdf.output('blob');
      zip.file(file.fileName, pdfBlob);
    }
    
    // Generate ZIP file
    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });
    
    return zipBlob;
  }
  
  /**
   * Save a ZIP archive
   * @param {Blob} zipBlob - ZIP archive as Blob
   * @param {string} fileName - Name for the saved file
   */
  saveZipArchive(zipBlob, fileName = 'export.zip') {
    if (!zipBlob) return;
    
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    
    // Clean up
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 100);
  }
  
  /**
   * Abort the PDF generation process
   */
  abort() {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.isGenerating = false;
  }
}


// Source: batch-download-manager.js
/**
 * Batch Download Manager for handling multiple PDF files
 * This class provides functionality to download multiple files as a ZIP archive
 * or sequentially download individual files
 */
class BatchDownloadManager {
  /**
   * Create a new BatchDownloadManager instance
   * @param {Object} options - Download manager options
   */
  constructor(options = {}) {
    this.options = {
      zipFileName: 'export.zip',
      maxConcurrentDownloads: 2,
      downloadDelay: 500, // ms between downloads
      useZipForMultipleFiles: true,
      showProgressInConsole: false,
      ...options
    };
    
    this.downloadQueue = [];
    this.activeDownloads = 0;
    this.isProcessing = false;
    this.abortController = null;
  }
  
  /**
   * Add a file to the download queue
   * @param {Object} file - File object with pdf and fileName properties
   * @returns {number} Current queue length
   */
  addToQueue(file) {
    this.downloadQueue.push(file);
    return this.downloadQueue.length;
  }
  
  /**
   * Add multiple files to the download queue
   * @param {Array} files - Array of file objects
   * @returns {number} Current queue length
   */
  addMultipleToQueue(files) {
    this.downloadQueue.push(...files);
    return this.downloadQueue.length;
  }
  
  /**
   * Start processing the download queue
   * @param {Object} callbacks - Callback functions for the download process
   * @returns {Promise} Promise that resolves when all downloads are complete
   */
  startDownloads(callbacks = {}) {
    const { 
      onStart = () => {}, 
      onProgress = () => {}, 
      onComplete = () => {}, 
      onError = () => {},
      onFileDownloadStart = () => {},
      onFileDownloadComplete = () => {}
    } = callbacks;
    
    return new Promise(async (resolve, reject) => {
      try {
        if (this.isProcessing) {
          throw new Error('Download process already in progress');
        }
        
        this.isProcessing = true;
        this.abortController = new AbortController();
        const signal = this.abortController.signal;
        
        // Call onStart callback
        onStart(this.downloadQueue.length);
        
        // If we have multiple files and ZIP option is enabled, create a ZIP archive
        if (this.downloadQueue.length > 1 && this.options.useZipForMultipleFiles) {
          await this._downloadAsZip(callbacks);
        } else {
          // Otherwise download files sequentially
          await this._downloadSequentially(callbacks, signal);
        }
        
        if (signal.aborted) {
          reject(new Error('Download process aborted'));
          return;
        }
        
        this.isProcessing = false;
        onComplete();
        resolve();
      } catch (error) {
        this.isProcessing = false;
        onError(error);
        reject(error);
      }
    });
  }
  
  /**
   * Download all files as a ZIP archive
   * @param {Object} callbacks - Callback functions for the download process
   * @private
   */
  async _downloadAsZip(callbacks) {
    const { onProgress, onComplete, onError } = callbacks;
    
    try {
      // Check if JSZip is available
      if (typeof JSZip === 'undefined') {
        throw new Error('JSZip library not found. Cannot create ZIP archive.');
      }
      
      const zip = new JSZip();
      
      // Add each PDF to the ZIP
      for (let i = 0; i < this.downloadQueue.length; i++) {
        const file = this.downloadQueue[i];
        const pdfBlob = file.pdf.output('blob');
        zip.file(file.fileName, pdfBlob);
        
        // Update progress
        onProgress(i + 1, this.downloadQueue.length);
      }
      
      // Generate ZIP file
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      }, (metadata) => {
        // Update progress during ZIP generation
        if (metadata.percent) {
          onProgress(this.downloadQueue.length, this.downloadQueue.length, metadata.percent);
        }
      });
      
      // Download the ZIP file
      this._downloadBlob(zipBlob, this.options.zipFileName);
      
    } catch (error) {
      onError(error);
      throw error;
    }
  }
  
  /**
   * Download files sequentially
   * @param {Object} callbacks - Callback functions for the download process
   * @param {AbortSignal} signal - Abort signal
   * @private
   */
  async _downloadSequentially(callbacks, signal) {
    const { onProgress, onFileDownloadStart, onFileDownloadComplete } = callbacks;
    
    // Create a queue of download tasks
    const tasks = this.downloadQueue.map((file, index) => async () => {
      if (signal.aborted) return;
      
      // Call file download start callback
      onFileDownloadStart(index, file.fileName);
      
      // Log to console if enabled
      if (this.options.showProgressInConsole) {
        console.log(`Downloading file ${index + 1}/${this.downloadQueue.length}: ${file.fileName}`);
      }
      
      // Download the file
      file.pdf.save(file.fileName);
      
      // Wait for a short delay to prevent browser issues
      await new Promise(resolve => setTimeout(resolve, this.options.downloadDelay));
      
      // Call file download complete callback
      onFileDownloadComplete(index, file.fileName);
      
      // Update overall progress
      onProgress(index + 1, this.downloadQueue.length);
    });
    
    // Process tasks with limited concurrency
    await this._processTasksWithConcurrencyLimit(tasks, this.options.maxConcurrentDownloads, signal);
  }
  
  /**
   * Process tasks with a concurrency limit
   * @param {Array} tasks - Array of task functions
   * @param {number} concurrencyLimit - Maximum number of concurrent tasks
   * @param {AbortSignal} signal - Abort signal
   * @private
   */
  async _processTasksWithConcurrencyLimit(tasks, concurrencyLimit, signal) {
    // Create a copy of the tasks array
    const taskQueue = [...tasks];
    const runningTasks = [];
    
    // Process tasks until queue is empty
    while (taskQueue.length > 0 && !signal.aborted) {
      // Fill up to concurrency limit
      while (runningTasks.length < concurrencyLimit && taskQueue.length > 0 && !signal.aborted) {
        const task = taskQueue.shift();
        const taskPromise = task().then(() => {
          // Remove task from running tasks when complete
          const index = runningTasks.indexOf(taskPromise);
          if (index !== -1) {
            runningTasks.splice(index, 1);
          }
        });
        
        runningTasks.push(taskPromise);
      }
      
      // Wait for at least one task to complete
      if (runningTasks.length > 0) {
        await Promise.race(runningTasks);
      }
    }
    
    // Wait for all remaining tasks to complete
    if (runningTasks.length > 0 && !signal.aborted) {
      await Promise.all(runningTasks);
    }
  }
  
  /**
   * Download a blob as a file
   * @param {Blob} blob - Blob to download
   * @param {string} fileName - Name for the downloaded file
   * @private
   */
  _downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    
    // Clean up
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 100);
  }
  
  /**
   * Abort the download process
   */
  abort() {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.isProcessing = false;
  }
  
  /**
   * Clear the download queue
   */
  clearQueue() {
    this.downloadQueue = [];
  }
}


// Source: multi-file-app.js
/**
 * Enhanced CSV to PDF App with multi-file support for extremely large datasets
 * This class extends the original app with functionality to handle very large CSV files
 * by splitting the output into multiple PDF files and providing batch download options
 */
class MultiFileCSVtoPDFApp {
  /**
   * Create a new MultiFileCSVtoPDFApp instance
   * @param {Object} options - Application options
   */
  constructor(options = {}) {
    this.options = {
      // UI element IDs
      dropZoneId: 'drop-zone',
      fileInputId: 'file-input',
      browseButtonId: 'browse-button',
      generateButtonId: 'generate-button',
      progressContainerId: 'progress-container',
      progressBarId: 'progress',
      statusMessageId: 'status-message',
      settingsPanelId: 'settings-panel',
      fileListContainerId: 'file-list-container',
      
      // CSV parsing options
      csvOptions: {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        chunkSize: 1000
      },
      
      // PDF generation options
      pdfOptions: {
        pageSize: 'a4',
        orientation: 'portrait',
        rowsPerFile: 50000, // Default: 50,000 rows per file
        maxFilesInMemory: 1, // Default: generate one file at a time
        fileNamePattern: 'export-{index}.pdf',
        createZipArchive: true
      },
      
      // Callbacks
      onStart: null,
      onProgress: null,
      onComplete: null,
      onError: null,
      onFileComplete: null,
      onFileStart: null,
      
      ...options
    };
    
    // Initialize properties
    this.csvParser = null;
    this.pdfGenerator = null;
    this.selectedFile = null;
    this.isGenerating = false;
    this.csvHeaders = [];
    this.totalRows = 0;
    this.completedFiles = [];
    
    // Initialize UI elements
    this._initializeUI();
  }
  
  /**
   * Initialize UI elements and event listeners
   * @private
   */
  _initializeUI() {
    // Get UI elements
    this.dropZone = document.getElementById(this.options.dropZoneId);
    this.fileInput = document.getElementById(this.options.fileInputId);
    this.browseButton = document.getElementById(this.options.browseButtonId);
    this.generateButton = document.getElementById(this.options.generateButtonId);
    this.progressContainer = document.getElementById(this.options.progressContainerId);
    this.progressBar = document.getElementById(this.options.progressBarId);
    this.statusMessage = document.getElementById(this.options.statusMessageId);
    this.fileListContainer = document.getElementById(this.options.fileListContainerId);
    
    // Create file list container if it doesn't exist
    if (!this.fileListContainer && this.progressContainer) {
      this.fileListContainer = document.createElement('div');
      this.fileListContainer.id = this.options.fileListContainerId;
      this.fileListContainer.className = 'file-list-container';
      this.progressContainer.parentNode.insertBefore(
        this.fileListContainer, 
        this.progressContainer.nextSibling
      );
    }
    
    // Initialize CSV parser
    this.csvParser = new CSVParser(this.options.csvOptions);
    
    // Add event listeners
    if (this.fileInput) {
      this.fileInput.addEventListener('change', this._handleFileSelect.bind(this));
    }
    
    if (this.browseButton) {
      this.browseButton.addEventListener('click', () => {
        this.fileInput.click();
      });
    }
    
    if (this.generateButton) {
      this.generateButton.addEventListener('click', this._handleGenerate.bind(this));
    }
    
    if (this.dropZone) {
      this.dropZone.addEventListener('dragover', this._handleDragOver.bind(this));
      this.dropZone.addEventListener('dragleave', this._handleDragLeave.bind(this));
      this.dropZone.addEventListener('drop', this._handleDrop.bind(this));
    }
    
    // Initialize JSZip if available
    if (typeof JSZip === 'undefined') {
      console.warn('JSZip library not found. ZIP archive creation will be disabled.');
      this.options.pdfOptions.createZipArchive = false;
    }
  }
  
  /**
   * Handle file selection
   * @param {Event} event - File input change event
   * @private
   */
  _handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
      this._setSelectedFile(file);
    }
  }
  
  /**
   * Handle file drop
   * @param {Event} event - Drop event
   * @private
   */
  _handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    
    this.dropZone.classList.remove('active');
    
    const file = event.dataTransfer.files[0];
    if (file) {
      this._setSelectedFile(file);
    }
  }
  
  /**
   * Handle drag over
   * @param {Event} event - Drag over event
   * @private
   */
  _handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    this.dropZone.classList.add('active');
  }
  
  /**
   * Handle drag leave
   * @param {Event} event - Drag leave event
   * @private
   */
  _handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    this.dropZone.classList.remove('active');
  }
  
  /**
   * Set selected file and update UI
   * @param {File} file - Selected file
   * @private
   */
  _setSelectedFile(file) {
    this.selectedFile = file;
    
    if (this.dropZone) {
      this.dropZone.innerHTML = `
        <p>Selected file: <strong>${file.name}</strong> (${this._formatFileSize(file.size)})</p>
        <button id="change-file-button" class="btn">Change File</button>
      `;
      
      document.getElementById('change-file-button').addEventListener('click', () => {
        this.fileInput.click();
      });
    }
    
    if (this.generateButton) {
      this.generateButton.disabled = false;
    }
    
    // Reset file list
    if (this.fileListContainer) {
      this.fileListContainer.innerHTML = '';
      this.fileListContainer.style.display = 'none';
    }
    
    // Reset completed files
    this.completedFiles = [];
  }
  
  /**
   * Format file size in human-readable format
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted file size
   * @private
   */
  _formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' bytes';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    else return (bytes / 1073741824).toFixed(1) + ' GB';
  }
  
  /**
   * Handle generate button click
   * @private
   */
  _handleGenerate() {
    if (!this.selectedFile || this.isGenerating) return;
    
    this.isGenerating = true;
    
    if (this.generateButton) {
      this.generateButton.disabled = true;
    }
    
    if (this.progressContainer) {
      this.progressContainer.style.display = 'block';
    }
    
    if (this.progressBar) {
      this.progressBar.style.width = '0%';
    }
    
    if (this.statusMessage) {
      this.statusMessage.textContent = 'Analyzing CSV file...';
    }
    
    // Reset file list
    if (this.fileListContainer) {
      this.fileListContainer.innerHTML = '';
      this.fileListContainer.style.display = 'block';
    }
    
    // Reset completed files
    this.completedFiles = [];
    
    // Call onStart callback if provided
    if (typeof this.options.onStart === 'function') {
      this.options.onStart();
    }
    
    // Start CSV parsing to get headers and row count
    this._analyzeCSV();
  }
  
  /**
   * Analyze CSV file to get headers and row count
   * @private
   */
  _analyzeCSV() {
    this.csvParser.parseFile(this.selectedFile, {
      onChunk: (rows, meta) => {
        if (!this.csvHeaders.length && meta.fields) {
          this.csvHeaders = meta.fields;
        }
        this.totalRows = meta.cursor;
        
        if (this.statusMessage) {
          this.statusMessage.textContent = `Analyzing CSV: ${meta.cursor.toLocaleString()} rows processed...`;
        }
      },
      onComplete: (results) => {
        this.totalRows = results.data.length;
        
        if (this.statusMessage) {
          this.statusMessage.textContent = `CSV analysis complete. Found ${this.totalRows.toLocaleString()} rows.`;
        }
        
        // Start PDF generation
        this._generatePDFs();
      },
      onError: (error) => {
        this._handleError(error);
      }
    });
  }
  
  /**
   * Generate PDFs from CSV data
   * @private
   */
  _generatePDFs() {
    // Create PDF generator
    this.pdfGenerator = new MultiFilePDFGenerator(this.options.pdfOptions);
    
    // Create data provider function
    const dataProvider = async (chunkIndex) => {
      return new Promise((resolve, reject) => {
        let chunkData = [];
        let chunkCount = 0;
        
        this.csvParser.parseFile(this.selectedFile, {
          chunk: (rows, parser) => {
            if (chunkCount === chunkIndex) {
              chunkData = rows;
              parser.abort();
            }
            chunkCount++;
          },
          complete: () => {
            resolve(chunkData.length > 0 ? chunkData : null);
          },
          error: (error) => {
            reject(error);
          }
        });
      });
    };
    
    // Generate PDFs
    this.pdfGenerator.generatePDFs(
      this.csvHeaders,
      this.totalRows,
      dataProvider,
      {
        onProgress: (processed, total, currentFile, totalFiles) => {
          const percent = Math.round((processed / total) * 100);
          
          if (this.progressBar) {
            this.progressBar.style.width = `${percent}%`;
          }
          
          if (this.statusMessage) {
            this.statusMessage.textContent = `Generating PDF ${currentFile}/${totalFiles}: ${percent}% complete (${processed.toLocaleString()}/${total.toLocaleString()} rows)`;
          }
          
          // Call onProgress callback if provided
          if (typeof this.options.onProgress === 'function') {
            this.options.onProgress(processed, total, currentFile, totalFiles);
          }
        },
        onFileStart: (fileIndex, fileName) => {
          // Create file item in list
          if (this.fileListContainer) {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.id = `file-item-${fileIndex}`;
            fileItem.innerHTML = `
              <div class="file-item-name">${fileName}</div>
              <div class="file-item-status">Generating...</div>
              <div class="file-item-progress">
                <div class="file-item-progress-bar" id="file-progress-${fileIndex}"></div>
              </div>
            `;
            this.fileListContainer.appendChild(fileItem);
          }
          
          // Call onFileStart callback if provided
          if (typeof this.options.onFileStart === 'function') {
            this.options.onFileStart(fileIndex, fileName);
          }
        },
        onFileComplete: (fileIndex, pdf, fileName) => {
          // Add to completed files
          this.completedFiles.push({
            index: fileIndex,
            pdf: pdf,
            fileName: fileName
          });
          
          // Update file item in list
          if (this.fileListContainer) {
            const fileItem = document.getElementById(`file-item-${fileIndex}`);
            if (fileItem) {
              const fileItemStatus = fileItem.querySelector('.file-item-status');
              const fileItemProgress = fileItem.querySelector('.file-item-progress');
              
              if (fileItemStatus) {
                fileItemStatus.innerHTML = `
                  <button class="download-button" data-index="${fileIndex}">Download</button>
                `;
                
                // Add download button event listener
                const downloadButton = fileItemStatus.querySelector('.download-button');
                if (downloadButton) {
                  downloadButton.addEventListener('click', () => {
                    const file = this.completedFiles.find(f => f.index === fileIndex);
                    if (file) {
                      file.pdf.save(file.fileName);
                    }
                  });
                }
              }
              
              if (fileItemProgress) {
                fileItemProgress.querySelector('.file-item-progress-bar').style.width = '100%';
              }
            }
          }
          
          // Call onFileComplete callback if provided
          if (typeof this.options.onFileComplete === 'function') {
            this.options.onFileComplete(fileIndex, pdf, fileName);
          }
        },
        onComplete: (result) => {
          this._handleComplete(result);
        },
        onError: (error) => {
          this._handleError(error);
        }
      }
    );
  }
  
  /**
   * Handle completion of PDF generation
   * @param {Object} result - Generation result
   * @private
   */
  _handleComplete(result) {
    this.isGenerating = false;
    
    if (this.generateButton) {
      this.generateButton.disabled = false;
    }
    
    if (this.statusMessage) {
      this.statusMessage.textContent = `PDF generation complete. Created ${result.files.length} files.`;
    }
    
    // Add download all button if we have multiple files and ZIP archive
    if (result.files.length > 1 && result.zipArchive) {
      const downloadAllContainer = document.createElement('div');
      downloadAllContainer.className = 'download-all-container';
      downloadAllContainer.innerHTML = `
        <button class="download-all-button">Download All Files (ZIP)</button>
      `;
      
      if (this.fileListContainer) {
        this.fileListContainer.insertBefore(downloadAllContainer, this.fileListContainer.firstChild);
      }
      
      const downloadAllButton = downloadAllContainer.querySelector('.download-all-button');
      if (downloadAllButton) {
        downloadAllButton.addEventListener('click', () => {
          this.pdfGenerator.saveZipArchive(result.zipArchive, 'export.zip');
        });
      }
    }
    
    // Call onComplete callback if provided
    if (typeof this.options.onComplete === 'function') {
      this.options.onComplete(result);
    }
  }
  
  /**
   * Handle error during PDF generation
   * @param {Error} error - Error object
   * @private
   */
  _handleError(error) {
    console.error('PDF generation error:', error);
    
    this.isGenerating = false;
    
    if (this.generateButton) {
      this.generateButton.disabled = false;
    }
    
    if (this.statusMessage) {
      this.statusMessage.textContent = `Error: ${error.message}`;
    }
    
    // Call onError callback if provided
    if (typeof this.options.onError === 'function') {
      this.options.onError(error);
    }
  }
  
  /**
   * Update PDF options
   * @param {Object} options - New PDF options
   */
  updatePdfOptions(options) {
    this.options.pdfOptions = {
      ...this.options.pdfOptions,
      ...options
    };
  }
  
  /**
   * Update CSV options
   * @param {Object} options - New CSV options
   */
  updateCsvOptions(options) {
    this.options.csvOptions = {
      ...this.options.csvOptions,
      ...options
    };
    
    // Reinitialize CSV parser with new options
    this.csvParser = new CSVParser(this.options.csvOptions);
  }
}


})(typeof window !== "undefined" ? window : this);