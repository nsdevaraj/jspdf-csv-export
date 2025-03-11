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
