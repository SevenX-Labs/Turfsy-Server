const fs = require('fs');

const authSpecPath = 'src/modules/auth/auth.controller.spec.ts';
if (fs.existsSync(authSpecPath)) {
  let authSpec = fs.readFileSync(authSpecPath, 'utf8');
  authSpec = authSpec.replace(/controller\.userResendOtp\(dto as any\)/g, "controller.userResendOtp(dto as any, '127.0.0.1')");
  authSpec = authSpec.replace(/controller\.ownerResendOtp\(dto as any\)/g, "controller.ownerResendOtp(dto as any, '127.0.0.1')");
  fs.writeFileSync(authSpecPath, authSpec);
  console.log('Fixed auth spec');
}

const turfsSpecPath = 'src/modules/turfs/turfs.service.spec.ts';
if (fs.existsSync(turfsSpecPath)) {
  let turfsSpec = fs.readFileSync(turfsSpecPath, 'utf8');
  turfsSpec = turfsSpec.replace(/paymentPreference:/g, "paymentPreferences:");
  turfsSpec = turfsSpec.replace(/\.paymentPreference\)/g, ".paymentPreferences)");
  fs.writeFileSync(turfsSpecPath, turfsSpec);
  console.log('Fixed turfs spec');
}
