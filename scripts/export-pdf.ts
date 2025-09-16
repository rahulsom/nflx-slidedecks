#!/usr/bin/env tsx

import * as fs from 'fs-extra';
import * as path from 'path';
import puppeteer, { Browser, LaunchOptions } from 'puppeteer';
import { createServer, Server } from 'http';
import { readFileSync, existsSync } from 'fs';
import { extname } from 'path';
import { PRESENTATIONS } from './build-presentation';

const ROOT_DIR = path.join(__dirname, '..');

interface FileServer {
  server: Server;
  port: number;
  url: string;
}

// Simple HTTP server for serving files during PDF export
function createFileServer(rootPath: string, port: number = 0): Promise<FileServer> {
  const mimeTypes: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject'
  };

  const server = createServer((req, res) => {
    // Parse URL and remove query parameters for file lookup
    const urlPath = req.url?.split('?')[0] || '/';
    let filePath = path.join(rootPath, urlPath === '/' ? 'index.html' : urlPath);
    
    if (!existsSync(filePath)) {
      res.writeHead(404);
      res.end('File not found');
      return;
    }

    const ext = extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    try {
      const content = readFileSync(filePath);
      res.writeHead(200, { 
        'Content-Type': contentType,
        'Cache-Control': 'no-cache'
      });
      res.end(content);
    } catch (error) {
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      resolve({ server, port: actualPort, url: `http://localhost:${actualPort}` });
    });
  });
}

async function exportPDF(presentationName: string): Promise<void> {
  console.log(`Exporting PDF for presentation: ${presentationName}`);
  
  if (!PRESENTATIONS[presentationName]) {
    console.error(`Unknown presentation: ${presentationName}`);
    process.exit(1);
  }
  
  const presentationDir = path.join(ROOT_DIR, presentationName);
  const buildDir = path.join(presentationDir, 'build', 'docs', 'asciidocRevealJs');
  const exportDir = path.join(presentationDir, 'build', 'docs', 'asciidocRevealJsExport');
  const htmlFile = path.join(buildDir, 'index.html');
  const pdfFile = path.join(exportDir, 'index.pdf');
  
  // Check if HTML file exists
  if (!fs.existsSync(htmlFile)) {
    console.error(`HTML file not found: ${htmlFile}`);
    console.error('Please build the presentation first with: npm run build:presentation');
    process.exit(1);
  }
  
  // Ensure export directory exists
  await fs.ensureDir(exportDir);
  
  console.log('Starting HTTP server for assets...');
  
  // Start HTTP server to serve files
  const { server, port, url } = await createFileServer(buildDir);
  console.log(`HTTP server started on: ${url}`);
  
  console.log('Starting Puppeteer...');
  
  let browser: Browser | undefined;
  try {
    // Try different launch configurations based on environment
    let launchOptions: LaunchOptions = {
      headless: true, // Try old headless mode
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    };

    // Check if we're on macOS and try alternative config
    if (process.platform === 'darwin') {
      launchOptions = {
        headless: true,
        args: ['--no-sandbox'],
        ignoreDefaultArgs: ['--disable-extensions']
      };
    }

    browser = await puppeteer.launch(launchOptions);
    
    const page = await browser.newPage();
    
    // Set viewport for consistent rendering
    await page.setViewport({
      width: 1600,
      height: 1050,
      deviceScaleFactor: 1
    });
    
    console.log(`Loading presentation from: ${url}/index.html?print-pdf`);
    
    // Load the HTML file via HTTP server with print-pdf parameter
    await page.goto(`${url}/index.html?print-pdf`, {
      waitUntil: ['load', 'domcontentloaded'],
      timeout: 30000
    });
    
    // Wait for RevealJS and slides to load
    console.log('Waiting for presentation to load...');
    await page.waitForFunction('typeof Reveal !== "undefined"', { timeout: 15000 });
    await page.waitForFunction(() => {
      return document.querySelectorAll('.reveal .slides section').length > 0;
    }, { timeout: 10000 });
    
    // Wait for images and fonts to load
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('Generating PDF...');
    
    // Get slide count for verification
    const slideCount = await page.evaluate(() => {
      return document.querySelectorAll('.reveal .slides section').length;
    });
    console.log(`Found ${slideCount} slides to export`);
    
    // Generate PDF with settings optimized for slide presentation
    await page.pdf({
      path: pdfFile,
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: {
        top: '0px',
        right: '0px',
        bottom: '0px',
        left: '0px'
      },
      preferCSSPageSize: true
    });
    
    console.log(`✓ PDF exported to: ${pdfFile}`);
    
  } catch (error) {
    console.error('Failed to export PDF:', error);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
    // Close HTTP server
    server.close();
  }
}

async function main(): Promise<void> {
  const presentationName = process.argv[2];
  
  if (!presentationName) {
    console.error('Usage: tsx scripts/export-pdf.ts <presentation-name>');
    console.error('Available presentations:');
    Object.keys(PRESENTATIONS).forEach(name => console.error(`  - ${name}`));
    process.exit(1);
  }
  
  await exportPDF(presentationName);
}

if (require.main === module) {
  main().catch(console.error);
}

export { exportPDF };