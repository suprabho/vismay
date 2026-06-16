const mongoose = require('mongoose');
async function run() {
  await mongoose.connect('mongodb+srv://rohittiwari1998:kgiuhAKHkAqcYUAc@cluster0.5jbg9.mongodb.net/Apex?retryWrites=true&w=majority&appName=Cluster0');
  const pos = await mongoose.connection.db.collection('car_positions').findOne();
  console.log(pos.sessionKey, pos.driverNumber, pos.frameCount);
  await mongoose.disconnect();
}
run().catch(console.error);
