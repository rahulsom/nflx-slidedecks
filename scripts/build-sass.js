#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const sass = require('sass');
const { execSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');

function getRevealJsThemePath() {
  // Use the reveal.js npm package installed in node_modules
  const revealJsPath = path.join(ROOT_DIR, 'node_modules', 'reveal.js');
  const themePath = path.join(revealJsPath, 'css', 'theme');
  
  if (!fs.existsSync(themePath)) {
    console.error('reveal.js theme directory not found. Make sure reveal.js is installed via npm.');
    process.exit(1);
  }
  
  console.log('Using reveal.js from npm package...');
  return themePath;
}

async function buildStyles() {
  console.log('Building styles...');
  
  const stylesheetBuildDir = path.join(ROOT_DIR, 'stylesheet', 'build');
  const scssDir = path.join(stylesheetBuildDir, 'scss');
  const scssSourceDir = path.join(scssDir, 'source');
  const sassDir = path.join(stylesheetBuildDir, 'sass');
  const docsDir = path.join(stylesheetBuildDir, 'docs', 'asciidocRevealJs');
  
  // Clean and create directories
  await fs.ensureDir(scssSourceDir);
  await fs.ensureDir(sassDir);
  await fs.ensureDir(docsDir);
  
  // Get reveal.js theme path from npm package
  const revealThemeDir = getRevealJsThemePath();
  
  // Copy reveal.js theme files
  console.log('Copying reveal.js theme files...');
  await fs.copy(revealThemeDir, scssDir);
  
  // Copy source sass files
  const srcSassDir = path.join(ROOT_DIR, 'stylesheet', 'src', 'main', 'sass');
  if (fs.existsSync(srcSassDir)) {
    await fs.copy(srcSassDir, scssSourceDir);
    await fs.copy(srcSassDir, path.join(docsDir, 'style'));
  }
  
  // Extract and copy Netflix font
  const fontTgzPath = path.join(ROOT_DIR, 'stylesheet', 'nflx', 'font.tgz');
  if (fs.existsSync(fontTgzPath)) {
    console.log('Extracting Netflix font...');
    const tempDir = path.join(stylesheetBuildDir, 'temp-font');
    await fs.ensureDir(tempDir);
    
    try {
      execSync(`tar -xzf "${fontTgzPath}" -C "${tempDir}"`, { stdio: 'inherit' });
      
      // Copy font CSS files and rename to SCSS
      const fontFiles = await fs.readdir(path.join(tempDir, 'package'));
      for (const file of fontFiles) {
        if (file.endsWith('.css')) {
          const srcPath = path.join(tempDir, 'package', file);
          const destPath = path.join(scssDir, file.replace('.css', '.scss'));
          await fs.copy(srcPath, destPath);
        }
      }
      
      // Copy fonts directory
      const fontsDir = path.join(tempDir, 'package');
      await fs.copy(fontsDir, docsDir);
      
      // Clean up temp directory
      await fs.remove(tempDir);
    } catch (error) {
      console.error('Failed to extract font:', error.message);
    }
  }
  
  // Compile SASS files
  console.log('Compiling SASS files...');
  const sassFiles = await fs.readdir(scssSourceDir).catch(() => []);
  
  for (const file of sassFiles) {
    if (file.endsWith('.scss') || file.endsWith('.sass')) {
      const inputPath = path.join(scssSourceDir, file);
      const outputPath = path.join(sassDir, file.replace(/\.(scss|sass)$/, '.css'));
      
      try {
        const result = sass.compile(inputPath, {
          includePaths: [scssDir, scssSourceDir]
        });
        
        await fs.writeFile(outputPath, result.css);
        console.log(`Compiled ${file} -> ${path.basename(outputPath)}`);
      } catch (error) {
        console.error(`Failed to compile ${file}:`, error.message);
      }
    }
  }
  
  console.log('SASS compilation completed!');
}

if (require.main === module) {
  buildStyles().catch(console.error);
}

module.exports = { buildStyles };