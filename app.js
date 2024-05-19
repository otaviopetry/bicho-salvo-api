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

// Endpoints
app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded.");
  }

  const { originalname, buffer, mimetype } = req.file;

  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: `${v4()}-${Date.now()}-${originalname}`,
    Body: buffer,
    ContentType: mimetype,
  };

  s3.upload(params, function (err, data) {
    if (err) {
      return res.status(500).send("An error occurred: " + err.message);
    }
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
    res.status(200).json({
      message: "Document written with ID: " + docRef.id,
      id: docRef.id,
    });
  } catch (e) {
    console.error("Error adding document:", e);
    res.status(500).json({ error: "Error adding document: " + e.message });
  }
});

app.get("/animals", async (req, res) => {
  try {
    const {
      species,
      sex,
      size,
      whereItIs,
      color,
      startAfter,
      limit = 50,
    } = req.query;
    const animalCol = firebaseAdmin.firestore().collection("animals");

    let query = animalCol.orderBy("createdAt", "desc").limit(+limit);

    if (species) {
      if (Array.isArray(species)) {
        query = query.where("species", "in", species);
      } else {
        query = query.where("species", "==", species);
      }
    }
    if (sex) {
      let adaptedSex = [sex, "não se sabe"];

      query = query.where("sex", "in", adaptedSex);
    }
    if (size) {
      if (Array.isArray(size)) {
        query = query.where("size", "in", size);
      } else {
        query = query.where("size", "==", size);
      }
    }
    if (whereItIs) {
      query = query.where("whereItIs", "==", whereItIs);
    }
    if (color) {
      if (Array.isArray(color) && color.length <= 30) {
        query = query.where("color", "in", color);
      } else if (Array.isArray(color) && color.length > 30) {
        return res
          .status(400)
          .json({ message: "You can specify up to 30 colors only." });
      } else {
        query = query.where("color", "==", color);
      }
    }

    query = query.where("foundOwner", "==", false);

    if (startAfter) {
      const lastDoc = await animalCol.doc(startAfter).get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      } else {
        return res.status(404).json({ message: "Invalid startAfter ID" });
      }
    }

    const snapshot = await query.get();
    const animals = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    let nextStartAfter = null;

    if (animals.length > 0) {
      nextStartAfter = animals[animals.length - 1].id; // ID of the last document fetched
    }

    res.status(200).json({
      animals,
      nextPageToken: nextStartAfter, // Token to use to fetch the next page
    });
  } catch (error) {
    console.error("Error fetching animals from Firestore:", error);
    res.status(500).json({ message: "Failed to fetch animals" });
  }
});

app.get("/happy-reunions", async (req, res) => {
  try {
    const { limit = 50, startAfter } = req.query;

    const animalCol = firebaseAdmin.firestore().collection("animals");

    let query = animalCol.orderBy("createdAt", "desc").limit(+limit);

    query = query.where("foundOwner", "==", true);

    if (startAfter) {
      const lastDoc = await animalCol.doc(startAfter).get();

      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      } else {
        return res.status(404).json({ message: "Invalid startAfter ID" });
      }
    }

    const snapshot = await query.get();
    const animals = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    let nextStartAfter = null;

    if (animals.length > 0) {
      nextStartAfter = animals[animals.length - 1].id;
    }

    res.status(200).json({
      animals,
      nextPageToken: nextStartAfter,
    });
  } catch (error) {
    console.error("Error fetching animals from Firestore:", error);
    res.status(500).json({ message: "Failed to fetch animals" });
  }
});

app.get("/temporary-homes", async (req, res) => {
  try {
    const animalsRef = db.collection("animals");
    const snapshot = await animalsRef.get();
    const locations = new Set();

    snapshot.forEach((doc) => {
      let data = doc.data();
      let location = data.whereItIs ?? "";
      let foundOwner = data.foundOwner ?? false;
      if (
        typeof location === "string" &&
        location.length > 0 &&
        location.indexOf("LT") !== -1 &&
        !foundOwner
      ) {
        locations.add(String(data.whereItIs).trim());
      }
    });

    res.status(200).send({ locations: Array.from(locations) });
  } catch (error) {
    console.error("Error fetching colors: ", error);
    res.status(500).send("Failed to retrieve colors");
  }
});

app.get("/locations", async (req, res) => {
  try {
    const animalsRef = db.collection("animals");
    const snapshot = await animalsRef.get();
    const locations = new Set();

    snapshot.forEach((doc) => {
      let data = doc.data();
      let location = data.whereItIs ?? "";
      let foundOwner = data.foundOwner ?? false;
      if (
        typeof location === "string" &&
        location.length > 0 &&
        location.indexOf("LT") === -1 &&
        !foundOwner
      ) {
        locations.add(String(data.whereItIs).trim());
      }
    });

    res.status(200).send({ locations: Array.from(locations) });
  } catch (error) {
    console.error("Error fetching colors: ", error);
    res.status(500).send("Failed to retrieve colors");
  }
});

app.get("/all-locations", async (req, res) => {
  try {
    const animalsRef = db.collection("animals");
    const snapshot = await animalsRef.get();
    const locations = new Set();

    snapshot.forEach((doc) => {
      let data = doc.data();
      let location = data.whereItIs ?? "";
      let foundOwner = data.foundOwner ?? false;

      if (typeof location === "string" && location.length > 0 && !foundOwner) {
        locations.add(String(data.whereItIs).trim());
      }
    });

    res.status(200).send({ locations: Array.from(locations) });
  } catch (error) {
    console.error("Error fetching colors: ", error);
    res.status(500).send("Failed to retrieve colors");
  }
});

app.get("/animal/:id", async (req, res) => {
  const animalId = req.params.id;

  try {
    const animalRef = db.collection("animals").doc(animalId);
    const doc = await animalRef.get();

    if (!doc.exists) {
      res.status(404).send("No animal found with the given ID.");
    } else {
      res.status(200).send(doc.data());
    }
  } catch (error) {
    console.error("Error retrieving animal: ", error);
    res.status(500).send("Error retrieving animal data");
  }
});

app.put("/animal/:id", async (req, res) => {
  const animalId = req.params.id;
  const newData = req.body;

  try {
    const animalRef = db.collection("animals").doc(animalId);
    const doc = await animalRef.get();

    if (!doc.exists) {
      res.status(404).send("No animal found with the given ID.");
    } else {
      await animalRef.set(newData, { merge: true });
      res.status(200).json({ message: "Animal successfully edited." });
    }
  } catch (error) {
    console.error("Error updating animal: ", error);
    res.status(500).send("Error updating animal data");
  }
});

app.get("/animal-count", async (req, res) => {
  const animalsRef = db.collection("animals");
  const snapshot = await animalsRef.count().get();

  res.status(200).send({ count: snapshot.data().count });
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

const port = process.env.PORT || 3000;

app.listen(port, () => console.log(`Server running on port ${port}`));
