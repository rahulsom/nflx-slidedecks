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

interface SlideInfo {
  h: number;
  v: number;
  notesHtml: string;
}

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

interface PageFormat {
  name: string;
  widthMm: number;
  heightMm: number;
}

const PAGE_FORMATS: Record<string, PageFormat> = {
  A4:     { name: 'A4',     widthMm: 210,   heightMm: 297 },
  Letter: { name: 'Letter', widthMm: 215.9, heightMm: 279.4 },
};

function buildPortraitPdfHtml(screenshots: string[], slides: SlideInfo[], format: PageFormat): string {
  const pages = screenshots.map((screenshot, i) => {
    const notes = slides[i]?.notesHtml || '';
    return `
    <div class="page">
      <div class="slide-image">
        <img src="data:image/jpeg;base64,${screenshot}" alt="Slide ${i + 1}">
      </div>
      <div class="notes-section">
        <div class="notes-header">Notes</div>
        <div class="notes-content">${notes}</div>
      </div>
    </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @page { size: ${format.widthMm}mm ${format.heightMm}mm portrait; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0; font-family: Helvetica, Arial, sans-serif; }
  .page {
    width: ${format.widthMm}mm;
    height: ${format.heightMm}mm;
    display: flex;
    flex-direction: column;
    page-break-after: always;
  }
  .slide-image {
    height: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fff;
    overflow: hidden;
  }
  .slide-image img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  .notes-section {
    height: 50%;
    padding: 8mm 10mm;
    overflow: hidden;
    background: #fff;
    border-top: 2px solid #e60010;
  }
  .notes-header {
    font-size: 9pt;
    font-weight: bold;
    color: #e60010;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 4mm;
  }
  .notes-content {
    font-size: 10pt;
    line-height: 1.5;
    color: #333;
  }
  .notes-content p { margin: 0 0 0.4em; }
  .notes-content .paragraph { margin: 0 0 0.4em; }
  .notes-content .paragraph p { margin: 0; }
  .notes-content ul, .notes-content ol { margin: 0 0 0.4em; padding-left: 1.2em; }
  .notes-content li { margin-bottom: 0.2em; }
</style>
</head>
<body>
${pages}
</body>
</html>`;
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

  if (!fs.existsSync(htmlFile)) {
    console.error(`HTML file not found: ${htmlFile}`);
    console.error('Please build the presentation first with: npm run build:presentation');
    process.exit(1);
  }

  await fs.ensureDir(exportDir);

  console.log('Starting HTTP server for assets...');
  const { server, url } = await createFileServer(buildDir);
  console.log(`HTTP server started on: ${url}`);

  let browser: Browser | undefined;
  try {
    let launchOptions: LaunchOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--force-color-profile=srgb'
      ]
    };

    if (process.platform === 'darwin') {
      launchOptions = {
        headless: true,
        args: ['--no-sandbox', '--force-color-profile=srgb'],
        ignoreDefaultArgs: ['--disable-extensions']
      };
    }

    browser = await puppeteer.launch(launchOptions);

    // --- Phase 1: Screenshot each slide ---
    const slidePage = await browser.newPage();
    await slidePage.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });

    console.log(`Loading presentation from: ${url}/index.html`);
    await slidePage.goto(`${url}/index.html`, {
      waitUntil: ['load', 'domcontentloaded'],
      timeout: 30000
    });

    await slidePage.waitForFunction('typeof Reveal !== "undefined"', { timeout: 15000 });
    await slidePage.waitForFunction(() => {
      return document.querySelectorAll('.reveal .slides section').length > 0;
    }, { timeout: 10000 });

    // Disable slide transitions and hide RevealJS UI chrome for clean screenshots
    await slidePage.addStyleTag({
      content: [
        '.reveal .slides section { transition: none !important; animation: none !important; }',
        '.reveal .controls { display: none !important; }',
        '.reveal .progress { display: none !important; }',
        '.reveal .slide-number { display: none !important; }',
        '.reveal .speaker-notes { display: none !important; }',
      ].join('\n')
    });

    console.log('Waiting for fonts and images to load...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Collect slide coordinates and speaker notes from the DOM
    const slideInfos: SlideInfo[] = await slidePage.evaluate(() => {
      const result: Array<{ h: number; v: number; notesHtml: string }> = [];
      document.querySelectorAll('.reveal .slides > section').forEach((hSlide, h) => {
        const vSlides = hSlide.querySelectorAll(':scope > section');
        if (vSlides.length === 0) {
          const notes = hSlide.querySelector('aside.notes');
          result.push({ h, v: 0, notesHtml: notes ? notes.innerHTML : '' });
        } else {
          vSlides.forEach((vSlide, v) => {
            const notes = vSlide.querySelector('aside.notes');
            result.push({ h, v, notesHtml: notes ? notes.innerHTML : '' });
          });
        }
      });
      return result;
    });

    console.log(`Found ${slideInfos.length} slides to export`);

    const screenshots: string[] = [];
    for (let i = 0; i < slideInfos.length; i++) {
      const { h, v } = slideInfos[i];
      await slidePage.evaluate(({ h, v }: { h: number; v: number }) => {
        (window as any).Reveal.slide(h, v);
      }, { h, v });

      await new Promise(resolve => setTimeout(resolve, 300));

      const screenshot = await slidePage.screenshot({ encoding: 'base64', type: 'jpeg', quality: 85 });
      screenshots.push(screenshot as string);

      if ((i + 1) % 10 === 0 || i + 1 === slideInfos.length) {
        console.log(`Screenshotted ${i + 1}/${slideInfos.length} slides`);
      }
    }

    await slidePage.close();

    // --- Phase 2: Compose portrait PDFs (one per page format) from the same screenshots ---
    for (const format of Object.values(PAGE_FORMATS)) {
      const outFile = path.join(exportDir, `index-${format.name}.pdf`);
      console.log(`Generating ${format.name} PDF...`);
      const pdfHtml = buildPortraitPdfHtml(screenshots, slideInfos, format);

      const pdfPage = await browser.newPage();
      await pdfPage.setContent(pdfHtml, { waitUntil: 'load' });

      await pdfPage.pdf({
        path: outFile,
        landscape: false,
        printBackground: true,
        margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
        preferCSSPageSize: true
      });

      await pdfPage.close();
      console.log(`✓ PDF exported to: ${outFile}`);
    }

  } catch (error) {
    console.error('Failed to export PDF:', error);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
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
