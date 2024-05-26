const express = require("express");

const stripe = require("stripe")(
  "sk_test_51L14pjDEsxnXfJbTlrS3grchkKNLNJquxxzz79aQiElQwp6RcnTeEJIRskV7INrmUt7vBTFS2pWMTokjKFP0nbIC00bPMze6Az"
);
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const port = process.env.PORT || 5000;


const acceptedOrigins = [
  "http://localhost:5173",
  "https://recipe-sharing-iota.vercel.app",
];

// middleware
app.use(
  cors({
    origin: acceptedOrigins,
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    preflightContinue: false,
  })
);
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zfltext.mongodb.net/?retryWrites=true&w=majority&appName=Recipe`;

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
    // Connect the client to the server
    await client.connect();

    const userCollection = client.db("recipeDB").collection("users");
    const recipeCollection = client.db("recipeDB").collection("recipes");

    // jwt related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // middlewares
    const verifyToken = (req, res, next) => {
      // console.log("inside verify token", req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "Unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    // Get All users
    app.get("/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // Create new user
    app.post("/users", async (req, res) => {
      const user = req.body;
      // console.log(user , 'new');
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        console.log("User already exists");
        return res.send({ message: "User already exists", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // Get single user
    app.post("/user", async (req, res) => {
      const { email } = req.body;
      if (!email) {
        return res.status(400).send({ message: "Email is required" });
      }
      const query = { email };
      const user = await userCollection.findOne(query);
      if (!user) {
        return res.status(404).send({ message: "User not found" });
      }
      res.send(user);
    });

    // Update user coin
    app.put("/user/coin", async (req, res) => {
      const { email, coin } = req.body;
      const query = { email };
      const update = {
        $set: { coin },
      };
      const result = await userCollection.updateOne(query, update);
      res.send(result);
    });

    // Add/Remove reaction based on user email
    app.put("/recipe/:recipeId/react", verifyToken, async (req, res) => {
      const { recipeId } = req.params;
      const userEmail = req.decoded.email;
      const recipe = await recipeCollection.findOne({
        _id: new ObjectId(recipeId),
      });

      if (!recipe) return res.status(404).send({ message: "Recipe not found" });

      let updatedReaction = recipe.reaction || [];
      const reactionIndex = updatedReaction.indexOf(userEmail);

      if (reactionIndex !== -1) {
        updatedReaction.splice(reactionIndex, 1);
      } else {
        updatedReaction.push(userEmail);
      }

      const result = await recipeCollection.updateOne(
        { _id: new ObjectId(recipeId) },
        { $set: { reaction: updatedReaction } }
      );

      res.send(result);
    });

    // Get All recipes
    app.get("/recipes", async (req, res) => {
      const result = await recipeCollection.find().toArray();
      res.send(result);
    });

    // Create new Recipe
    app.post("/recipe", async (req, res) => {
      const recipeData = req.body;
      console.log(recipeData, "recipeData");
      const result = await recipeCollection.insertOne(recipeData);
      res.send(result);
    });

    // Get single recipe by recipe name
    app.get("/recipes/:recipeName", verifyToken, async (req, res) => {
      const { recipeName } = req.params;
      const formattedName = recipeName.replace(/-/g, " ");
      const query = { recipeName: formattedName };
      const recipe = await recipeCollection.findOne(query);
      if (!recipe) {
        return res.status(404).send({ message: "Recipe not found" });
      }
      res.send(recipe);
    });

    // Update recipe watchCount and purchasedBy
    app.put("/recipe/purchase", async (req, res) => {
      const { recipeName, userEmail } = req.body;
      const formattedName = recipeName.replace(/-/g, " ");
      const query = { recipeName: formattedName };
      const update = {
        $inc: { watchCount: 1 },
        $push: { purchasedBy: userEmail },
      };
      const result = await recipeCollection.updateOne(query, update);
      res.send(result);
    });

    // Payment api
    app.post("/create-payment-intent", async (req, res) => {
      try {
        const { price } = req.body;
        const amount = parseInt(price * 100);

        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        console.error("Error creating payment intent:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log("Successfully connected to MongoDB!");
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server is running");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
