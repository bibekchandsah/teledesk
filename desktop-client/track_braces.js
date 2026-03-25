const fs = require('fs');
const content = fs.readFileSync('d:\\programming exercise\\social media\\desktop-client\\src\\pages\\CallWindowPage.tsx', 'utf8');
const stack = [];
let inString = null;
let inComment = false;
const lines = content.split('\n');

lines.forEach((line, i) => {
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    const next = line[j+1];
    if (inComment) {
      if (inComment === '/*' && char === '*' && next === '/') { inComment = false; j++; }
      continue;
    }
    if (inString) {
      if (char === inString && line[j-1] !== '\\') inString = null;
      continue;
    }
    if (char === '/' && next === '/') break;
    if (char === '/' && next === '*') { inComment = '/*'; j++; continue; }
    if (char === '"' || char === "'" || char === '`') { inString = char; continue; }
    if (char === '{') stack.push(i + 1);
    if (char === '}') stack.pop();
  }
});

console.log('Unclosed braces at lines:', stack);
