CREATE TABLE IF NOT EXISTS host (name TEXT, addr4 TEXT, addr6 TEXT);
CREATE TABLE IF NOT EXISTS user (name TEXT, token TEXT, config JSON);
CREATE TABLE IF NOT EXISTS proxy (host TEXT, port INTEGER, type TEXT, config JSON, tag TEXT);
CREATE TABLE IF NOT EXISTS access (user TEXT, class TEXT, tag TEXT);
CREATE TABLE IF NOT EXISTS secret (name TEXT, value TEXT);

CREATE UNIQUE INDEX IF NOT EXISTS constraint__host__name ON host (name);
CREATE UNIQUE INDEX IF NOT EXISTS constraint__user__name ON user (name);
CREATE UNIQUE INDEX IF NOT EXISTS constraint__user__token ON user (token);
CREATE UNIQUE INDEX IF NOT EXISTS constraint__proxy__host__port__type ON proxy(host, port, type);
CREATE UNIQUE INDEX IF NOT EXISTS constraint__access__user__class__tag ON access (user, class, tag);
CREATE UNIQUE INDEX IF NOT EXISTS constraint__secret__name ON secret (name);
