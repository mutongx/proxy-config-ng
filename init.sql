CREATE TABLE user (name TEXT, token TEXT, config JSON);
CREATE UNIQUE INDEX unique_index__user__name ON user (name);
CREATE UNIQUE INDEX unique_index__user__token ON user (token);

CREATE TABLE host (name TEXT, addr TEXT, addr6 TEXT);
CREATE TABLE secret (name TEXT, value TEXT);
CREATE UNIQUE INDEX unique_index__host__name ON host (name);
CREATE UNIQUE INDEX unique_index__secret__name ON secret (name);

CREATE TABLE proxy (host TEXT, port INTEGER, type TEXT, routes TEXT, label TEXT);
CREATE TABLE dns (addr TEXT, detour TEXT, label TEXT);
CREATE UNIQUE INDEX unique_index__proxy__host__port__type ON proxy (host, port, type);
CREATE UNIQUE INDEX unique_index__dns__addr__detour ON dns (addr, detour);
CREATE INDEX index__proxy__label ON proxy (label);
CREATE INDEX index__dns__label ON dns (label);

CREATE TABLE access (user TEXT, class TEXT, label TEXT);
CREATE UNIQUE INDEX unique_index__access__user__class__label ON access (user, class, label);
CREATE INDEX index__access__user__class ON access (user, class);

CREATE TABLE rule (name TEXT, [index] INTEGER, type TEXT, [values] TEXT);
CREATE UNIQUE INDEX unique_index__rule__name__index__type ON rule (name, [index], type);

CREATE TABLE action (user TEXT, class TEXT, inbound TEXT, rule TEXT, action TEXT, options TEXT, priority INTEGER);
CREATE UNIQUE INDEX unique_index__action__user__class__inbound__rule__action ON action (user, class, inbound, rule, action);
CREATE INDEX index__action__user__class__priority ON action (user, class, priority);
