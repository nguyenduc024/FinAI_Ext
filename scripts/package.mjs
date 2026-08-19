import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Ensure fresh build
console.log('Building extension for production...');
execSync('npm run build', { stdio: 'inherit' });

const outputZip = 'finai-extension-v1.0.0.zip';

// Use PowerShell to compress dist folder on Windows
console.log(`Packaging dist/ into ${outputZip}...`);
if (fs.existsSync(outputZip)) {
  fs.unlinkSync(outputZip);
}

execSync(`powershell -command "Compress-Archive -Path dist/* -DestinationPath ${outputZip} -Force"`, { stdio: 'inherit' });
console.log(`Package ready for Chrome Web Store: ${outputZip}`);
