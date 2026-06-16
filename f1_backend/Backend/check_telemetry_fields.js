const mongoose = require('mongoose');
async function run() {
  await mongoose.connect('mongodb+srv://rohittiwari1998:kgiuhAKHkAqcYUAc@cluster0.5jbg9.mongodb.net/Apex?retryWrites=true&w=majority&appName=Cluster0');
  const doc = await mongoose.connection.db.collection('raw_lap_telemetry').findOne();
  console.log('Fields:');
  console.log('Speed len:', doc.speed?.length, 'Sample:', doc.speed?.slice(0, 5));
  console.log('Throttle len:', doc.throttle?.length, 'Sample:', doc.throttle?.slice(0, 5));
  console.log('Brake len:', doc.brake?.length, 'Sample:', doc.brake?.slice(0, 5));
  console.log('nGear len:', doc.nGear?.length, 'Sample:', doc.nGear?.slice(0, 5));
  console.log('SessionTime len:', doc.sessionTime?.length, 'Sample:', doc.sessionTime?.slice(0, 5));
  await mongoose.disconnect();
}
run().catch(console.error);
