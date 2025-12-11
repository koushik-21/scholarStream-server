const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

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
    const scholarshipCollection = db.collection("scholarships");
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
    app.put("/users", async (req, res) => {
      const { email, name, photoURL } = req.body;

      const result = await usersCollection.updateOne(
        { email: email },
        { $set: { name, photoURL } }
      );

      res.send(result);
    });
    // >>>>>>>>>>>>>>>>>>>>> Scholarships-API <<<<<<<<<<<<<<<<<<<<<<<<<<<
    // GET all scholarships with search + filter + sort + pagination
    app.get("/allScholarships", async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const search = req.query.search || "";
        const category = req.query.category || "";
        const country = req.query.country || "";
        const sort = req.query.sort || ""; // feesAsc, feesDesc, newest[will do later]

        let query = {};

        // SEARCH
        if (search) {
          query.$or = [
            { scholarshipName: { $regex: search, $options: "i" } },
            { universityName: { $regex: search, $options: "i" } },
            { degree: { $regex: search, $options: "i" } },
          ];
        }

        // FILTER by category
        if (category) {
          query.scholarshipCategory = {
            $regex: `^${category.trim()}$`,
            $options: "i",
          };
        }

        // FILTER by country
        if (country) {
          query.universityCountry = country;
        }

        // SORTING
        let sortQuery = {};
        if (sort === "feesAsc") sortQuery.applicationFees = 1;
        if (sort === "feesDesc") sortQuery.applicationFees = -1;
        // if (sort === "newest") sortQuery.postedDate = -1; // db te field add kortehobe - later work

        const scholarships = await scholarshipCollection
          .find(query)
          .sort(sortQuery)
          .skip(skip)
          .limit(limit)
          .toArray();

        const total = await scholarshipCollection.countDocuments(query);
        const totalPages = Math.ceil(total / limit);

        res.json({
          scholarships,
          totalPages,
          page,
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });
    // Get single scholarship
    app.get("/allScholarships/:id", async (req, res) => {
      const id = req.params.id;
      const result = await scholarshipCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });
    // Add scholarship
    app.post("/allScholarships", async (req, res) => {
      const scholarship = req.body;
      const result = await scholarshipCollection.insertOne(scholarship);
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
