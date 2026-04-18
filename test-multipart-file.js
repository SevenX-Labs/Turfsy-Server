const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

async function test() {
  const form = new FormData();
  form.append('name', 'File test turf');
  form.append('sportsType', 'FOOTBALL');
  form.append('turfSize', '100x60 ft');
  form.append('address', '123 Sports Complex');
  form.append('city', 'Mumbai');
  form.append('pincode', '400001');
  form.append('lat', '19.0760');
  form.append('lng', '72.8777');
  form.append('openTime', '06:00');
  form.append('closeTime', '23:00');
  form.append('minSlotDurationMins', '60');
  form.append('weekdayDayPrice', '1200');
  form.append('weekdayNightPrice', '1500');
  form.append('weekendDayPrice', '1500');
  form.append('weekendNightPrice', '1800');
  form.append('floodLights', 'true');
  form.append('changingRoom', 'false');

  // Let's test with a fake file properly
  const buf = fs.readFileSync('fake.png');
  form.append('dayTurf', buf, { filename: 'fake.png', contentType: 'image/png' });

  try {
    const response = await axios.post('http://localhost:3000/api/v3/turfs', form, {
      headers: {
        ...form.getHeaders(),
        Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdXRoSWQiOiIwNzYxOGVkMi04MzM3LTQ2NzctOTk2MS1kNDczNGQ1YzUzZjEiLCJzZXNzaW9uSWQiOiJiOThlNWQxMi02ODZkLTRjZWEtYWYwZC1hNTYyYWVkYjRjMzQiLCJyb2xlIjoiT1dORVIiLCJpYXQiOjE3NzY1MjYyNzgsImV4cCI6MTc4MTcxMDI3OH0.gSKy7R4N19VtT0gRRS-eVI_U924BoaI_iMcP16f-thw'
      }
    });
    console.log('Success:', response.data);
  } catch (error) {
    if (error.response) {
      console.log('Error Data:', error.response.data);
    } else {
      console.log('Error:', error.message);
    }
  }
}
test();
