const fs = require('fs');
const path = require('path');

const bookingServicePath = path.join(__dirname, 'src/modules/booking/booking.service.ts');
let content = fs.readFileSync(bookingServicePath, 'utf8');

// Remove checkInPin generation
content = content.replace(/const checkInPin = crypto\.randomInt\(1000, 9999\)\.toString\(\);\n/g, '');
content = content.replace(/\s*checkInPin,\n/g, '\n');
content = content.replace(/\s*checkInPin: null,.*\n/g, '\n');
content = content.replace(/\s*checkInPin: undefined,.*\n/g, '\n');
content = content.replace(/\s*pin: booking\.checkInPin,.*\n/g, '\n');

// Attempt to remove verifyCheckInPin block
const verifyPinRegex = /async verifyCheckInPin\([\s\S]*?\/\/\s*5\.\s*VERIFY/g;
const match = verifyPinRegex.exec(content);
if (match) {
  content = content.substring(0, match.index) + '// 5. VERIFY' + content.substring(match.index + match[0].length);
}

fs.writeFileSync(bookingServicePath, content);
console.log('Cleaned booking.service.ts');
