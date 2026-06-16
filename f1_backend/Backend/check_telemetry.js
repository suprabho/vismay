const mongoose = require('mongoose');
const url = 'mongodb://localhost:27017/Apex';
async function run() {
  await mongoose.connect(url);
  const db = mongoose.connection.db;
  const count = await db.collection('raw_lap_telemetry').countDocuments();
  console.log('Total raw_lap_telemetry:', count);
  const sample = await db.collection('raw_lap_telemetry').findOne();
  console.log('Sample:', sample ? { sessionKey: sample.sessionKey, driverNumber: sample.driverNumber, lap: sample.lap } : 'None');
  process.exit();
}
run();
