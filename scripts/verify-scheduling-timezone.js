// Simple verification for timezone conversion used by scheduling
// Usage: node scripts/verify-scheduling-timezone.js

const { zonedTimeToUtc, utcToZonedTime, format } = require('date-fns-tz')

function verify(date, time, tz) {
  const local = `${date}T${time}:00`
  const utcInstant = zonedTimeToUtc(local, tz)
  const backInTz = utcToZonedTime(utcInstant, tz)
  console.log('---')
  console.log('Teacher timezone:', tz)
  console.log('Local input:', local)
  console.log('UTC instant:', utcInstant.toISOString())
  console.log('Back in timezone:', format(backInTz, 'yyyy-MM-dd HH:mm:ss'))
}

// Example: teacher in Asia/Shanghai setting 12:00 on 2025-09-02
verify('2025-09-02', '12:00', 'Asia/Shanghai')

// Compare with UTC interpretation (if server mistakenly used UTC/local midnight)
verify('2025-09-02', '12:00', 'UTC')

// Another example: teacher in America/Los_Angeles
verify('2025-09-02', '12:00', 'America/Los_Angeles')

console.log('\nDone')
