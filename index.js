const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;
const path = require("path");
const fs = require("fs");
const generatePayNowStr = require("./public/js/paynow.js");
const QRCode = require("qrcode");

// Ensure temp directory exists
const tempDir = path.join(__dirname, "public", "temp");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

app.use(express.static("public")); // Serve static files

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/generate-qr", (req, res) => {
  const data = req.body || req.query;

  // Validate input
  if (!validateInput(data)) {
    return res.status(400).send("Invalid input parameters");
  }

  const qrString = generatePayNowStr(data);
  const tempFileName = `qr-${Date.now()}.png`;
  const tempFilePath = path.join(tempDir, tempFileName);

  QRCode.toFile(tempFilePath, qrString, (err) => {
    if (err) {
      console.error(err); // Log the error
      return res.status(500).send("Error generating QR code");
    }

    res.sendFile(tempFilePath);
  });
});

function validateInput(data) {
  // Check if all required fields are present
  if (!data.type || !data.number || !data.amount || !data.reference) {
    return false;
  }

  // Validate 'type' - should be either 'uen' or 'mobile'
  if (data.type !== "uen" && data.type !== "mobile") {
    return false;
  }

  // Add more validation as needed, e.g., check format of 'number', 'amount', 'reference'

  return true;
}

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});
