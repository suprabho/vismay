const mongoose = require('mongoose');
async function run() {
  await mongoose.connect('mongodb+srv://rohittiwari1998:kgiuhAKHkAqcYUAc@cluster0.5jbg9.mongodb.net/Apex?retryWrites=true&w=majority&appName=Cluster0');
  const count = await mongoose.connection.db.collection('raw_lap_telemetry').countDocuments();
  console.log('Raw count:', count);
  await mongoose.disconnect();
}
run().catch(console.error);
