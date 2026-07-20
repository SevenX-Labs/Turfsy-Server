const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdXRoSWQiOiIwNzYxOGVkMi04MzM3LTQ2NzctOTk2MS1kNDczNGQ1YzUzZjEiLCJzZXNzaW9uSWQiOiJiOThlNWQxMi02ODZkLTRjZWEtYWYwZC1hNTYyYWVkYjRjMzQiLCJyb2xlIjoiT1dORVIiLCJpYXQiOjE3NzY1MjYyNzgsImV4cCI6MTc4MTcxMDI3OH0.gSKy7R4N19VtT0gRRS-eVI_U924BoaI_iMcP16f-thw';

const turfs = [
  {
    name: "Airoli Kickoff Turf",
    sportsType: "FOOTBALL",
    turfSize: "100x60 ft",
    address: "Sector 8, Airoli Sports Complex",
    city: "Navi Mumbai",
    pincode: "400708",
    lat: 19.188000,
    lng: 73.041000,
    openTime: "06:00",
    closeTime: "23:00",
    minSlotDurationMins: 60,
    weekdayDayPrice: 1000,
    weekdayNightPrice: 1200,
    weekendDayPrice: 1200,
    weekendNightPrice: 1500,
    floodLights: true,
    parking: true,
    changingRoom: true,
    footballs: true,
    bibs: true,
    goalPosts: true,
    wifi: true,
    firstAid: true
  },
  {
    name: "Rabale Strikers Arena",
    sportsType: "CRICKET",
    turfSize: "120x80 ft",
    address: "MIDC Road, Rabale",
    city: "Navi Mumbai",
    pincode: "400701",
    lat: 19.165000,
    lng: 73.015000,
    openTime: "05:00",
    closeTime: "22:00",
    minSlotDurationMins: 60,
    weekdayDayPrice: 800,
    weekdayNightPrice: 1000,
    weekendDayPrice: 1000,
    weekendNightPrice: 1200,
    floodLights: true,
    parking: false,
    drinkingWater: true,
    cricketNets: true,
    wifi: true,
    firstAid: true
  },
  {
    name: "Vashi 5-a-side Ground",
    sportsType: "FOOTBALL",
    turfSize: "90x50 ft",
    address: "Sector 17, Inorbit Mall ke piche",
    city: "Navi Mumbai",
    pincode: "400703",
    lat: 19.120000,
    lng: 73.010000,
    openTime: "06:00",
    closeTime: "00:00",
    minSlotDurationMins: 60,
    weekdayDayPrice: 1500,
    weekdayNightPrice: 1800,
    weekendDayPrice: 1800,
    weekendNightPrice: 2000,
    floodLights: true,
    parking: true,
    seatingArea: true,
    cafeteria: true,
    footballs: true,
    bibs: true,
    goalPosts: true,
    wifi: true,
    cctv: true,
    firstAid: true
  },
  {
    name: "Nerul Sports Hub",
    sportsType: "FOOTBALL",
    turfSize: "110x70 ft",
    address: "Near DY Patil Stadium, Nerul",
    city: "Navi Mumbai",
    pincode: "400706",
    lat: 19.060000,
    lng: 73.000000,
    openTime: "07:00",
    closeTime: "23:00",
    minSlotDurationMins: 60,
    weekdayDayPrice: 1300,
    weekdayNightPrice: 1600,
    weekendDayPrice: 1600,
    weekendNightPrice: 1900,
    floodLights: true,
    washroom: true,
    changingRoom: true,
    footballs: true,
    goalPosts: true,
    firstAid: true
  },
  {
    name: "Dadar Turf Club",
    sportsType: "CRICKET",
    turfSize: "150x100 ft",
    address: "Shivaji Park, Dadar",
    city: "Mumbai",
    pincode: "400028",
    lat: 19.025000,
    lng: 72.840000,
    openTime: "06:00",
    closeTime: "22:00",
    minSlotDurationMins: 60,
    weekdayDayPrice: 2000,
    weekdayNightPrice: 2500,
    weekendDayPrice: 2500,
    weekendNightPrice: 3000,
    floodLights: true,
    parking: true,
    washroom: true,
    changingRoom: true,
    cafeteria: true,
    cricketNets: true,
    wifi: true,
    cctv: true,
    firstAid: true
  }
];

const paths = {
  entrance: 'IMAGE AND VIDEO/Screenshot from 2026-03-26 19-01-36.png',
  dayTurf: 'IMAGE AND VIDEO/Screenshot from 2026-03-26 21-20-41.png',
  nightTurf: 'IMAGE AND VIDEO/Screenshot from 2026-03-27 20-44-06.png',
  video: 'IMAGE AND VIDEO/Screencast from 2026-04-18 22-21-14.webm'
};

async function uploadTurf(turfData) {
  try {
    const form = new FormData();
    // Append standard fields
    for (const [key, value] of Object.entries(turfData)) {
      form.append(key, value.toString());
    }

    // Append Images
    form.append('entrance', fs.createReadStream(paths.entrance));
    form.append('dayTurf', fs.createReadStream(paths.dayTurf));
    form.append('nightTurf', fs.createReadStream(paths.nightTurf));

    console.log(`Uploading turf: ${turfData.name}...`);

    const turfRes = await axios.post('http://localhost:3000/api/v3/turfs', form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${TOKEN}`
      }
    });

    const turfId = turfRes.data.id;
    console.log(`✅ Success: Turf created -> ${turfData.name}, ID: ${turfId}`);

    // Call Video Upload Endpoint
    console.log(`Uploading video for: ${turfData.name}...`);
    const videoForm = new FormData();
    videoForm.append('file', fs.createReadStream(paths.video));

    await axios.post(`http://localhost:3000/api/v3/turfs/${turfId}/video`, videoForm, {
      headers: {
        ...videoForm.getHeaders(),
        Authorization: `Bearer ${TOKEN}`
      }
    });

    console.log(`🎥 Success: Video uploaded for -> ${turfData.name}\n`);
  } catch (error) {
    if (error.response) {
      console.error(`❌ Failed for ${turfData.name}`, error.response.data);
    } else {
      console.error(`❌ Request Failed for ${turfData.name}`, error.message);
    }
  }
}

async function start() {
  for (const t of turfs) {
    await uploadTurf(t);
  }
  console.log("All 5 turfs processed!");
}

start();
