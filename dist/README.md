# jsPDF CSV Streaming Implementation Documentation

## Overview

This library provides a memory-efficient solution for exporting large CSV datasets to PDF using a streaming approach. It's designed to handle CSV files with hundreds of thousands of rows without causing browser memory issues or UI freezing.

## Features

- **Memory-efficient CSV parsing** using streaming techniques
- **Chunked processing** to prevent browser freezing
- **Progress tracking** with visual indicators
- **Configurable PDF output options** (page size, orientation, etc.)
- **Error handling and recovery** mechanisms
- **Drag-and-drop file selection** interface
- **Headers and footers** with page numbering

## Installation

Include the required libraries in your HTML:

```html
<!-- Include jsPDF library -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/3.0.0/jspdf.umd.min.js"></script>

<!-- Include PapaParse for CSV parsing -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.3.2/papaparse.min.js"></script>

<!-- Include our library files -->
<script src="js/utils.js"></script>
<script src="js/csv-parser.js"></script>
<script src="js/pdf-generator.js"></script>
<script src="js/app.js"></script>
```

## Usage

### Basic Usage

```javascript
// Initialize the application
const app = new CSVtoPDFApp({
  dropZoneId: 'drop-zone',
  fileInputId: 'file-input',
  generateButtonId: 'generate-button',
  progressBarId: 'progress-bar',
  statusMessageId: 'status-message',
  settingsPanelId: 'settings-panel'
});

// The app handles file selection, parsing, and PDF generation automatically
```

### Advanced Configuration

```javascript
// Initialize with custom PDF options
const app = new CSVtoPDFApp({
  // UI element IDs
  dropZoneId: 'drop-zone',
  fileInputId: 'file-input',
  generateButtonId: 'generate-button',
  progressBarId: 'progress-bar',
  statusMessageId: 'status-message',
  settingsPanelId: 'settings-panel',
  
  // CSV parsing options
  csvOptions: {
    delimiter: ',',
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    chunkSize: 1000 // Process 1000 rows at a time
  },
  
  // PDF generation options
  pdfOptions: {
    pageSize: 'a4',
    orientation: 'landscape',
    margins: {
      top: 20,
      right: 15,
      bottom: 25,
      left: 15
    },
    includeHeader: true,
    includeFooter: true,
    includePageNumbers: true,
    title: 'CSV Data Export',
    author: 'jsPDF CSV Streaming',
    fontSize: 10
  }
});
```

## API Reference

### CSVParser

The `CSVParser` class handles CSV file parsing with memory-efficient streaming.

#### Methods

- `parseFile(file, callbacks)`: Parse a CSV file with streaming
  - `file`: The CSV file to parse
  - `callbacks`: Object containing callback functions:
    - `onChunk(rows, meta)`: Called for each chunk of data
    - `onComplete(results)`: Called when parsing is complete
    - `onError(error)`: Called if an error occurs

#### Example

```javascript
const parser = new CSVParser({
  delimiter: ',',
  header: true,
  dynamicTyping: true,
  skipEmptyLines: true,
  chunkSize: 1000
});

parser.parseFile(file, {
  onChunk: (rows, meta) => {
    console.log(`Processed ${rows.length} rows`);
  },
  onComplete: (results) => {
    console.log(`Parsing complete. Total rows: ${results.data.length}`);
  },
  onError: (error) => {
    console.error('Parsing error:', error);
  }
});
```

### PDFGenerator

The `PDFGenerator` class handles PDF generation with memory-efficient streaming.

#### Methods

- `generatePDF(headers, totalRows, dataProvider, callbacks)`: Generate a PDF from CSV data
  - `headers`: Array of column headers
  - `totalRows`: Total number of rows to process
  - `dataProvider`: Function that returns chunks of data
  - `callbacks`: Object containing callback functions:
    - `onProgress(processed, total, page)`: Called to report progress
    - `onComplete(pdf)`: Called when generation is complete
    - `onError(error)`: Called if an error occurs
    - `onPageAdded(page)`: Called when a new page is added

- `savePDF(filename)`: Save the generated PDF
  - `filename`: Name for the saved file

#### Example

```javascript
const generator = new PDFGenerator({
  pageSize: 'a4',
  orientation: 'landscape',
  margins: {
    top: 20,
    right: 15,
    bottom: 25,
    left: 15
  },
  includeHeader: true,
  includeFooter: true,
  includePageNumbers: true,
  title: 'CSV Data Export',
  author: 'jsPDF CSV Streaming'
});

// Create a data provider function
const dataProvider = async (chunkIndex) => {
  // Return null when no more data
  if (chunkIndex >= chunks.length) return null;
  return chunks[chunkIndex];
};

// Generate the PDF
generator.generatePDF(headers, totalRows, dataProvider, {
  onProgress: (processed, total, page) => {
    const percent = Math.round((processed / total) * 100);
    console.log(`Progress: ${percent}% (Page ${page})`);
  },
  onComplete: (pdf) => {
    console.log('PDF generation complete');
    generator.savePDF('export.pdf');
  },
  onError: (error) => {
    console.error('PDF generation error:', error);
  }
});
```

## Performance Considerations

### Memory Optimization

- **Chunk Size**: Adjust the chunk size based on your data complexity. Smaller chunks use less memory but may process slower.
- **Object Cleanup**: The library automatically cleans up processed chunks to free memory.
- **Browser Limits**: Different browsers have different memory limits. Test with your target browsers.

### Processing Speed

- **Asynchronous Processing**: The library uses asynchronous processing to prevent UI freezing.
- **Debounced Updates**: UI updates are debounced to reduce overhead.
- **Web Workers**: For extremely large datasets, consider implementing Web Workers for background processing.

## Browser Compatibility

This library is compatible with modern browsers that support:
- ES6+ JavaScript
- Promises and async/await
- File API
- Blob API

## Troubleshooting

### Common Issues

1. **Memory Errors**: If you encounter "Out of memory" errors:
   - Reduce the chunk size
   - Close other browser tabs/applications
   - Try a different browser with higher memory limits

2. **Slow Processing**: If processing is too slow:
   - Increase the chunk size
   - Reduce the complexity of your data
   - Use a more powerful device

3. **PDF Formatting Issues**: If the PDF formatting is incorrect:
   - Check your column data types
   - Adjust the page size and orientation
   - Modify the font size and margins

## Examples

See the `examples` directory for complete usage examples:

- `basic.html`: Basic usage example
- `advanced.html`: Advanced configuration example
- `custom-styling.html`: Custom PDF styling example
