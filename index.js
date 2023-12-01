const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;
const path = require("path");
const fs = require("fs");
const generatePayNowStr = require("./public/js/paynow.js");
const QRCode = require("qrcode");
const axios = require("axios");

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

// Function to generate a QR code
function generateQRCode(data, callback) {
  const qrString = generatePayNowStr(data);
  const tempFileName = `qr-${Date.now()}.png`;
  const tempFilePath = path.join(tempDir, tempFileName);

  QRCode.toFile(tempFilePath, qrString, (err) => {
    if (err) {
      console.error(err); // Log the error
      callback(err);
    } else {
      callback(null, tempFilePath); // Successfully generated QR code
    }
  });
}

// Endpoint to generate QR code
app.post("/generate-qr", (req, res) => {
  const data = req.body || req.query;

  // Validate input
  if (!validateInput(data)) {
    return res.status(400).send("Invalid input parameters");
  }

  generateQRCode(data, (err, tempFilePath) => {
    if (err) {
      return res.status(500).send("Error generating QR code");
    }

    // After QR code is generated, call Google Script Web App
    axios
      .post("https://script.google.com/macros/s/AKfycbxah2q1rIQmhEwQdb0ZLvSTgBMLDfcsJ4elai2RBqf9/dev")
      .then((response) => {
        console.log("Payment check initiated:", response.data);
      })
      .catch((error) => {
        console.error("Error triggering Google Script:", error);
      });

    // Send back the path to the QR code image
    res.json({ qrImagePath: tempFilePath });
  });
});

let paymentStatus = {}; // Object to store payment status by reference number

app.post("/payment-confirmation", (req, res) => {
  // When payload is received from Google Script
  const payload = req.body;
  // Process and store the payment status
  const referenceNumber = payload.referenceNumber; // assuming payload contains a reference number
  paymentStatus[referenceNumber] = {
    confirmed: true, // or whatever logic you have to determine this
    // ... other details if necessary
  };
  res.send("Payment confirmation processed");
});

// Additional endpoint to check payment status
app.get("/check-payment-status/:referenceNumber", (req, res) => {
  const referenceNumber = req.params.referenceNumber;
  const status = paymentStatus[referenceNumber];
  if (status) {
    res.json(status);
  } else {
    res.json({ confirmed: false });
  }
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
