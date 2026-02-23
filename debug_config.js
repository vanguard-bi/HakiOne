const path = require('path');
require('dotenv').config();

console.log('--- DEBUG START ---');
console.log('Current working directory:', process.cwd());
console.log('CONFIG_PATH env var:', process.env.CONFIG_PATH);

const defaultConfigPath = path.resolve(__dirname, 'librechat.yaml');
const configPath = process.env.CONFIG_PATH || defaultConfigPath;
console.log('Resolved config path:', configPath);
console.log('Is absolute:', path.isAbsolute(configPath));
console.log('Resolved absolute path:', path.resolve(process.cwd(), configPath));

try {
  const fs = require('fs');
  if (fs.existsSync(configPath)) {
    console.log('File exists at resolved path.');
    const content = fs.readFileSync(configPath, 'utf8');
    console.log('File content preview (first 100 chars):', content.substring(0, 100));
    
    // Check for haki-legal in the content
    if (content.includes('haki-legal')) {
        console.log('String "haki-legal" FOUND in config file.');
    } else {
        console.log('String "haki-legal" NOT FOUND in config file.');
    }

  } else {
    console.log('File does NOT exist at resolved path.');
  }
} catch (error) {
  console.error('Error reading file:', error);
}

console.log('--- DEBUG END ---');
