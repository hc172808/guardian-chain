# Dashboard updates from the admin page

The GitHub update button now queues a server-side deployment, rather than only pulling files. It saves the previous application (including dependencies and built files), pulls the current branch using fast-forward-only Git, installs locked dependencies, builds, restarts `gydschain-api`, and checks the local application and database. Build, restart, or health-check failures restore the previous files and restart that version. Only signed-in administrators and founders can request updates or read status. Duplicate requests cannot run deployments concurrently.

## Enable on your own server

First deploy this version using your existing deployment procedure. Run the application through PM2; the application OS user must own the checkout and its PM2 process. This feature is intentionally disabled in the Lovable preview.

Add these non-secret settings to the deployed server's `.env` (keep your existing database and wallet secrets):

```dotenv
ENABLE_SERVER_UPDATES=true
DASHBOARD_APP_DIR=/var/www/gydschain
DASHBOARD_UPDATE_STATE_DIR=/var/lib/gydschain-updates
PM2_APP=gydschain-api
UPDATE_HEALTH_URL=http://127.0.0.1:5001/api/deployment-health
```

Create the state directory with permissions restricted to the same user that runs PM2. Replace `YOUR_APP_USER` with that OS account:

```bash
sudo install -d -m 700 -o YOUR_APP_USER -g YOUR_APP_USER /var/lib/gydschain-updates
# Run as YOUR_APP_USER, using its own PM2 environment:
pm2 restart gydschain-api --update-env
```

Ensure Git, npm, Node.js, PM2, curl, tar and flock are installed. Keep the repository free of tracked local modifications; store deployment secrets in ignored `.env` files. Configure GitHub access on the server without putting tokens in the repository URL. Allow enough free disk space for a complete private backup, including dependencies.

Then use **Admin → GitHub Sync → Pull, rebuild & restart**. The status survives a page refresh and temporary restart disconnection. This updates only the dashboard repository; it does not silently update or restart blockchain nodes or nginx.

## Recovery boundaries

Persistent `data`, `uploads` and `logs` folders are not rolled back. The updater does not run SQL migrations. Any startup migrations introduced by new application code must be backward compatible: application-file rollback cannot reverse database changes. Take a separate database backup before changes to its schema.

Private diagnostic logs and failed-update backups are stored in the state directory, never sent to the browser. If recovery fails, your server administrator should inspect `private.log` and the saved tar backup. If the machine or worker dies mid-update, inspect and recover manually before clearing a stale `status.json`; the UI does not start another update over an unfinished one.