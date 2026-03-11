
const fs = require('fs');
const content = fs.readFileSync('d:\\programming exercise\\social media\\desktop-client\\src\\pages\\ChatWindow.tsx', 'utf-8');
const lines = content.split('\n');

let mainReturnLine = 1325; // Explicitly start here
console.log(`Main return starts at line ${mainReturnLine}`);

let paren = 0;
let startChar = -1;

let charCount = 0;
for (let i = 0; i < lines.length; i++) {
    if (i + 1 === mainReturnLine) {
        startChar = charCount + lines[i].indexOf('(');
        break;
    }
    charCount += lines[i].length + 1;
}

console.log(`Paren count starts at char ${startChar}`);

for (let i = startChar; i < content.length; i++) {
    if (content[i] === '(') paren++;
    if (content[i] === ')') {
        paren--;
        if (paren === 0) {
            const lineNum = content.slice(0, i).split('\n').length;
            console.log(`Main return ends at line ${lineNum}`);
            console.log(`Context: ${content.slice(i-20, i+20).replace(/\n/g, ' ')}`);
            break;
        }
    }
}
if (paren > 0) console.log(`Finished with paren=${paren}`);
