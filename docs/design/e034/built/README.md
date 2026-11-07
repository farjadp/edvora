# E-034 · Built login screens (option B · Seal card)

Real pages from the running app, not the design preview. Tenant: iba (localhost). Viewports: desktop 1440 and mobile 375, light and dark. Horizontal overflow was 0 on every shot.

| State | Page | Files |
| --- | --- | --- |
| Student, phone step | `/login` | `student-phone-*` |
| Student, phone validation error | `/login` | `student-phone-error-*` |
| Student, code step with resend timer | `/login` | `student-code-*` (the grey «حالت توسعه» box shows only with the mock SMS provider) |
| Staff, empty | `/staff/login` | `staff-login-*` |
| Staff, wrong credentials | `/staff/login` | `staff-wrong-*` |
| Admin (Payload), skinned | `/admin/login` | `admin-login-*` |
| Admin, wrong password toast | `/admin/login` | `admin-wrong-*` |

To regenerate, run this from the repo root with the dev server up and `SMS_PROVIDER=mock`:

```bash
BASE=http://localhost:3340 node docs/design/e034/built/capture.mjs
```
