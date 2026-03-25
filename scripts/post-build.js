const { copyFileSync, mkdirSync } = require('fs');
const { join } = require('path');

// Copy SVG icons to dist
const iconSrc = join(__dirname, '..', 'nodes', 'LmChatEdenAi');
const iconDest = join(__dirname, '..', 'dist', 'nodes', 'LmChatEdenAi');

mkdirSync(iconDest, { recursive: true });
copyFileSync(join(iconSrc, 'edenai.svg'), join(iconDest, 'edenai.svg'));
copyFileSync(join(iconSrc, 'dark.edenai.svg'), join(iconDest, 'dark.edenai.svg'));

console.log('Icons copied to dist.');
