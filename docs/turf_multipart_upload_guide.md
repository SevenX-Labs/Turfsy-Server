# 📝 Guide: How to Create a Turf with Images (multipart/form-data)

When creating a Turf via the `POST /api/v3/turfs` endpoint, you have the option to send all the turf details along with up to 3 images at the exact same time. To do this, your request must be formatted as `multipart/form-data` instead of the usual `application/json`.

Below is a step-by-step guide on how to format this request in code and in tools like Postman.

---

## 📌 Endpoint Details
- **Method**: `POST`
- **URL**: `/api/v3/turfs`
- **Headers**:
  - `Authorization`: `Bearer <YOUR_OWNER_TOKEN>`
  - `Content-Type`: `multipart/form-data` (Let your HTTP client or Postman set this automatically so it includes the boundary).

---

## 🛠️ 1. Testing in Postman

If you want to construct this request in Postman, follow these steps:

1. Create a new **POST** request to `http://YOUR_API_URL/api/v3/turfs`.
2. Go to the **Headers** tab and add:
   - `Authorization`: `Bearer <YOUR_TOKEN>`
   *(Make sure you DO NOT manually set the `Content-Type` header; Postman sets it automatically with the required boundaries for form-data).*
3. Go to the **Body** tab.
4. Select the **form-data** radio button.
5. You will now add your fields one by one as rows. 

### Text Fields (Set the type dropdown to "Text")
Add these keys and their corresponding values:
- `name`: `Champions Arena`
- `sportsType`: `FOOTBALL`
- `turfSize`: `100x60 ft`
- `address`: `123 Sports Complex, MG Road`
- `city`: `Mumbai`
- `pincode`: `400001`
- `lat`: `19.0760`
- `lng`: `72.8777`
- `openTime`: `06:00`
- `closeTime`: `23:00`
- `minSlotDurationMins`: `60`
- `floodLights`: `true`
- `parking`: `true`
- `washroom`: `true`
- `changingRoom`: `false`
- `drinkingWater`: `true`
- `seatingArea`: `true`
- `cafeteria`: `true`
- `weekdayDayPrice`: `1200`
- `weekdayNightPrice`: `1500`
- `weekendDayPrice`: `1500`
- `weekendNightPrice`: `1800`

### Image Fields (Set the type dropdown to "File")
Hover over the "Key" input box. A hidden dropdown will appear that says "Text". Change it to "File". Then add:
- Key: `entrance` -> Select your file (e.g., `gate.jpg`)
- Key: `dayTurf` -> Select your file (e.g., `ground_day.png`)
- Key: `nightTurf` -> Select your file (e.g., `ground_night.jpg`)

---

## 💻 2. Implementation in Frontend (JavaScript / Axios)

When sending this from a web frontend (React, Vue, etc.) or Node.js backend using `axios` or `fetch`, you must use the `FormData` built-in object.

```javascript
// 1. Initialize FormData
const formData = new FormData();

// 2. Append all textual Turf data (must be strings or implicitly convertible)
formData.append('name', 'Champions Arena');
formData.append('sportsType', 'FOOTBALL');
formData.append('turfSize', '100x60 ft');
formData.append('address', '123 Sports Complex, MG Road');
formData.append('city', 'Mumbai');
formData.append('pincode', '400001');
formData.append('lat', '19.0760');
formData.append('lng', '72.8777');
formData.append('openTime', '06:00');
formData.append('closeTime', '23:00');
formData.append('minSlotDurationMins', '60');
formData.append('floodLights', 'true');
formData.append('changingRoom', 'false');
formData.append('weekdayDayPrice', '1200');
formData.append('weekdayNightPrice', '1500');
formData.append('weekendDayPrice', '1500');
formData.append('weekendNightPrice', '1800');

// 3. Append the Image Files 
// (Assuming you have File objects from an <input type="file" /> element)
const entranceInput = document.querySelector('input[name="entrance"]');
const dayTurfInput = document.querySelector('input[name="dayTurf"]');

if (entranceInput.files[0]) {
  formData.append('entrance', entranceInput.files[0]);
}
if (dayTurfInput.files[0]) {
  formData.append('dayTurf', dayTurfInput.files[0]);
}

// 4. Send the request
try {
  const response = await axios.post('/api/v3/turfs', formData, {
    headers: {
      'Authorization': `Bearer YOUR_TOKEN`,
      // Axios automatically sets 'Content-Type': 'multipart/form-data' when it detects FormData
    }
  });

  console.log('Turf Created Successfully:', response.data);
} catch (error) {
  console.error('Failed to create turf:', error.response.data);
}
```

## ⚠️ Common Pitfalls to Avoid
1. **Never manually set `Content-Type: multipart/form-data`** in Axios, Fetch, or Postman. The HTTP client needs to calculate and append the `#boundary` string. Setting it manually will break the payload parsing and cause backend errors.
2. **Boolean and Number fields**: When using `FormData`, everything is sent as a `string`. Sending `formData.append('floodLights', true)` turns into `"true"`. The backend is configured to automatically parse these strings back into Numbers and Booleans correctly using `@Type()` casting.
3. **Invalid Files**: Ensure that the files passed are actually valid images (JPG, PNG, WEBP). If disguised/corrupted files are passed, the API will reject them with a `400 Bad Request` regarding corrupted image files.
