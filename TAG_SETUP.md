# Tag URL

Write this identical URL template to all 30 NTAG213 tags:

```text
https://<host>/t?uid=00000000000000
```

`<host>` is filled in once Render gives us a URL. Keep HTTPS and `/t?uid=` intact.
`00000000000000` is exactly 14 ASCII zero characters, reserved for the UID mirror.
The tag must have UID mirroring enabled and positioned at that placeholder in the
stored URL. Writing the URL alone does not enable or position the mirror.
When read, the mirror supplies the seven-byte factory UID as 14 uppercase hex characters.
The server rejects lowercase, malformed, missing, or repeated UID parameters.

The phone opens the URL natively in its browser. There is no Web NFC API in the app.
Mirror configuration and tag-writing steps will be checked on Thursday, 2026-09-10.
Until then, use `/dev` with the three fake UIDs. Hardware behavior has not been verified.
