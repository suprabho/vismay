const mongoose = require('mongoose');
async function run() {
  await mongoose.connect('mongodb+srv://rohittiwari1998:kgiuhAKHkAqcYUAc@cluster0.5jbg9.mongodb.net/Apex?retryWrites=true&w=majority&appName=Cluster0');
  const collections = await mongoose.connection.db.listCollections().toArray();
  for (const c of collections) {
      const count = await mongoose.connection.db.collection(c.name).countDocuments();
      console.log(c.name, count);
  }
  await mongoose.disconnect();
}
run().catch(console.error);
