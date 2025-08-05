const axios = require("axios");

async function testPriceGroups() {
  try {
    const res = await axios.get("http://localhost:3001/api/products/price-groups");
  } catch (err) {
    console.error("❌ Error fetching price groups:");
    console.error(err.message);
    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Data:", err.response.data);
    }
  }
}

testPriceGroups();
