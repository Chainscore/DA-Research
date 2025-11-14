
const axios = require("axios");
const crypto = require("crypto");

const RPC = "http://127.0.0.1:26658/";
const AUTH_TOKEN = process.env.AUTH_TOKEN || "";
const NUM_BLOBS = 50; // Number of blobs to submit in ONE transaction

if (!AUTH_TOKEN) {
  console.error('Export AUTH_TOKEN first: export AUTH_TOKEN="$(celestia light auth admin --p2p.network mocha)"');
  process.exit(1);
}

// Construct a 29-byte namespace.
function namespace29Base64() {
  const buf = Buffer.alloc(29);
  buf.fill(0);
  // The first 19 bytes must be 0 for a user-specified namespace.
  // The last 10 bytes can be random.
  const randomBytes = crypto.randomBytes(10);
  randomBytes.copy(buf, 19);
  return buf.toString("base64");
}

// Create a payload generator function
function createPayload(blobIndex) {
  return JSON.stringify({
    message: `Blob ${blobIndex} from batch submission`,
    ts: new Date().toISOString(),
    blobIndex: blobIndex,
    author: "batch-submitter",
  });
}

// helper: base64 encode
function toBase64(s) {
  return Buffer.from(s, "utf8").toString("base64");
}

async function jsonRpc(method, params) {
  const body = { jsonrpc: "2.0", id: 1, method, params };
  try {
    const r = await axios.post(RPC, body, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AUTH_TOKEN}`,
      },
      timeout: 120000, // Increased timeout for large batch
    });
    return r.data;
  } catch (e) {
    if (e.response && e.response.data) return e.response.data;
    throw e;
  }
}

(async () => {
  console.log(`\n========== SUBMITTING ${NUM_BLOBS} BLOBS IN A SINGLE TRANSACTION ==========\n`);
  
  const startTime = Date.now();
  
  // Create an array of blob objects for the single transaction
  const blobs = [];
  const namespaces = [];
  
  for (let i = 1; i <= NUM_BLOBS; i++) {
    const ns = namespace29Base64();
    const payload = createPayload(i);
    const dataB64 = toBase64(payload);
    
    blobs.push({
      namespace: ns,
      data: dataB64,
      share_version: 0,
    });
    
    namespaces.push(ns);
    
    if (i % 10 === 0 || i === NUM_BLOBS) {
      console.log(`📦 Prepared ${i}/${NUM_BLOBS} blobs...`);
    }
  }

  // Calculate total size
  const totalBytes = blobs.reduce((sum, blob) => {
    return sum + Buffer.from(blob.data, 'base64').length;
  }, 0);
  
  console.log(`\n📊 Total data size: ${totalBytes} bytes (${(totalBytes / 1024).toFixed(2)} KB)`);
  
  // CORRECT FORMAT: [array_of_blobs, TxConfig_or_null]
  // Option 1: Use null for automatic gas estimation (RECOMMENDED)
  const params = [
    blobs,
    null
  ];

  // Option 2: Manual gas control (uncomment if needed)
  // const params = [
  //   blobs,
  //   {
  //     gas_price: 0.002,  // Optional: gas price in TIA
  //     // gas: 500000,     // Optional: specific gas limit
  //   }
  // ];

  console.log(`\n🚀 Submitting single transaction with ${NUM_BLOBS} blobs...`);
  const resp = await jsonRpc("blob.Submit", params);

  if (resp.error) {
    console.error("❌ Submit error:", resp.error);
    process.exit(1);
  }

  const height = resp.result;
  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;

  console.log("\n========== SUCCESS ==========");
  console.log(`✅ All ${NUM_BLOBS} blobs submitted in a SINGLE transaction!`);
  console.log(`📍 Block height: ${height}`);
  console.log(`⏱️  Duration: ${duration.toFixed(2)} seconds`);
  console.log(`📦 Total size: ${(totalBytes / 1024).toFixed(2)} KB`);
  console.log(`📈 Average blob size: ${(totalBytes / NUM_BLOBS).toFixed(0)} bytes`);

  // Verify by retrieving data from the block
  if (height) {
    console.log("\n🔍 Waiting 3 seconds before retrieving data...");
    await new Promise((r) => setTimeout(r, 3000));

    // Try to retrieve blobs from a few different namespaces to verify
    console.log(`\n🔍 Verifying blobs in block ${height}...`);
    
    let totalRetrieved = 0;
    const samplesToCheck = Math.min(5, NUM_BLOBS);
    
    for (let i = 0; i < samplesToCheck; i++) {
      const getAllResp = await jsonRpc("blob.GetAll", [Number(height), [namespaces[i]]]);
      
      if (!getAllResp.error && getAllResp.result && getAllResp.result.length > 0) {
        totalRetrieved += getAllResp.result.length;
        const decodedData = Buffer.from(getAllResp.result[0].data, "base64").toString("utf8");
        const parsedData = JSON.parse(decodedData);
        console.log(`  ✅ Retrieved blob ${parsedData.blobIndex}: ${parsedData.message}`);
      }
    }
    
    if (totalRetrieved > 0) {
      console.log(`\n✅ Successfully verified ${totalRetrieved} blob(s) from block ${height}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("🎉 All blobs GUARANTEED to be in the SAME block!");
  console.log("   (Because they're in a single PayForBlobs transaction)");
  console.log("=".repeat(60) + "\n");
})();