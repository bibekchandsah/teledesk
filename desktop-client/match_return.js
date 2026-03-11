
const fs = require('fs');
const content = fs.readFileSync('d:\\programming exercise\\social media\\desktop-client\\src\\pages\\ChatWindow.tsx', 'utf-8');

const returnStart = content.indexOf('return (', 1325 * 5); // Start after the loading/select chat returns
console.log(`Return start at char ${returnStart}`);

let paren = 0;
for (let i = returnStart + 7; i < content.length; i++) {
    if (content[i] === '(') paren++;
    if (content[i] === ')') {
        if (paren === 0) {
            console.log(`Return ends at char ${i}`);
            const lineNum = content.slice(0, i).split('\n').length;
            console.log(`Line ${lineNum}: ${content.slice(i-20, i+20).replace(/\n/g, ' ')}`);
            break;
        }
        paren--;
    }
}
