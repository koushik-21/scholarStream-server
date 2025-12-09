const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

//>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>middle-ware-connection<<<<<<<<<<<<<<<<<<<<<<<<
app.use(cors());
app.use(express.json());
//>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>DATABASE_CONNECTION_MONGODB_<<<<<<<<<<<<<<<<<<<<<<<<<<<<
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hc5ykgf.mongodb.net/?appName=Cluster0`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    const db = client.db(process.env.DB_NAME);
    const usersCollection = db.collection("users");
    const scholarshipsCollection = db.collection("scholarships");
    const applicationCollection = db.collection("applications");
    const reviewCollection = db.collection("reviews");
    // >>>>>>>>>>>>>>>>>>>>> USERS-API <<<<<<<<<<<<<<<<<<<<<<<<<<<
    app.post("/users", async (req, res) => {
      const userData = req.body;
      const email = userData.email;
      const newUser = {
        name: userData.displayName,
        email: userData.email,
        photoURL: userData.photoURL,
        role: "Student",
      };

      const existingUser = await usersCollection.findOne({ email });
      if (existingUser) {
        return res.send({ message: "User already exists" });
      }

      const result = await usersCollection.insertOne(newUser);
      res.send(result);
    });

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

///////////////////////// Root API //////////////////////
app.get("/", (req, res) => {
  res.send("server is running , so here is your data : XXYXCXRE");
});
app.listen(port, (req, res) => {
  console.log("YOUR SERVER IS RUNNING ON PORT : ", port);
});
