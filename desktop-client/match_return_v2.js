
const fs = require('fs');
const content = fs.readFileSync('d:\\programming exercise\\social media\\desktop-client\\src\\pages\\ChatWindow.tsx', 'utf-8');
const lines = content.split('\n');

let mainReturnLine = -1;
for (let i = 1300; i < lines.length; i++) {
    if (lines[i].includes('return (') && !lines[i].includes('//')) {
        mainReturnLine = i + 1;
        break;
    }
}

if (mainReturnLine === -1) {
    console.log("Main return not found starting from line 1300");
    process.exit(1);
}

console.log(`Main return starts at line ${mainReturnLine}`);

let paren = 0;
let foundStart = false;
let startChar = -1;

// Find the start character
let charCount = 0;
for (let i = 0; i < lines.length; i++) {
    if (i + 1 === mainReturnLine) {
        startChar = charCount + lines[i].indexOf('(');
        break;
    }
    charCount += lines[i].length + 1; // +1 for newline
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
