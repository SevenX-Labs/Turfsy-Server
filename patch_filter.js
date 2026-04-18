const fs = require('fs');
const file = 'src/common/filters/security-exception.filter.ts';
let code = fs.readFileSync(file, 'utf8');
code = code.replace(
  /const clientMessage =\s+status >= 500\s+\? GENERIC_MESSAGES\[status\] \|\| 'Something went wrong.'\s+: originalMessage;/g,
  'const clientMessage = originalMessage;'
);
fs.writeFileSync(file, code);
