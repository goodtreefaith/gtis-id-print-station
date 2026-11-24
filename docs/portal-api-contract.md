# Portal API Contract

The desktop app uses real GTIS data through the `idprintapi` routes in the CodeIgniter portal.

## Authentication: staff login only

**The device token is retired.** The station has no built-in credential and
no longer sends `Authorization` or `X-GTIS-IDPRINT-TOKEN`. Authentication is
the staff member's own portal login only:

1. `POST /idprintapi/login` with the staff member's portal email and password
   (no other credential). The login is **rate-limited with the same lockout as
   the web login**.
2. Every other route requires the operator token from that login, plus the
   matching ID print permission:

```http
X-GTIS-IDPRINT-OPERATOR: operator-token-from-login
```

The default allowed roles are `Admin` and `Super Admin`, configurable in the
portal's ID print config.

### How the desktop app calls the portal

All portal calls go through the Electron main process. The portal is fixed to
`https://portal.gtis.edu.ph` (`https://preportal.gtis.edu.ph` when the station
is started with `GTIS_IDPRINT_PORTAL=preportal`). The main process only allows
`/idprintapi/` paths on that host, sends only the operator header (when the
staff member is signed in), refuses redirects and applies a timeout.

## Operator Login

`POST /idprintapi/login`

This route needs no device token. It checks the same portal staff/admin email and password used by the portal login screen, and is rate-limited with the web login's lockout.

```json
{
  "username": "admin@example.com",
  "password": "portal-password"
}
```

Returns a short-lived operator token:

```json
{
  "status": true,
  "operator_token": "...",
  "operator": {
    "id": 1,
    "email": "admin@example.com",
    "name": "Portal Admin",
    "role": "Admin",
    "expires": 1780000000
  },
  "expires_at": "2026-05-23T01:00:00+08:00"
}
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
      "guardian_address": "1 Bagtas Tanza Cavite",
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
  "guardian_address": "1 Bagtas Tanza Cavite",
  "guardian_phone": "0917-111-2026"
}
```

The portal updates `students.guardian_name`, `students.guardian_relation`, `students.guardian_address`, and `students.guardian_phone`, then returns the updated student payload.

## Update Student Identifiers

`POST /idprintapi/students/{student_id}/id-details`

```json
{
  "lrn": "123456789101",
  "esc": "ESC-2026-001"
}
```

The portal updates `students.adhar_no` for LRN and `students.samagra_id` for ESC, then returns the updated student payload. Either value may be blank.

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

## Upload ID Card Documents

`POST /idprintapi/students/{id}/id-card-documents`

Sent after a successful print. Requires the operator header.

```json
{
  "front_png_data_url": "data:image/png;base64,...",
  "back_png_data_url": "data:image/png;base64,..."
}
```

Each side is a lossless PNG of exactly one CR80 card at 600 DPI
(1275 x 2022 px), both sides upright, typically 0.3 to 4 MB. The portal accepts
up to 8 MB per side (`idprint_api_max_document_bytes`); the app refuses to
upload a side over 7.5 MB rather than downscale it. The request body can be
around 10 MB, so the web server and proxy body limits must allow it.
