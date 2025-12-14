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
    app.get("/users", async (req, res) => {
      const email = req.query.email;
      const user = await usersCollection.findOne({ email });
      res.send(user);
    });
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email });
      res.send(user);
    });
    // GET all users (Admin - Manage Users)
    app.get("/admin/users", async (req, res) => {
      try {
        const role = req.query.role;
        let query = {};

        if (role) {
          query.role = role; // Student / Moderator / Admin
        }

        const users = await usersCollection.find(query).toArray();
        res.send(users);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to load users" });
      }
    });
    // UPDATE user role (Admin)
    app.patch("/admin/users/role/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { role } = req.body; // Admin / Moderator / Student

        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role } }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send({
          message: "User role updated successfully",
          modifiedCount: result.modifiedCount,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to update role" });
      }
    });
    // DELETE user (Admin)
    app.delete("/admin/users/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await usersCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send({ message: "User deleted successfully" });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to delete user" });
      }
    });
    // >>>>>>>>>>>>>>> ADMIN ANALYTICS API <<<<<<<<<<<<<<
    //  Overall stats
    app.get("/admin/analytics/stats", async (req, res) => {
      try {
        const totalUsers = await usersCollection.countDocuments();
        const totalScholarships = await scholarshipCollection.countDocuments();

        // Total fees collected = sum of applicationFees from applications
        const feesResult = await applicationCollection
          .aggregate([
            {
              $group: {
                _id: null,
                totalFees: { $sum: "$applicationFees" },
              },
            },
          ])
          .toArray();

        const totalFees = feesResult[0]?.totalFees || 0;

        res.send({
          totalUsers,
          totalScholarships,
          totalFees,
        });
      } catch (error) {
        console.error("Analytics stats error:", error);
        res.status(500).send({ message: "Server Error" });
      }
    });
    //  Applications count by Scholarship Category (for chart)
    app.get("/admin/analytics/applications-by-category", async (req, res) => {
      try {
        const result = await applicationCollection
          .aggregate([
            {
              $addFields: {
                scholarshipObjectId: {
                  $toObjectId: "$scholarshipId",
                },
              },
            },
            {
              $lookup: {
                from: "scholarships",
                localField: "scholarshipObjectId",
                foreignField: "_id",
                as: "scholarship",
              },
            },
            { $unwind: "$scholarship" },
            {
              $group: {
                _id: "$scholarship.scholarshipCategory",
                applications: { $sum: 1 },
              },
            },
            {
              $project: {
                _id: 0,
                category: "$_id",
                applications: 1,
              },
            },
          ])
          .toArray();

        res.send(result);
      } catch (error) {
        console.error("Analytics chart error:", error);
        res.status(500).send({ message: "Server Error" });
      }
    });

    // >>>>>>>>>>>>>>>>>>>>> Scholarships-API <<<<<<<<<<<<<<<<<<<<<<<<<<<
    // GET all scholarships with search + filter + sort + pagination
    app.get("/allScholarships", async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const { search, category, country, sort } = req.query;

        let query = {};

        // 🔍 SEARCH (scholarship / university / degree)
        if (search) {
          query.$or = [
            { scholarshipName: { $regex: search, $options: "i" } },
            { universityName: { $regex: search, $options: "i" } },
            { degree: { $regex: search, $options: "i" } },
          ];
        }

        // 🎯 FILTER BY CATEGORY
        if (category) {
          query.scholarshipCategory = category;
        }

        // 🌍 FILTER BY COUNTRY
        if (country) {
          query.universityCountry = country;
        }

        // ↕️ SORT
        let sortQuery = {};
        if (sort === "feesAsc") {
          sortQuery.applicationFees = 1;
        } else if (sort === "feesDesc") {
          sortQuery.applicationFees = -1;
        }

        const total = await scholarshipCollection.countDocuments(query);

        const scholarships = await scholarshipCollection
          .find(query)
          .sort(sortQuery)
          .skip(skip)
          .limit(limit)
          .toArray();

        res.send({
          scholarships,
          totalPages: Math.ceil(total / limit),
          page,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Server Error" });
      }
    });
    // Get admin-scholarship
    app.get("/admin/allScholarships", async (req, res) => {
      try {
        const scholarships = await scholarshipCollection
          .find({})
          .sort({ scholarshipPostDate: -1 }) // newest first (optional)
          .toArray();

        res.send(scholarships);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Server Error" });
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
      try {
        const scholarship = req.body;

        // 🔴 Required fields validation
        const requiredFields = [
          "scholarshipName",
          "universityName",
          "universityWorldRank",
          "universityCountry",
          "universityCity",
          "subjectCategory",
          "scholarshipCategory",
          "degree",
          "applicationFees",
          "serviceCharge",
          "applicationDeadline",
          "postedUserEmail",
        ];

        for (const field of requiredFields) {
          if (!scholarship[field]) {
            return res.status(400).json({
              message: `${field} is required`,
            });
          }
        }

        //  Auto add post date
        scholarship.scholarshipPostDate = new Date()
          .toISOString()
          .split("T")[0];

        //  Ensure numeric fields are numbers
        scholarship.applicationFees = Number(scholarship.applicationFees);
        scholarship.serviceCharge = Number(scholarship.serviceCharge);
        scholarship.tuitionFees = Number(scholarship.tuitionFees || 0);

        //  Insert into DB
        const result = await scholarshipCollection.insertOne(scholarship);

        res.status(201).json({
          success: true,
          message: "Scholarship added successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Scholarship POST error:", error);
        res.status(500).json({
          success: false,
          message: "Internal Server Error",
        });
      }
    });
    // UPDATE scholarship
    app.put("/allScholarships/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { scholarshipName, universityName, degree, applicationFees } =
          req.body;

        // Convert applicationFees to number
        const updatedData = {
          scholarshipName,
          universityName,
          degree,
          applicationFees: Number(applicationFees),
        };

        const result = await scholarshipCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData }
        );

        if (result.modifiedCount === 0) {
          return res
            .status(404)
            .send({ message: "Scholarship not found or no changes made" });
        }

        res.send({
          message: "Scholarship updated successfully",
          modifiedCount: result.modifiedCount,
        });
      } catch (error) {
        console.error("Update scholarship error:", error);
        res.status(500).send({ message: "Update failed" });
      }
    });
    // DELETE scholarship
    app.delete("/allScholarships/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await scholarshipCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({ message: "Scholarship not found" });
        }

        res.json({ message: "Scholarship deleted successfully" });
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
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
