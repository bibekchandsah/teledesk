const fs = require('fs');
const content = fs.readFileSync('d:\\programming exercise\\social media\\desktop-client\\src\\pages\\CallWindowPage.tsx', 'utf8');
let depth = 0;
let inString = null;
let inComment = false;
let inRegex = false;

for (let i = 0; i < content.length; i++) {
  const char = content[i];
  const next = content[i+1];
  
  if (inComment) {
    if (inComment === '//' && char === '\n') inComment = false;
    else if (inComment === '/*' && char === '*' && next === '/') { inComment = false; i++; }
    continue;
  }
  
  if (inString) {
    if (char === inString && content[i-1] !== '\\') inString = null;
    continue;
  }
  
  if (char === '/' && next === '/') { inComment = '//'; i++; continue; }
  if (char === '/' && next === '*') { inComment = '/*'; i++; continue; }
  
  if (char === '"' || char === "'" || char === '`') { inString = char; continue; }
  
  if (char === '{') depth++;
  if (char === '}') {
    depth--;
    if (depth < 0) {
      console.log(`Extra closing brace found at position ${i}`);
    }
  }
}
console.log(`Final depth: ${depth}`);
