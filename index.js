const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
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
    const applicationsCollection = db.collection("applications");
    const reviewCollection = db.collection("reviews");
    // >>>>>>>>>>> APPLICATIONS API <<<<<<<<<<
    // ======================================================
    // GET applications by student email
    // app.get("/applications", async (req, res) => {
    //   try {
    //     const email = req.query.email;
    //     if (!email)
    //       return res.status(400).send({ message: "Email query required" });

    //     // Find all applications for this email
    //     const apps = await applicationsCollection
    //       .find({ applicantEmail: email })
    //       .toArray();

    //     // Return the applications
    //     res.send(apps);
    //   } catch (err) {
    //     console.error(err);
    //     res.status(500).send({ message: "Failed to fetch applications" });
    //   }
    // });
    // GET applications by student email with scholarship info
    // app.get("/applications", async (req, res) => {
    //   try {
    //     const email = req.query.email;
    //     if (!email)
    //       return res.status(400).send({ message: "Email query required" });

    //     const apps = await applicationsCollection
    //       .aggregate([
    //         { $match: { applicantEmail: email } },
    //         {
    //           $lookup: {
    //             from: "scholarships",
    //             localField: "scholarshipId",
    //             foreignField: "_id",
    //             as: "scholarshipDetails",
    //           },
    //         },
    //         { $unwind: "$scholarshipDetails" }, // single scholarship per application
    //         {
    //           $project: {
    //             _id: 1,
    //             applicantEmail: 1,
    //             applicantName: 1,
    //             amount: 1,
    //             paymentStatus: 1,
    //             applicationStatus: 1,
    //             transactionId: 1,
    //             paidAt: 1,
    //             feedback: 1,
    //             universityName: "$scholarshipDetails.universityName",
    //             universityAddress: {
    //               $concat: [
    //                 "$scholarshipDetails.universityCity",
    //                 ", ",
    //                 "$scholarshipDetails.universityCountry",
    //               ],
    //             },
    //             subjectCategory: "$scholarshipDetails.subjectCategory",
    //             degree: "$scholarshipDetails.degree",
    //           },
    //         },
    //       ])
    //       .toArray();

    //     res.send(apps);
    //   } catch (err) {
    //     console.error(err);
    //     res.status(500).send({ message: "Failed to fetch applications" });
    //   }
    // });
    app.get("/applications", async (req, res) => {
      try {
        const email = req.query.email;
        if (!email)
          return res.status(400).send({ message: "Email query required" });

        const apps = await applicationsCollection
          .aggregate([
            { $match: { applicantEmail: email } },
            {
              $addFields: {
                scholarshipObjectId: { $toObjectId: "$scholarshipId" },
              },
            },
            {
              $lookup: {
                from: "scholarships",
                localField: "scholarshipObjectId",
                foreignField: "_id",
                as: "scholarshipDetails",
              },
            },
            { $unwind: "$scholarshipDetails" },
            {
              $project: {
                _id: 1,
                applicantEmail: 1,
                applicantName: 1,
                amount: 1,
                paymentStatus: 1,
                applicationStatus: 1,
                transactionId: 1,
                paidAt: 1,
                feedback: 1,
                universityName: "$scholarshipDetails.universityName",
                universityAddress: {
                  $concat: [
                    "$scholarshipDetails.universityCity",
                    ", ",
                    "$scholarshipDetails.universityCountry",
                  ],
                },
                subjectCategory: "$scholarshipDetails.subjectCategory",
                degree: "$scholarshipDetails.degree",
              },
            },
          ])
          .toArray();

        res.send(apps);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to fetch applications" });
      }
    });

    // DELETE application by ID
    app.delete("/applications/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await applicationsCollection.deleteOne({
          _id: new ObjectId(id),
        });
        if (result.deletedCount === 0)
          return res.status(404).send({ message: "Application not found" });
        res.send({ message: "Application deleted successfully" });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Delete failed" });
      }
    });

    // ======================================================
    // 2️⃣ CREATE STRIPE CHECKOUT SESSION
    // ======================================================
    app.post("/scholarship-payment-session", async (req, res) => {
      try {
        const { applicationId, userEmail } = req.body;

        if (!applicationId || !userEmail) {
          return res.status(400).send({ error: "Invalid payment data" });
        }

        // 🔒 Always fetch amount from DB (never trust frontend)
        const application = await applicationsCollection.findOne({
          _id: new ObjectId(applicationId),
        });

        if (!application) {
          return res.status(404).send({ error: "Application not found" });
        }

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",
          customer_email: userEmail,
          line_items: [
            {
              price_data: {
                currency: "usd",
                unit_amount: application.amount * 100,
                product_data: {
                  name: application.scholarshipName,
                },
              },
              quantity: 1,
            },
          ],
          metadata: {
            applicationId: applicationId,
          },
          success_url: `${process.env.SITE_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.SITE_DOMAIN}/payment-failed?applicationId=${applicationId}`,
        });

        res.send({ url: session.url });
      } catch (error) {
        console.error("Stripe session error:", error);
        res.status(500).send({ error: error.message });
      }
    });

    // ======================================================
    // 3️⃣ PAYMENT SUCCESS VERIFY
    // ======================================================
    app.patch("/scholarship-payment-success", async (req, res) => {
      try {
        const { session_id } = req.query;
        if (!session_id) {
          return res.status(400).send({ success: false });
        }

        const session = await stripe.checkout.sessions.retrieve(session_id);
        const applicationId = session.metadata.applicationId;

        if (session.payment_status !== "paid") {
          return res.send({ success: false });
        }

        // 🔁 Prevent duplicate update
        const existing = await applicationsCollection.findOne({
          _id: new ObjectId(applicationId),
        });

        if (existing?.paymentStatus === "paid") {
          return res.send({
            success: true,
            amount: existing.amount,
            transactionId: existing.transactionId,
            alreadyPaid: true,
          });
        }

        await applicationsCollection.updateOne(
          { _id: new ObjectId(applicationId) },
          {
            $set: {
              paymentStatus: "paid",
              applicationStatus: "submitted",
              transactionId: session.payment_intent,
              paidAt: new Date(),
            },
            $inc: { paymentAttempts: 1 },
          }
        );

        res.send({
          success: true,
          amount: session.amount_total / 100,
          transactionId: session.payment_intent,
        });
      } catch (error) {
        console.error("Payment success error:", error);
        res.status(500).send({ success: false });
      }
    });

    // // 1️ Create Checkout Session
    // app.post("/scholarship-payment-session", async (req, res) => {
    //   const applicationInfo = req.body;

    //   // Validate email
    //   if (
    //     !applicationInfo.userEmail ||
    //     !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(applicationInfo.userEmail)
    //   ) {
    //     return res.status(400).send({ error: "Invalid email address" });
    //   }

    //   const amount = parseInt(applicationInfo.applicationFees) * 100; // USD cents

    //   try {
    //     const session = await stripe.checkout.sessions.create({
    //       line_items: [
    //         {
    //           price_data: {
    //             currency: "usd",
    //             unit_amount: amount,
    //             product_data: {
    //               name: `Scholarship: ${applicationInfo.scholarshipName}`,
    //             },
    //           },
    //           quantity: 1,
    //         },
    //       ],
    //       mode: "payment",
    //       customer_email: applicationInfo.userEmail, //  use actual email from frontend
    //       metadata: {
    //         scholarshipId: applicationInfo.scholarshipId,
    //         userId: applicationInfo.userId,
    //         scholarshipName: applicationInfo.scholarshipName,
    //         applicantEmail: applicationInfo.userEmail,
    //         applicantName: applicationInfo.userName || "Unknown",
    //       },
    //       // success_url: `${process.env.SITE_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    //       // cancel_url: `${process.env.SITE_DOMAIN}/payment-failed`,
    //       success_url: `${process.env.SITE_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    //       cancel_url: `${process.env.SITE_DOMAIN}/payment-failed`,
    //     });

    //     res.send({ url: session.url });
    //   } catch (err) {
    //     console.error("Stripe checkout error:", err);
    //     res.status(500).send({ error: err.message });
    //   }
    // });
    // // 2️ Handle Payment Success
    // // app.patch("/scholarship-payment-success", async (req, res) => {
    // //   const sessionId = req.query.session_id;

    // //   try {
    // //     const session = await stripe.checkout.sessions.retrieve(sessionId);

    // //     if (session.payment_status !== "paid") {
    // //       return res.status(400).send({ success: false });
    // //     }

    // //     const transactionId = session.payment_intent;
    // //     const scholarshipId = session.metadata.scholarshipId;
    // //     const userId = session.metadata.userId;

    // //     // ✅ Update existing application only
    // //     const result = await applicationsCollection.updateOne(
    // //       {
    // //         scholarshipId,
    // //         userId,
    // //       },
    // //       {
    // //         $set: {
    // //           paymentStatus: "paid",
    // //           applicationStatus: "submitted",
    // //           transactionId,
    // //           paidAt: new Date(),
    // //         },
    // //       }
    // //     );

    // //     res.send({
    // //       success: true,
    // //       transactionId,
    // //     });
    // //   } catch (err) {
    // //     console.error("Payment success error:", err);
    // //     res.status(500).send({ error: err.message });
    // //   }
    // // });
    // // app.patch("/scholarship-payment-success", async (req, res) => {
    // //   try {
    // //     const { session_id } = req.query;

    // //     if (!session_id) {
    // //       return res
    // //         .status(400)
    // //         .json({ success: false, message: "Session ID missing" });
    // //     }

    // //     // 1️ Stripe session verify
    // //     const session = await stripe.checkout.sessions.retrieve(session_id);

    // //     if (session.payment_status !== "paid") {
    // //       return res
    // //         .status(400)
    // //         .json({ success: false, message: "Payment not completed" });
    // //     }

    // //     // 2️ Metadata থেকে data নাও
    // //     const applicationData = {
    // //       scholarshipId: session.metadata.scholarshipId,
    // //       scholarshipName: session.metadata.scholarshipName,
    // //       applicantEmail: session.metadata.email,
    // //       applicantName: session.metadata.name,
    // //       amount: session.amount_total / 100,
    // //       transactionId: session.id,
    // //       paymentStatus: "paid",
    // //       appliedAt: new Date(),
    // //     };

    // //     // 3️ DB save
    // //     const result = await applicationsCollection.insertOne(applicationData);

    // //     res.json({
    // //       success: true,
    // //       transactionId: session.id,
    // //       amount: applicationData.amount,
    // //       applicationId: result.insertedId,
    // //     });
    // //   } catch (error) {
    // //     console.error("Payment success error:", error);
    // //     res.status(500).json({ success: false });
    // //   }
    // // });
    // app.patch("/scholarship-payment-success", async (req, res) => {
    //   try {
    //     const { session_id } = req.query;

    //     if (!session_id) {
    //       return res.status(400).json({ success: false });
    //     }

    //     const session = await stripe.checkout.sessions.retrieve(session_id);

    //     if (session.payment_status !== "paid") {
    //       return res.status(400).json({ success: false });
    //     }

    //     // 🔒 DUPLICATE CHECK
    //     const existingApplication = await applicationsCollection.findOne({
    //       transactionId: session.id,
    //     });

    //     if (existingApplication) {
    //       return res.json({
    //         success: true,
    //         transactionId: session.id,
    //         amount: existingApplication.amount,
    //         alreadySaved: true,
    //       });
    //     }

    //     // ✅ SAVE ONLY ONCE
    //     const applicationData = {
    //       scholarshipId: session.metadata.scholarshipId,
    //       scholarshipName: session.metadata.scholarshipName,
    //       applicantEmail: session.metadata.applicantEmail,
    //       applicantName: session.metadata.applicantName,
    //       amount: session.amount_total / 100,
    //       transactionId: session.id,
    //       paymentStatus: "paid",
    //       appliedAt: new Date(),
    //     };

    //     const result = await applicationsCollection.insertOne(applicationData);

    //     res.json({
    //       success: true,
    //       transactionId: session.id,
    //       amount: applicationData.amount,
    //       applicationId: result.insertedId,
    //     });
    //   } catch (error) {
    //     console.error("Payment success error:", error);
    //     res.status(500).json({ success: false });
    //   }
    // });

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
