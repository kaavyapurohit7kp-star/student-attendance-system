# Student Attendance Management System

A college project built with Node.js, Express, HTML, CSS, JavaScript and IBM Cloudant.

## Features
- Admin login using environment-configured credentials and bcrypt password hash
- Dashboard statistics
- Student create, read, update and delete
- Mark Present, Absent or Leave for a date
- Prevent duplicate attendance for the same student/date
- Date-wise attendance register
- Student-wise attendance percentage and report
- IBM Cloudant database integration
- Local JSON storage fallback for development without IBM Cloud credentials

## Requirements
- Node.js 20 or newer (Node.js 22 LTS recommended)
- npm
- VS Code
- Optional: IBM Cloud account and IBM Cloudant service instance

## Run locally

1. Extract the ZIP and open this folder in VS Code.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env`.
4. Set a long random `SESSION_SECRET`.
5. Create a password hash:

   ```bash
   npm run hash-password -- "Choose-A-Strong-Password"
   ```

   Copy the printed hash into `ADMIN_PASSWORD_HASH` in `.env`.
6. Start the app:

   ```bash
   npm run dev
   ```

7. Open http://localhost:3000 and sign in with the `ADMIN_USERNAME` and the password you hashed.

When `CLOUDANT_URL` and `CLOUDANT_APIKEY` are blank, the app uses `data/local-db.json`. This lets you test the full application before creating cloud resources.

## Connect IBM Cloudant

1. Create an IBM Cloudant service instance in IBM Cloud.
2. Create a service credential with an IAM API key.
3. Copy the credential `url` into `CLOUDANT_URL`.
4. Copy `apikey` into `CLOUDANT_APIKEY`.
5. Set `CLOUDANT_DB=attendance_db`.
6. Restart the application. It will create the database if it does not exist.

Do not commit `.env`, share your API key, or put credentials in frontend JavaScript. Use Code Engine environment variables/secrets for deployment.

Official IBM documentation:
- https://cloud.ibm.com/docs/Cloudant?topic=Cloudant-client-libraries
- https://github.com/IBM/cloudant-node-sdk
- https://cloud.ibm.com/docs/codeengine

## Deploy with IBM Code Engine

1. Push this project to a private or public GitHub repository (never include `.env`).
2. In IBM Cloud, create a Code Engine project and an application.
3. Select the source repository and use this Dockerfile to build the image.
4. Set `PORT=3000`, `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `CLOUDANT_URL`, `CLOUDANT_APIKEY`, and `CLOUDANT_DB` as application environment variables/secrets.
5. Deploy and open the generated application URL.

For a real production deployment, configure a persistent session store, HTTPS-only secure cookies, monitoring, backups, and role-based access control. The in-memory session store included here is intended for a student demonstration, not multi-instance production use.

## Data model

Student document:
```json
{
  "_id": "student_<uuid>",
  "type": "student",
  "rollNo": "AI001",
  "name": "Aarav Sharma",
  "course": "CSE AI",
  "semester": 3,
  "email": "aarav@example.com",
  "createdAt": "ISO date"
}
```

Attendance document:
```json
{
  "_id": "attendance_<date>_<student-id>",
  "type": "attendance",
  "studentId": "student_<uuid>",
  "rollNo": "AI001",
  "studentName": "Aarav Sharma",
  "date": "YYYY-MM-DD",
  "status": "Present",
  "updatedAt": "ISO date"
}
```

## Important notes
- This is an educational starter project. Change the default admin username and choose your own strong password.
- Use fictional/sample student information for demonstrations.
- Attendance data is personal information; only authorized staff should access it.
