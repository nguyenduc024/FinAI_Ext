import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const isWatch = process.argv.includes('--watch');

// Clean dist folder
if (fs.existsSync('dist')) {
  fs.rmSync('dist', { recursive: true, force: true });
}
fs.mkdirSync('dist', { recursive: true });

// Generate icons if needed
console.log('Ensuring icons are generated...');
execSync('node scripts/generate-icons.mjs', { stdio: 'inherit' });

// Copy public contents to dist
function copyPublic() {
  if (!fs.existsSync('public')) return;
  const files = fs.readdirSync('public');
  for (const file of files) {
    fs.cpSync(path.join('public', file), path.join('dist', file), { recursive: true });
  }
}

copyPublic();

// Run Vite build for popup
console.log('Building popup with Vite...');
execSync('npx vite build', { stdio: 'inherit' });

const buildOptions = {
  bundle: true,
  target: 'chrome120',
  platform: 'browser',
  minify: !isWatch,
  sourcemap: isWatch ? 'inline' : false,
};

async function build() {
  console.log('Building content script and service worker...');
  
  const contentCtx = await esbuild.context({
    ...buildOptions,
    entryPoints: ['src/content/content.ts'],
    outfile: 'dist/content.js',
    format: 'iife',
    loader: { '.css': 'text' },
  });

  const swCtx = await esbuild.context({
    ...buildOptions,
    entryPoints: ['src/background/service-worker.ts'],
    outfile: 'dist/service-worker.js',
    format: 'esm',
  });

  if (isWatch) {
    await contentCtx.watch();
    await swCtx.watch();
    console.log('Watching for changes...');
  } else {
    await contentCtx.rebuild();
    await swCtx.rebuild();
    await contentCtx.dispose();
    await swCtx.dispose();
    console.log('Build complete.');
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
