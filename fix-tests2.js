const fs = require('fs');
const turfsSpecPath = 'src/modules/turfs/turfs.service.spec.ts';
if (fs.existsSync(turfsSpecPath)) {
  let turfsSpec = fs.readFileSync(turfsSpecPath, 'utf8');
  turfsSpec = turfsSpec.replace(/paymentPreferences:\s*TurfPaymentPreference\.ADVANCE_PAYMENT/g, "paymentPreferences: [TurfPaymentPreference.ADVANCE_PAYMENT]");
  turfsSpec = turfsSpec.replace(/paymentPreferences:\s*TurfPaymentPreference\.FULL_CASH/g, "paymentPreferences: [TurfPaymentPreference.FULL_CASH]");
  fs.writeFileSync(turfsSpecPath, turfsSpec);
}
