require("dotenv").config();
const express = require("express");
const AWS = require("aws-sdk");
const multer = require("multer");
const cors = require("cors");

// Configure AWS SDK
AWS.config.update({
  region: "us-east-1",
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const s3 = new AWS.S3();
const upload = multer(); // for parsing multipart/form-data
const app = express();

app.use(cors());
app.use(express.json()); // To parse JSON bodies, if needed for other routes

app.post("/upload", upload.single("file"), (req, res) => {
  // Check if the file is actually received
  if (!req.file) {
    console.log("No file uploaded");
    return res.status(400).send("No file uploaded.");
  }

  const { originalname, buffer, mimetype } = req.file;

  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: `${Date.now()}-${originalname}`,
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

const port = process.env.PORT || 3000;

app.listen(port, () => console.log(`Server running on port ${port}`));
