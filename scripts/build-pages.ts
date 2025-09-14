#!/usr/bin/env tsx

import * as fs from 'fs-extra';
import * as path from 'path';
import { PRESENTATIONS } from './build-presentation';

// Import asciidoctor with proper typing
const asciidoctor = require('@asciidoctor/core')();

const ROOT_DIR = path.join(__dirname, '..');

interface PresentationMetadata {
  name: string;
  date: string;
  title: string;
  venue: string;
  video: string;
}

async function copyPresentationToPages(presentationName: string): Promise<void> {
  console.log(`Copying ${presentationName} to pages...`);
  
  const presentationConfig = PRESENTATIONS[presentationName];
  if (!presentationConfig) {
    console.error(`Unknown presentation: ${presentationName}`);
    return;
  }
  
  const presentationDir = path.join(ROOT_DIR, presentationName);
  const htmlBuildDir = path.join(presentationDir, 'build', 'docs', 'asciidocRevealJs');
  const pdfBuildDir = path.join(presentationDir, 'build', 'docs', 'asciidocRevealJsExport');
  
  const pagesDir = path.join(ROOT_DIR, 'pages', 'build', 'staging', presentationName);
  const htmlTargetDir = path.join(pagesDir, 'html');
  const pdfTargetDir = path.join(pagesDir, 'pdf');
  
  // Ensure target directories exist
  await fs.ensureDir(htmlTargetDir);
  await fs.ensureDir(pdfTargetDir);
  
  // Copy HTML files
  if (fs.existsSync(htmlBuildDir)) {
    await fs.copy(htmlBuildDir, htmlTargetDir);
    console.log(`  ✓ Copied HTML files to ${htmlTargetDir}`);
  } else {
    console.warn(`  ⚠ HTML build directory not found: ${htmlBuildDir}`);
  }
  
  // Copy PDF files
  if (fs.existsSync(pdfBuildDir)) {
    await fs.copy(pdfBuildDir, pdfTargetDir);
    console.log(`  ✓ Copied PDF files to ${pdfTargetDir}`);
  } else {
    console.warn(`  ⚠ PDF build directory not found: ${pdfBuildDir}`);
  }
  
  // Write metadata JSON
  const metadataPath = path.join(pagesDir, 'metadata.json');
  const metadata = {
    date: presentationConfig.date,
    title: presentationConfig.title,
    venue: presentationConfig.venue,
    video: presentationConfig.video
  };
  
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  console.log(`  ✓ Created metadata at ${metadataPath}`);
}

export async function buildIndex(): Promise<void> {
  console.log('Building pages index...');
  
  const stagingDir = path.join(ROOT_DIR, 'pages', 'build', 'staging');
  const docsDir = path.join(ROOT_DIR, 'pages', 'build', 'docs');
  
  await fs.ensureDir(docsDir);
  
  // Collect all presentation metadata
  const presentations: PresentationMetadata[] = [];
  
  if (fs.existsSync(stagingDir)) {
    const presentationDirs = await fs.readdir(stagingDir, { withFileTypes: true });
    
    for (const dirent of presentationDirs) {
      if (dirent.isDirectory()) {
        const metadataPath = path.join(stagingDir, dirent.name, 'metadata.json');
        if (fs.existsSync(metadataPath)) {
          const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
          presentations.push({
            name: dirent.name,
            ...metadata
          });
        }
      }
    }
  }
  
  // Sort presentations by date (newest first)
  presentations.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  // Group by year
  const presentationsByYear: Record<number, PresentationMetadata[]> = {};
  presentations.forEach(p => {
    const year = new Date(p.date).getFullYear();
    if (!presentationsByYear[year]) {
      presentationsByYear[year] = [];
    }
    presentationsByYear[year].push(p);
  });
  
  // Generate AsciiDoc index
  let indexContent = `# nflx-slidedecks
:author: Rahul Somasunderam
:experimental:

On HTML Slidedecks, hit kbd:[s] to open speaker notes in a new window.
Hit kbd:[?] to see all shortcuts.

`;
  
  // Sort years in descending order
  const years = Object.keys(presentationsByYear)
    .map(year => parseInt(year))
    .sort((a, b) => b - a);
  
  for (const year of years) {
    indexContent += `## ${year}\n\n`;
    indexContent += '[cols="2a,3a,7a"]\n';
    indexContent += '|===\n';
    
    for (const presentation of presentationsByYear[year]) {
      const videoLink = presentation.video.startsWith('http') ? 
        `${presentation.video}[Video]` : 
        `link:${presentation.video}[Video]`;
        
      indexContent += `| ${presentation.date} | ${presentation.venue} | ${presentation.title} - link:${presentation.name}/html/index.html[HTML] - link:${presentation.name}/pdf/index.pdf[PDF] - ${videoLink}\n`;
    }
    
    indexContent += '|===\n\n';
  }
  
  // Write index.adoc
  const indexPath = path.join(docsDir, 'index.adoc');
  await fs.writeFile(indexPath, indexContent);
  console.log(`  ✓ Created index.adoc at ${indexPath}`);
  
  // Convert to HTML
  try {
    asciidoctor.convertFile(indexPath, {
      safe: 'unsafe',
      to_dir: docsDir,
      to_file: 'index.html',
      mkdirs: true
    });
    console.log(`  ✓ Converted to HTML at ${docsDir}/index.html`);
  } catch (error) {
    console.error('Failed to convert index.adoc to HTML:', error);
  }
  
  // Copy HTML to staging for deployment
  const stagingIndexPath = path.join(stagingDir, 'index.html');
  if (fs.existsSync(path.join(docsDir, 'index.html'))) {
    await fs.copy(path.join(docsDir, 'index.html'), stagingIndexPath);
    console.log(`  ✓ Copied to staging at ${stagingIndexPath}`);
  }
}

export async function buildPages(): Promise<void> {
  console.log('Building pages...');
  
  // Copy all presentations to pages
  for (const presentationName of Object.keys(PRESENTATIONS)) {
    await copyPresentationToPages(presentationName);
  }
  
  // Build index
  await buildIndex();
  
  console.log('✓ Pages build completed!');
  console.log(`Open ${ROOT_DIR}/pages/build/staging/index.html in your browser`);
}

export { copyPresentationToPages };

async function main(): Promise<void> {
  await buildPages();
}

if (require.main === module) {
  main().catch(console.error);
}