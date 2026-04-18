const axios = require('axios');

async function test() {
  const payload = {
    name: "JSON Test Turf",
    sportsType: "FOOTBALL",
    turfSize: "100x60 ft",
    address: "123 JSON Complex",
    city: "Mumbai",
    pincode: "400001",
    lat: 19.0760,
    lng: 72.8777,
    openTime: "06:00",
    closeTime: "23:00",
    minSlotDurationMins: 60,
    weekdayDayPrice: 1200,
    weekdayNightPrice: 1500,
    weekendDayPrice: 1500,
    weekendNightPrice: 1800,
    floodLights: true,
    changingRoom: false
  };

  try {
    const response = await axios.post('http://localhost:3000/api/v3/turfs', payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdXRoSWQiOiIwNzYxOGVkMi04MzM3LTQ2NzctOTk2MS1kNDczNGQ1YzUzZjEiLCJzZXNzaW9uSWQiOiJiOThlNWQxMi02ODZkLTRjZWEtYWYwZC1hNTYyYWVkYjRjMzQiLCJyb2xlIjoiT1dORVIiLCJpYXQiOjE3NzY1MjYyNzgsImV4cCI6MTc4MTcxMDI3OH0.gSKy7R4N19VtT0gRRS-eVI_U924BoaI_iMcP16f-thw'
      }
    });
    console.log('✅ Success! Created Turf with ID:', response.data.id);
    console.log('Latitude Saved:', response.data.lat);
    console.log('Longitude Saved:', response.data.lng);
  } catch (error) {
    if (error.response) {
      console.log('❌ Error Data:', error.response.data);
    } else {
      console.log('❌ Error:', error.message);
    }
  }
}

test();
