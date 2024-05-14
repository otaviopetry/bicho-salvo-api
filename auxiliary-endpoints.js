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

app.get("/animals-on-location", async (req, res) => {
  const location = req.query.location;

  try {
    const animalsRef = db.collection("animals");
    const snapshot = await animalsRef.get();
    const animals = [];

    snapshot.forEach((doc) => {
      let data = doc.data();
      if (data.whereItIs === location) {
        animals.push(doc.id);
      }
    });

    res.status(200).send({ animals });
  } catch (error) {
    console.error("Error fetching animals: ", error);
    res.status(500).send("Failed to retrieve animals");
  }
});

app.patch("/animals-location", async (req, res) => {
  const { ids, location } = req.body;

  try {
    const animalsRef = db.collection("animals");
    const batch = db.batch();

    ids.forEach((id) => {
      const animalRef = animalsRef.doc(id);
      batch.update(animalRef, { whereItIs: location });
    });

    await batch.commit();
    res.status(200).send({ message: "Locations updated successfully." });
  } catch (error) {
    console.error("Error updating locations: ", error);
    res.status(500).send("Failed to update locations");
  }
});

app.get("/iguatemi", async (req, res) => {
  const iguatemiCode = req.query.code;

  try {
    const animalRef = db.collection("animals");
    let query = animalRef.orderBy("createdAt", "desc");

    const snapshot = await query.get();

    if (snapshot.empty) {
      res.status(404).send("No matching documents.");
      return;
    }

    const results = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.characteristics.indexOf(iguatemiCode) !== -1) {
        results.push(doc.id);
      }
    });

    res.status(200).json(results);
  } catch (error) {}
});

app.get("/search-jpg-entries", async (req, res) => {
  try {
    const animalCol = db.collection("animals");
    let query = animalCol.orderBy("createdAt", "desc");

    const snapshot = await query.get();
    if (snapshot.empty) {
      res.status(404).send("No matching documents.");
      return;
    }

    const results = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (
        data.imageURLs &&
        data.imageURLs.some(
          (url) => url.endsWith(".jpg") || url.endsWith(".png")
        )
      ) {
        results.push(doc.id);
      }
    });

    res.status(200).json(results);
  } catch (error) {
    console.error("Error fetching entries: ", error);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

app.get("/search-specific-image", async (req, res) => {
  try {
    const { image } = req.query;

    const animalCol = db.collection("animals");
    let query = animalCol.orderBy("createdAt", "desc");

    const snapshot = await query.get();
    if (snapshot.empty) {
      res.status(404).send("No matching documents.");
      return;
    }

    const results = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (
        data.imageURLs &&
        data.imageURLs.some((url) => url.indexOf(image) !== -1)
      ) {
        results.push(doc.id);
      }
    });

    res.status(200).json(results);
  } catch (error) {
    console.error("Error fetching entries: ", error);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

app.delete("/animals-delete", async (req, res) => {
  const { ids } = req.body; // Extract IDs from request body

  // Check if IDs array is present and valid
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res
      .status(400)
      .send({ message: "No IDs provided or invalid format." });
  }

  try {
    const animalsRef = db.collection("animals");
    const batch = db.batch();

    // Add delete operations for each ID to the batch
    ids.forEach((id) => {
      const animalRef = animalsRef.doc(id);
      batch.delete(animalRef);
    });

    // Commit the batch to perform all deletions
    await batch.commit();
    res.status(200).send({ message: "Animals deleted successfully." });
  } catch (error) {
    console.error("Error deleting animals: ", error);
    res
      .status(500)
      .send({ message: "Failed to delete animals", error: error.message });
  }
});

const port = process.env.PORT || 3000;

app.listen(port, () => console.log(`Server running on port ${port}`));
