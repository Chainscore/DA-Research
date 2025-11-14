// Usage:
//   export AUTH_TOKEN="$(celestia light auth admin --p2p.network mocha)"
//   node celestia_submit_working.js
const axios = require("axios");
const crypto = require("crypto");

const RPC = "http://127.0.0.1:26658/";
const AUTH_TOKEN = process.env.AUTH_TOKEN || "";

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

// clean ASCII payload (no em-dash or other multibyte characters)
const payload = JSON.stringify({
  message: "Hello from Celestia DA (ascii-safe)",
  ts: new Date().toISOString(),
  author: "xxx",
});

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
      timeout: 60000,
    });
    return r.data;
  } catch (e) {
    if (e.response && e.response.data) return e.response.data;
    throw e;
  }
}

(async () => {
  const ns = namespace29Base64();
  console.log("Using namespace (29 bytes base64):", ns);

  const dataB64 = toBase64(payload);
  console.log("Payload bytes:", Buffer.byteLength(payload, "utf8"));
  console.log("Base64 length:", dataB64.length);

  const params = [
    [
      {
        namespace: ns,
        data: dataB64,
        share_version: 0,
      },
    ],
    {
      "gas_limit": 80000,
      "fee": 2000
    }
  ];

  console.log("\nSubmitting blob.Submit...");
  const resp = await jsonRpc("blob.Submit", params);
  console.log("Response:", JSON.stringify(resp, null, 2));

  if (resp.error) {
    console.error("Submit error:", resp.error);
    process.exit(1);
  }

  // NEW: Handle the response correctly
  // The result is now just a height number, not an object
  const height = resp.result;
  
  console.log("\nSubmitted successfully!");
  console.log("Height:", height);
  console.log("Namespace:", ns);

  if (height) {
    // Wait a bit for the data to be available
    console.log("\nWaiting 3 seconds before attempting to retrieve...");
    await new Promise((r) => setTimeout(r, 3000));

    // Use blob.GetAll to retrieve blobs at the given height and namespace
    console.log("\nAttempting to retrieve blob with blob.GetAll...");
    const getAllResp = await jsonRpc("blob.GetAll", [Number(height), [ns]]);
    
    if (getAllResp.error) {
      console.error("GetAll error:", getAllResp.error);
    } else {
      console.log("blob.GetAll response:", JSON.stringify(getAllResp, null, 2));
      
      // Decode and display the retrieved data
      if (getAllResp.result && getAllResp.result.length > 0) {
        const retrievedBlob = getAllResp.result[0];
        const decodedData = Buffer.from(retrievedBlob.data, "base64").toString("utf8");
        console.log("\nDecoded payload:", decodedData);
      }
    }
  }
})();