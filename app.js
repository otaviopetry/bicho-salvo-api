require("dotenv").config();

const express = require("express");
const AWS = require("aws-sdk");
const multer = require("multer");
const cors = require("cors");
const { v4 } = require("uuid");

// Firebase
const firebaseAdmin = require("firebase-admin");

firebaseAdmin.initializeApp({
  credential: firebaseAdmin.credential.cert(
    JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  ),
});

const db = firebaseAdmin.firestore();

// Configure AWS SDK
AWS.config.update({
  region: "us-east-1",
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const s3 = new AWS.S3();

// App
const upload = multer();
const app = express();

app.use(cors());
app.use(express.json());

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    console.log("No file uploaded");
    return res.status(400).send("No file uploaded.");
  }

  const { originalname, buffer, mimetype } = req.file;

  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: `${v4()}-${Date.now()}-${originalname}`,
    Body: buffer,
    ContentType: mimetype,
  };

  console.log("Params:", params);

  s3.upload(params, function (err, data) {
    if (err) {
      console.log("Error uploading to S3:", err);
      return res.status(500).send("An error occurred: " + err.message);
    }
    console.log("Upload successful:", data);
    return res.status(200).json({
      message: "File uploaded successfully.",
      location: data.Location,
    });
  });
});

app.post("/add-animal", async (req, res) => {
  try {
    const animal = req.body;
    const docRef = await db.collection("animals").add(animal);
    console.log("Document written with ID:", docRef.id);
    res.status(200).json({ message: "Document written with ID: " + docRef.id });
  } catch (e) {
    console.error("Error adding document:", e);
    res.status(500).json({ error: "Error adding document: " + e.message });
  }
});

app.get("/animals", async (req, res) => {
  try {
    const animalCol = firebaseAdmin.firestore().collection("animals");
    const snapshot = await animalCol.get();
    const animals = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    res.status(200).json(animals);
  } catch (error) {
    console.error("Error fetching animals from Firestore:", error);
    res.status(500).json({ message: "Failed to fetch animals" });
  }
});

const port = process.env.PORT || 3000;

app.listen(port, () => console.log(`Server running on port ${port}`));
