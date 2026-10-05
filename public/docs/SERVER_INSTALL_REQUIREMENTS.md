# GYDSchain server installation: PostgreSQL requirements

GYDSchain connects directly to PostgreSQL using the server-side `DATABASE_URL`.
pgAdmin is a database management interface, not a database server; use the
PostgreSQL host and port shown by your database provider or server configuration,
not the pgAdmin website URL.

## Configure `DATABASE_URL`

Use a dedicated application database and database user. The user must be able to
connect to the database and create or update the schema used by the application.
The URI format is:

```text
postgresql://APP_USER:URL_ENCODED_PASSWORD@DB_HOST:5432/DB_NAME
```

For PostgreSQL installed on the same VPS, `DB_HOST` is usually `localhost`. For
a managed or separately hosted database, use its actual hostname and port.
`localhost` always means the machine running the GYDSchain server, not your
browser or pgAdmin. If the database is remote, restrict its network access to
the application server where possible.

URL-encode reserved characters in the username and password (for example,
`@`, `:`, `/`, `%`, and `#`). Never commit a real connection string or expose it
through a `VITE_` variable or browser code.

## Put the value where the server reads it

At startup, the server loads `.env` from its working directory. Variables
already supplied by the process manager or deployment environment take
precedence over values in that file.

- The standard `setup-server.sh` install writes `.env` inside `APP_DIR` and
  runs the server with that directory as its working directory. The default
  `APP_DIR` is `/var/www/gydschain`; keep the file restricted to the service
  account (`chmod 600`).
- If using another process manager, set `DATABASE_URL` in its server-side
  environment or load the `.env` file from the server's actual working
  directory.
- `setup-postgres-ubuntu.sh` writes `/opt/gydschain/.env.production`.
  The application does not load that filename automatically. Copy the needed
  settings into the app's `.env`, or explicitly configure the process manager
  to load that file.
- The production template at `public/scripts/.env.production.template` is a
  placeholder. Replace its sample URL with the actual PostgreSQL connection
  details before using it.

When switching away from an old or paused database, check the effective
`DATABASE_URL` in the running server environment as well as the `.env` file.
An existing process-manager value can override the file. Back up the intended
database before applying production migrations.

## SSL settings

Remote PostgreSQL connections use SSL by default. Set
`DB_SSL_STRICT=true` when the database provider supplies a certificate chain
trusted by the server. Set `DB_SSL=false` only for a trusted local database
that does not use TLS. The application also honors `sslmode=disable` in the
connection URL.

## Verify the connection

Run this on the application server, where `DATABASE_URL` is set:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -c 'SELECT current_database(), current_user;'
```

Confirm the returned database is the intended one. Restart the application
after changing the environment, then check the server logs for
`[db] Database connection verified`. Do not paste the connection string or
unredacted environment output into logs, tickets, or chat.
