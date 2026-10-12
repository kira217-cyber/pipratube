import mongoose from "mongoose";

// Every write here is a single-document operation, so this works the same
// on a standalone MongoDB (local/VPS) and an Atlas replica set — never add
// multi-document transactions without a replica set.
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;
