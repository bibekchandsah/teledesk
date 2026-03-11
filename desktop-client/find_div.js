
const fs = require('fs');
const content = fs.readFileSync('d:\\programming exercise\\social media\\desktop-client\\src\\pages\\ChatWindow.tsx', 'utf-8');
const lines = content.split('\n');

lines.forEach((line, i) => {
    // Find 'div' as a word but not as a tag
    const matches = line.match(/\bdiv\b/g);
    if (matches) {
        matches.forEach(m => {
            // Check if it's part of <div or </div>
            if (!line.includes('<div') && !line.includes('</div')) {
                console.log(`Potential rogue 'div' at line ${i + 1}: ${line.trim()}`);
            }
        });
    }
});
