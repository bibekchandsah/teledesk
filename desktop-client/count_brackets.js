
const fs = require('fs');
const content = fs.readFileSync('d:\\programming exercise\\social media\\desktop-client\\src\\pages\\ChatWindow.tsx', 'utf-8');

let paren = 0;
let brace = 0;
let bracket = 0;

for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '(') paren++;
    if (char === ')') paren--;
    if (char === '{') brace++;
    if (char === '}') brace--;
    if (char === '[') bracket++;
    if (char === ']') bracket--;
    
    if (paren < 0 || brace < 0 || bracket < 0) {
        console.log(`Mismatch found at char ${i} (line ???): paren=${paren}, brace=${brace}, bracket=${bracket}`);
        // find line number
        const lineNum = content.slice(0, i).split('\n').length;
        console.log(`Line ${lineNum}: ${content.slice(i-20, i+20).replace(/\n/g, ' ')}`);
        break;
    }
}

console.log(`Final totals: paren=${paren}, brace=${brace}, bracket=${bracket}`);
if (paren === 0 && brace === 0 && bracket === 0) console.log("Balanced!");
else console.log("UNBALANCED!");
