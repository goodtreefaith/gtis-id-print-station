# Portal API Contract

The desktop app needs a small authenticated portal API before it can use real GTIS data.

Authentication should use a device/service token stored locally on the Windows NUC. Do not put staff passwords or database credentials into the desktop app.

## Search Students

`GET /api/id-print/students?q={query}`

Returns active students enrolled in the current session.

```json
{
  "students": [
    {
      "id": "123",
      "student_session_id": "456",
      "admission_no": "2026001",
      "first_name": "Jetto Morris",
      "middle_name": "R.",
      "last_name": "Bamba",
      "grade": "Grade 12",
      "section": "Faith",
      "photo_url": "https://portal.gtis.edu.ph/uploads/student_images/123.jpg",
      "guardian_name": "Maria Bamba",
      "guardian_relation": "Mother",
      "guardian_phone": "0917-111-2026",
      "lrn": "123456789101",
      "esc": "ESC-2026-001"
    }
  ]
}
```

## Update Guardian Contact

`PUT /api/id-print/students/{student_id}/guardian`

```json
{
  "guardian_name": "Maria Bamba",
  "guardian_relation": "Mother",
  "guardian_phone": "0917-111-2026"
}
```

The portal should update `students.guardian_name`, `students.guardian_relation`, and `students.guardian_phone`, then audit-log the change.

## Upload Approved Photo

`POST /api/id-print/students/{student_id}/photo`

Multipart form data:

- `photo`: approved cropped image

The portal should update `students.image` using the existing student image storage convention, then audit-log the change.

## Log Print

`POST /api/id-print/prints`

```json
{
  "student_id": "123",
  "student_session_id": "456",
  "admission_no": "2026001",
  "template_year": "2026-2027",
  "station_name": "NUC-ID-PRINT-01",
  "status": "printed"
}
```

The portal should save who printed, when, which station was used, and any reprint reason.
