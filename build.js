const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

// Configuration
const config = {
  sourceDir: path.join(__dirname, 'js'),
  distDir: path.join(__dirname, 'dist'),
  outputFile: 'jspdf-csv-export.min.js',
  bundleFile: 'jspdf-csv-export.js',
  files: [
    'utils.js',
    'csv-parser.js',
    'pdf-generator.js',
    'app.js'
  ],
  banner: `/**
 * jsPDF CSV Streaming Implementation
 * A memory-efficient solution for exporting large CSV datasets to PDF
 * Version: 1.0.0
 * License: MIT
 * Date: ${new Date().toISOString().split('T')[0]}
 */
`
};

// Ensure dist directory exists
if (!fs.existsSync(config.distDir)) {
  fs.mkdirSync(config.distDir, { recursive: true });
}

// Read and concatenate all source files
async function bundleFiles() {
  console.log('Bundling files...');
  
  let bundle = config.banner;
  
  // Wrap in IIFE to avoid global scope pollution
  bundle += '(function(global) {\n';
  
  // Add each file
  for (const file of config.files) {
    const filePath = path.join(config.sourceDir, file);
    console.log(`Adding ${file}...`);
    
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      bundle += `\n// Source: ${file}\n`;
      bundle += content + '\n';
    } else {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }
  }
  
  // Close IIFE
  bundle += '\n})(typeof window !== "undefined" ? window : this);';
  
  // Write bundle file
  const bundlePath = path.join(config.distDir, config.bundleFile);
  fs.writeFileSync(bundlePath, bundle);
  console.log(`Bundle created: ${bundlePath}`);
  
  return bundle;
}

// Minify the bundled code
async function minifyBundle(bundle) {
  console.log('Minifying bundle...');
  
  try {
    const result = await minify(bundle, {
      compress: {
        drop_console: true,
        drop_debugger: true
      },
      mangle: true,
      output: {
        preamble: config.banner,
        beautify: false
      }
    });
    
    if (result.code) {
      const minPath = path.join(config.distDir, config.outputFile);
      fs.writeFileSync(minPath, result.code);
      console.log(`Minified file created: ${minPath}`);
      
      // Log size reduction
      const originalSize = Buffer.byteLength(bundle, 'utf8');
      const minifiedSize = Buffer.byteLength(result.code, 'utf8');
      const reduction = ((1 - minifiedSize / originalSize) * 100).toFixed(2);
      
      console.log(`Original size: ${(originalSize / 1024).toFixed(2)} KB`);
      console.log(`Minified size: ${(minifiedSize / 1024).toFixed(2)} KB`);
      console.log(`Size reduction: ${reduction}%`);
    } else {
      console.error('Error: Minification produced no output');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error during minification:', error);
    process.exit(1);
  }
}

// Create package files
async function createPackage() {
  console.log('Creating package files...');
  
  // Copy README.md to dist
  fs.copyFileSync(
    path.join(__dirname, 'README.md'),
    path.join(config.distDir, 'README.md')
  );
  
  // Copy examples to dist
  const examplesDir = path.join(__dirname, 'examples');
  const distExamplesDir = path.join(config.distDir, 'examples');
  
  if (!fs.existsSync(distExamplesDir)) {
    fs.mkdirSync(distExamplesDir, { recursive: true });
  }
  
  fs.readdirSync(examplesDir).forEach(file => {
    fs.copyFileSync(
      path.join(examplesDir, file),
      path.join(distExamplesDir, file)
    );
  });
  
  // Create a simplified package.json for the dist folder
  const pkg = require('./package.json');
  const distPkg = {
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
    main: config.outputFile,
    keywords: pkg.keywords,
    author: pkg.author,
    license: pkg.license,
    dependencies: {
      jspdf: pkg.dependencies.jspdf,
      papaparse: pkg.dependencies.papaparse
    }
  };
  
  fs.writeFileSync(
    path.join(config.distDir, 'package.json'),
    JSON.stringify(distPkg, null, 2)
  );
  
  console.log('Package files created successfully');
}

// Create a zip archive of the dist folder
async function createZipArchive() {
  console.log('Creating ZIP archive...');
  
  const { execSync } = require('child_process');
  const zipPath = path.join(__dirname, `${pkg.name}-${pkg.version}.zip`);
  
  try {
    execSync(`cd ${config.distDir} && zip -r ${zipPath} ./*`);
    console.log(`ZIP archive created: ${zipPath}`);
  } catch (error) {
    console.error('Error creating ZIP archive:', error);
  }
}

// Main build process
async function build() {
  console.log('Starting build process...');
  
  try {
    const bundle = await bundleFiles();
    await minifyBundle(bundle);
    await createPackage();
    
    console.log('Build completed successfully!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

// Run the build
build();
