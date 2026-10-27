import mongoose from "mongoose";
import bcrypt from "bcryptjs";

async function main() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/careflow";
  await mongoose.connect(uri);
  const hash = await bcrypt.hash("purushoth123", 12);

  const res = await mongoose.connection.db!.collection("users").updateMany(
    { email: { $regex: "demo\\." } },
    { $set: { password: hash } }
  );
  console.log("Updated demo users password in DB:", res.modifiedCount);

  // Check admin
  const admin = await mongoose.connection.db!.collection("users").findOne({ email: "demo.admin@careflow.test" });
  if (!admin) {
    await mongoose.connection.db!.collection("users").insertOne({
      name: "Hospital Director",
      email: "demo.admin@careflow.test",
      password: hash,
      role: "admin",
      authVersion: 1,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log("Created demo.admin@careflow.test");
  } else {
    await mongoose.connection.db!.collection("users").updateOne({ _id: admin._id }, { $set: { password: hash } });
  }

  // Check receptionist
  const rec = await mongoose.connection.db!.collection("users").findOne({ email: "demo.reception@careflow.test" });
  if (!rec) {
    await mongoose.connection.db!.collection("users").insertOne({
      name: "Front Desk Staff",
      email: "demo.reception@careflow.test",
      password: hash,
      role: "receptionist",
      authVersion: 1,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log("Created demo.reception@careflow.test");
  } else {
    await mongoose.connection.db!.collection("users").updateOne({ _id: rec._id }, { $set: { password: hash } });
  }

  // Also ensure doctor@careflow.com and patient@careflow.com have purushoth123
  await mongoose.connection.db!.collection("users").updateMany(
    { email: { $in: ["doctor@careflow.com", "patient@careflow.com"] } },
    { $set: { password: hash } }
  );
  console.log("Updated doctor@careflow.com and patient@careflow.com to purushoth123");

  await mongoose.disconnect();
}

main().catch(console.error);
