#!/usr/bin/env node
// Guards against the exact bug that caused a real production freeze:
// circle/path/svg/etc. are NOT HTML void elements, so a browser always
// re-serializes them with an explicit closing tag on innerHTML readback -
// even if the source used self-closing "/>" syntax. Any code that compares
// `el.innerHTML !== template` against self-closed SVG markup will find them
// permanently unequal and loop forever re-assigning innerHTML.
//
// This scans app.js's source text (not the DOM) for self-closing tags on
// non-void SVG elements and fails if any are found.

const fs = require('fs');
const path = require('path');

const APP_JS_PATH = path.join(__dirname, '..', 'app.js');
const NON_VOID_SVG_TAGS = ['svg', 'path', 'circle', 'rect', 'line', 'polygon', 'polyline', 'ellipse', 'g'];

const source = fs.readFileSync(APP_JS_PATH, 'utf8');
const tagPattern = new RegExp(`<(${NON_VOID_SVG_TAGS.join('|')})\\b[^>]*/>`, 'g');

const lines = source.split('\n');
const violations = [];

lines.forEach((line, index) => {
  const matches = line.match(tagPattern);
  if (matches) {
    matches.forEach((match) => {
      violations.push({ line: index + 1, snippet: match });
    });
  }
});

if (violations.length > 0) {
  console.error(`\nFound ${violations.length} self-closing SVG tag(s) in app.js - these will cause an infinite innerHTML re-render loop:\n`);
  violations.forEach((v) => {
    console.error(`  line ${v.line}: ${v.snippet}`);
  });
  console.error('\nFix: use an explicit closing tag instead, e.g. <circle ...></circle> not <circle .../>\n');
  process.exit(1);
}

console.log('No self-closing SVG tags found in app.js.');
process.exit(0);
