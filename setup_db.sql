-- Run this in psql as a superuser (e.g. postgres) to create the database and user
-- Usage: psql -U postgres -f setup_db.sql

CREATE USER atg_user WITH PASSWORD 'atg_pass123';

CREATE DATABASE atg_wholesale OWNER atg_user;

GRANT ALL PRIVILEGES ON DATABASE atg_wholesale TO atg_user;

\connect atg_wholesale

GRANT ALL ON SCHEMA public TO atg_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO atg_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO atg_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO atg_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO atg_user;
