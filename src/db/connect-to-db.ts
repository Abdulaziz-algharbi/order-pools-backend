import mongoose from 'mongoose';
import type { Mongoose } from 'mongoose';

async function connectToDB(mongoUri: string): Promise<Mongoose | null> {
  try {
    const connection = await mongoose.connect(mongoUri, {
      autoIndex: true, // Automatically build indexes defined in your schema
      autoCreate: true, // Automatically create collections defined in your schema
    });

    console.log('Connected to MongoDB successfully');

    return connection;
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    return null;
  }
}

export default connectToDB;
