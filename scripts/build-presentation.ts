#!/usr/bin/env tsx

import * as fs from 'fs-extra';
import * as path from 'path';
import { execSync } from 'child_process';

// Import asciidoctor with proper typing
const asciidoctor = require('@asciidoctor/core')();
const asciidoctorRevealjs = require('@asciidoctor/reveal.js');
const asciidoctorKroki = require('asciidoctor-kroki');

// Register extensions
asciidoctorRevealjs.register();
asciidoctorKroki.register(asciidoctor.Extensions);

const ROOT_DIR = path.join(__dirname, '..');

export interface PresentationConfig {
  date: string;
  title: string;
  venue: string;
  video: string;
  theme: string;
}

// Presentation configurations
export const PRESENTATIONS: Record<string, PresentationConfig> = {
  'build-meetup-2021-how-netflix-builds-code': {
    date: '2021-06-25',
    title: 'How Netflix Builds Code',
    venue: 'Build Meetup',
    video: 'https://www.youtube.com/watch?v=HnPz3CJEKaM',
    theme: 'netflix'
  },
  'cdCon-2021-scaling-jenkins': {
    date: '2021-06-24',
    title: 'How Netflix Autoscales CI',
    venue: 'cdCon',
    video: 'https://www.youtube.com/watch?v=LU8wYBWev_0',
    theme: 'netflix'
  }
};

async function downloadRevealJs(version: string = '3.9.1'): Promise<string> {
  const revealDir = path.join(ROOT_DIR, 'build', 'github-cache', 'hakimel', 'reveal.js', version);
  const revealJsDir = path.join(revealDir, `reveal.js-${version}`);
  
  if (!fs.existsSync(revealJsDir)) {
    console.log(`Downloading reveal.js ${version}...`);
    await fs.ensureDir(revealDir);
    
    const tempTarFile = path.join(revealDir, `reveal.js-${version}.tar.gz`);
    
    try {
      execSync(`curl -L -o "${tempTarFile}" "https://github.com/hakimel/reveal.js/archive/refs/tags/${version}.tar.gz"`, { stdio: 'inherit' });
      execSync(`tar -xzf "${tempTarFile}" -C "${revealDir}"`, { stdio: 'inherit' });
      fs.unlinkSync(tempTarFile);
    } catch (error) {
      const err = error as Error;
      console.error('Failed to download reveal.js:', err.message);
      process.exit(1);
    }
  }
  
  return revealJsDir;
}

async function copyStyles(presentationName: string, buildDir: string): Promise<void> {
  console.log('Copying styles...');
  
  const stylesheetBuildDir = path.join(ROOT_DIR, 'stylesheet', 'build');
  const presentationBuildDir = path.join(ROOT_DIR, presentationName, 'build');
  
  // Copy compiled SASS files
  const sassBuildDir = path.join(stylesheetBuildDir, 'sass');
  if (fs.existsSync(sassBuildDir)) {
    await fs.copy(sassBuildDir, path.join(presentationBuildDir, 'sass'));
  }
  
  // Copy style source files  
  const styleSourceDir = path.join(stylesheetBuildDir, 'docs', 'asciidocRevealJs', 'style');
  if (fs.existsSync(styleSourceDir)) {
    await fs.copy(styleSourceDir, path.join(buildDir, 'style'));
  }
  
  // Copy packaged resources
  const packageDir = path.join(stylesheetBuildDir, 'docs', 'asciidocRevealJs', 'package');
  if (fs.existsSync(packageDir)) {
    await fs.copy(packageDir, path.join(buildDir, 'package'));
  }
}

export async function buildPresentation(presentationName: string): Promise<void> {
  console.log(`Building presentation: ${presentationName}`);
  
  if (!PRESENTATIONS[presentationName]) {
    console.error(`Unknown presentation: ${presentationName}`);
    process.exit(1);
  }
  
  const config = PRESENTATIONS[presentationName];
  const presentationDir = path.join(ROOT_DIR, presentationName);
  const buildDir = path.join(presentationDir, 'build', 'docs', 'asciidocRevealJs');
  const sourceDir = path.join(presentationDir, 'src', 'docs', 'asciidoc');
  const indexFile = path.join(sourceDir, 'index.adoc');
  
  if (!fs.existsSync(indexFile)) {
    console.error(`Source file not found: ${indexFile}`);
    process.exit(1);
  }
  
  // Ensure build directory exists
  await fs.ensureDir(buildDir);
  
  // Download reveal.js template
  const revealJsDir = await downloadRevealJs('3.9.1');
  
  // Copy reveal.js files to build directory
  console.log('Copying reveal.js template...');
  await fs.copy(revealJsDir, path.join(buildDir, 'reveal.js'));
  
  
  // Fix reveal.js asset paths for compatibility
  console.log('Setting up reveal.js asset compatibility...');
  const revealDistDir = path.join(buildDir, 'reveal.js', 'dist');
  await fs.ensureDir(revealDistDir);
  
  // Copy CSS files to dist directory (expected by generated HTML)
  await fs.copy(path.join(buildDir, 'reveal.js', 'css', 'reset.css'), path.join(revealDistDir, 'reset.css'));
  await fs.copy(path.join(buildDir, 'reveal.js', 'css', 'reveal.css'), path.join(revealDistDir, 'reveal.css'));
  await fs.copy(path.join(buildDir, 'reveal.js', 'js', 'reveal.js'), path.join(revealDistDir, 'reveal.js'));
  
  // Copy highlight plugin assets
  const highlightPluginDir = path.join(buildDir, 'reveal.js', 'plugin', 'highlight');
  await fs.ensureDir(highlightPluginDir);
  await fs.copy(path.join(buildDir, 'reveal.js', 'lib', 'css', 'monokai.css'), path.join(highlightPluginDir, 'monokai.css'));
  
  // Copy images from source to build directory
  console.log('Copying images...');
  const sourceImagesDir = path.join(sourceDir, 'images');
  if (fs.existsSync(sourceImagesDir)) {
    await fs.copy(sourceImagesDir, path.join(buildDir, 'images'));
  }
  
  // Copy styles
  await copyStyles(presentationName, buildDir);
  
  // Create build/sass directory and copy theme CSS with fonts
  console.log('Setting up theme CSS and fonts...');
  const buildSassDir = path.join(buildDir, 'build', 'sass');
  await fs.ensureDir(buildSassDir);
  const presentationBuildSassDir = path.join(ROOT_DIR, presentationName, 'build', 'sass');
  if (fs.existsSync(path.join(presentationBuildSassDir, `${config.theme}.css`))) {
    await fs.copy(path.join(presentationBuildSassDir, `${config.theme}.css`), path.join(buildSassDir, `${config.theme}.css`));
  }
  
  // Copy Netflix fonts to build/sass/fonts
  const stylesheetDocsDir = path.join(ROOT_DIR, 'stylesheet', 'build', 'docs', 'asciidocRevealJs');
  if (fs.existsSync(path.join(stylesheetDocsDir, 'fonts'))) {
    await fs.copy(path.join(stylesheetDocsDir, 'fonts'), path.join(buildSassDir, 'fonts'));
  }
  
  // Copy Netflix logo to build/sass
  if (fs.existsSync(path.join(stylesheetDocsDir, 'style', 'Netflix_Symbol_RGB.png'))) {
    await fs.copy(path.join(stylesheetDocsDir, 'style', 'Netflix_Symbol_RGB.png'), path.join(buildSassDir, 'Netflix_Symbol_RGB.png'));
  }
  
  // Copy additional reveal.js plugins that might be needed
  const zoomPluginDir = path.join(buildDir, 'reveal.js', 'plugin', 'zoom');
  if (fs.existsSync(path.join(buildDir, 'reveal.js', 'plugin', 'zoom-js', 'zoom.js'))) {
    await fs.ensureDir(zoomPluginDir);
    await fs.copy(path.join(buildDir, 'reveal.js', 'plugin', 'zoom-js', 'zoom.js'), path.join(zoomPluginDir, 'zoom.js'));
  }
  
  // Build RevealJS options
  const revealOptions: Record<string, boolean | string> = {
    controls: false,
    overview: true,
    progress: true,
    history: true,
    center: false,
    customtheme: `build/sass/${config.theme}.css`
  };
  
  // Convert AsciiDoc to RevealJS
  console.log('Converting AsciiDoc to RevealJS...');
  
  const attributes: Record<string, string | boolean> = {
    'includedir': sourceDir,
    'revealjsdir': 'reveal.js',
    'revealjs-theme': config.theme,
    'source-highlighter': 'highlightjs',
    'icons': 'font'
  };
  
  // Add reveal.js options as attributes
  Object.entries(revealOptions).forEach(([key, value]) => {
    attributes[`revealjs_${key}`] = value;
  });
  
  try {
    const html = asciidoctor.convertFile(indexFile, {
      safe: 'unsafe',
      backend: 'revealjs',
      to_dir: buildDir,
      to_file: 'index.html',
      attributes: attributes,
      mkdirs: true
    });
    
    // Add print CSS functionality to HTML for PDF export (after AsciiDoc conversion)
    console.log('Adding print CSS support for PDF export...');
    const htmlFile = path.join(buildDir, 'index.html');
    if (fs.existsSync(htmlFile)) {
      let htmlContent = fs.readFileSync(htmlFile, 'utf8');
      
      // Add print CSS loading script if not already present
      if (!htmlContent.includes('print-pdf')) {
        const printCssScript = `
		<!-- Theme used for syntax highlighting of code -->
		<link rel="stylesheet" href="reveal.js/plugin/highlight/monokai.css">

		<!-- Print PDF styles -->
		<script>
			var link = document.createElement( 'link' );
			link.rel = 'stylesheet';
			link.type = 'text/css';
			link.href = window.location.search.match( /print-pdf/gi ) ? 'reveal.js/css/print/pdf.css' : 'reveal.js/css/print/paper.css';
			document.getElementsByTagName( 'head' )[0].appendChild( link );
		</script>

`;
        
        // Insert after the reveal.css link
        htmlContent = htmlContent.replace(
          /<link rel="stylesheet" href="reveal\.js\/dist\/reveal\.css">/,
          `<link rel="stylesheet" href="reveal.js/dist/reveal.css">${printCssScript}`
        );
        
        fs.writeFileSync(htmlFile, htmlContent);
        console.log('✓ Added print CSS support to HTML');
      }
    }
    
    console.log(`✓ Built ${presentationName}`);
    console.log(`Open ${buildDir}/index.html in your browser`);
    
  } catch (error) {
    console.error(`Failed to convert ${presentationName}:`, error);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const presentationName = process.argv[2];
  
  if (!presentationName) {
    console.error('Usage: tsx scripts/build-presentation.ts <presentation-name>');
    console.error('Available presentations:');
    Object.keys(PRESENTATIONS).forEach(name => console.error(`  - ${name}`));
    process.exit(1);
  }
  
  await buildPresentation(presentationName);
}

if (require.main === module) {
  main().catch(console.error);
}