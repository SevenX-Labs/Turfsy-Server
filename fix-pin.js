const fs = require('fs');
const path = require('path');

const bookingServicePath = path.join(__dirname, 'src/modules/booking/booking.service.ts');
let content = fs.readFileSync(bookingServicePath, 'utf8');

content = content.replace(/\s*pinAttempts:\s*0,\n/g, '\n');
content = content.replace(/\s*pinAttempts:\s*undefined,\n/g, '\n');
content = content.replace(/\s*pinLocked:\s*undefined,\n/g, '\n');

fs.writeFileSync(bookingServicePath, content);
console.log('Cleaned booking.service.ts completely');
