# Portal API Contract

The desktop app can use real GTIS data through the `idprintapi` routes in the CodeIgniter portal. Authentication uses a device/service token stored locally on the Windows NUC. Do not put staff passwords or database credentials into the desktop app.

Set the token on the portal server through `GTIS_IDPRINT_API_TOKEN` or an ignored `application/config/idprint.local.php` file:

```php
<?php
$config['idprint_api_token'] = 'replace-with-a-long-random-token';
```

Every request should send either:

```http
Authorization: Bearer replace-with-a-long-random-token
```

or:

```http
X-GTIS-IDPRINT-TOKEN: replace-with-a-long-random-token
```

## Search Students

`GET /idprintapi/students?q={query}&page=1&limit=20`

Returns active students enrolled in the current portal session. The app uses this in pages so it does not load the full student table at once.

```json
{
  "status": true,
  "students": [
    {
      "id": "123",
      "admission_no": "2026001",
      "firstname": "Jetto Morris",
      "middlename": "R.",
      "lastname": "Bamba",
      "class": "Grade 12",
      "section": "Faith",
      "photo_url": "https://portal.gtis.edu.ph/uploads/student_images/123.jpg",
      "guardian_name": "Maria Bamba",
      "guardian_relation": "Mother",
      "guardian_phone": "0917-111-2026",
      "lrn": "123456789101",
      "esc": "ESC-2026-001"
    }
  ],
  "page": 1,
  "limit": 20,
  "has_more": false
}
```

The QR code is generated locally from `admission_no`.

## Update Guardian Contact

`POST /idprintapi/students/{student_id}/guardian`

```json
{
  "guardian_name": "Maria Bamba",
  "guardian_relation": "Mother",
  "guardian_phone": "0917-111-2026"
}
```

The portal updates `students.guardian_name`, `students.guardian_relation`, and `students.guardian_phone`, then returns the updated student payload.

## Upload Approved Photo

`POST /idprintapi/students/{student_id}/photo`

```json
{
  "photo_data_url": "data:image/jpeg;base64,..."
}
```

The portal validates JPEG/PNG image data, saves the image under the existing `uploads/student_images/` convention, updates `students.image`, and returns the updated student payload.

## Log Print

`POST /idprintapi/prints`

This route currently acknowledges print events. It is reserved for a later print-history table if GTIS wants reprint tracking.
