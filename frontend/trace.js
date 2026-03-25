const fs = require('fs');
const sm = require('source-map');

async function run() {
  const rawMap = fs.readFileSync('../public/assets/index-GIRunsmH.js.map', 'utf8');
  const code = fs.readFileSync('../public/assets/index-GIRunsmH.js', 'utf8');
  const regex = /(?:const|let|var)\s+w\s*=/g;
  let match;
  await sm.SourceMapConsumer.with(rawMap, null, consumer => {
    while ((match = regex.exec(code)) !== null) {
      const lines = code.substring(0, match.index).split('\n');
      const line = lines.length;
      const column = lines[lines.length - 1].length;
      const pos = consumer.originalPositionFor({line, column});
      console.log('w found at:', line, ':', column, 'maps to:', pos.source, pos.line, pos.name);
    }
  });
}
run();
