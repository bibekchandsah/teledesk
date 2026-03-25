const fs = require('fs');
const content = fs.readFileSync('d:\\programming exercise\\social media\\desktop-client\\src\\pages\\CallWindowPage.tsx', 'utf8');
let depth = 0;
const lines = content.split('\n');
lines.forEach((line, i) => {
  const oldDepth = depth;
  for (let j = 0; j < line.length; j++) {
    if (line[j] === '{') depth++;
    if (line[j] === '}') depth--;
  }
  if (depth !== oldDepth) {
    if (i + 1 >= 1670) console.log(`${i + 1}: depth=${depth} [${line.trim()}]`);
  }
});
