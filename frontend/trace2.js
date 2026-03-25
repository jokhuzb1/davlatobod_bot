const fs = require('fs');
const code = fs.readFileSync('../public/assets/index-GIRunsmH.js', 'utf8');
const lines = code.split('\n');
// Line 46, column 100625 (0-indexed column)
const line46 = lines[45]; // 0-indexed
const col = 100625;
const snippet = line46.substring(col - 300, col + 300);
fs.writeFileSync('trace2_output.txt', snippet);
console.log('Done. Snippet around the crash written to trace2_output.txt');
