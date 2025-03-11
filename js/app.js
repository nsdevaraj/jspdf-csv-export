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
