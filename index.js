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

function generateQRCode(data, callback) {
  const qrString = generatePayNowStr(data);
  const referenceNumber = data.reference;
  // const tempFileName = `qr-${Date.now()}.png`;
  const tempFileName = `qr-${referenceNumber}.png`;
  const tempFilePath = path.join(tempDir, tempFileName);

  QRCode.toFile(tempFilePath, qrString, (err) => {
    if (err) {
      console.error(err); // Log the error
      callback(err);
    } else {
      // Convert the file path to a URL accessible from the client
      const accessibleUrl = `/temp/${tempFileName}`;
      callback(null, accessibleUrl, referenceNumber); // Send the URL (not the file system path)
    }
  });
}

// Endpoint to generate QR code
app.post("/generate-qr", (req, res) => {
  console.log("Received request at /generate-qr with data:", req.body);
  const data = req.body || req.query;

  // Validate input
  if (!validateInput(data)) {
    return res.status(400).send("Invalid input parameters");
  }

  generateQRCode(data, (err, tempFilePath, referenceNumber) => {
    if (err) {
      return res.status(500).send("Error generating QR code");
    }

    // After QR code is generated, call Google Script Web App
    axios
      .post("https://script.google.com/macros/s/AKfycbyjierMbbtsmkwXrqo7bIzBfB4iVg72xMwlb-O7rWgHiTpae3M1EGNcu7hIymevexMAXA/exec", {
        //v7 with logging
        referenceNumber,
      })
      .then((response) => {
        console.log("Payment check initiated:", response.data);
      })
      .catch((error) => {
        console.error("Error triggering Google Script:", error);
      });

    // Send back the full URL to the QR code image
    const qrImageURL = `${req.protocol}://${req.get("host")}${tempFilePath}`;
    res.json({ qrImagePath: qrImageURL, referenceNumber: referenceNumber });
    console.log("Sent response from /generate-qr");
  });
});

let paymentStatus = {}; // Object to store payment status by reference number

app.post("/payment-confirmation", (req, res) => {
  console.log("Received request at /payment-confirmation with data:", req.body);
  const { body, referenceNumber } = req.body;

  // Regular expressions to extract amount and transaction time
  const amountRegex = /SGD (\d+\.\d+)/;
  const timeRegex = /on (\d\d \w+ \d\d:\d\d)/;

  // Extracting amount and time
  const amountMatch = body.match(amountRegex);
  const timeMatch = body.match(timeRegex);

  if (amountMatch && timeMatch) {
    const amount = amountMatch[1];
    const transactionTime = timeMatch[1];

    paymentStatus[referenceNumber] = {
      confirmed: true,
      amount: amount,
      time: transactionTime,
    };
  } else {
    // Handle the case where the regex does not find a match
    paymentStatus[referenceNumber] = {
      confirmed: false,
    };
  }

  res.send("Payment confirmation processed");
  console.log("Sent response from /payment-confirmation");
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

app.get("/clean-temp-folder", (req, res) => {
  cleanupTempFolder();
  res.send("Temp folder cleaned up");
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

function cleanupTempFolder() {
  fs.readdir(tempDir, (err, files) => {
    if (err) throw err;

    for (const file of files) {
      if (path.extname(file) === ".png") {
        fs.unlink(path.join(tempDir, file), (err) => {
          if (err) throw err;
        });
      }
    }
  });
}

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});
