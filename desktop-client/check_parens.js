const fs = require('fs');
const content = fs.readFileSync('d:\\programming exercise\\social media\\desktop-client\\src\\pages\\CallWindowPage.tsx', 'utf8');
let parenDepth = 0;
for (let i = 0; i < content.length; i++) {
  if (content[i] === '(') parenDepth++;
  if (content[i] === ')') parenDepth--;
  if (parenDepth < 0) console.log(`Extra closing paren at position ${i}`);
}
console.log(`Final paren depth: ${parenDepth}`);
