import "dotenv/config";
import { MongoClient } from "mongodb";

const client = new MongoClient(process.env.MONGODB_URI!);
client
  .connect()
  .then(async () => {
    await client.db(process.env.MONGODB_DATABASE).command({ ping: 1 });
    console.log("MongoDB OK");
    await client.close();
  })
  .catch((e) => {
    console.log("MongoDB FAILED:", String(e.message).split("\n")[0]);
    process.exit(1);
  });
