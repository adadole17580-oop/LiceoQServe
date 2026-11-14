# LiceoQServe

## Local network development

Set `frontend/.env`'s `VITE_API_URL` to the backend computer's current LAN address and port `3000`. In `backend/.env`, set `FRONTEND_URL` to the exact frontend origins (comma-separated if both LAN and localhost access are needed) and `STUDENT_PORTAL_URL` to the origin students should open from notification emails. These values must be updated if the LAN address changes.

For production, set `FRONTEND_URL` to the deployed frontend origin(s) and `STUDENT_PORTAL_URL` to the externally reachable student portal origin. Production startup requires at least one valid `FRONTEND_URL`; email links do not fall back to localhost.

Start the backend from `backend` with `npm start`, and start the frontend from `frontend` with `npm run dev -- --host 0.0.0.0`. For phone testing on trusted Wi-Fi, set that Windows network profile to **Private** and allow inbound TCP ports `3000` (backend) and `5173` (Vite development server) on the Private profile only. Do not expose the development ports on a Public network.
