
const fs = require('fs');
const content = fs.readFileSync('d:\\programming exercise\\social media\\desktop-client\\src\\pages\\ChatWindow.tsx', 'utf-8');
const lines = content.split('\n');

lines.forEach((line, i) => {
    // Look for style={{ without a comma between properties
    // e.g. color: 'red' fontSize: 12
    if (line.includes('style={{')) {
        // This is tricky with multiline. 
        // I'll just look for missing commas in single-line style objects first.
        const matches = line.match(/style=\{\{(.*?)\}\}/);
        if (matches) {
            const props = matches[1];
            // Look for 'prop: value prop: value' without comma
            const regex = /:\s*['"]?.*['"]?\s+[a-zA-Z]+:/;
            if (regex.test(props)) {
                console.log(`Potential missing comma at line ${i + 1}: ${line.trim()}`);
            }
        }
    }
});
