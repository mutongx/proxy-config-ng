/* basic information */

CREATE TABLE user (name TEXT, token TEXT, config TEXT);
CREATE UNIQUE INDEX unique_index__user__name ON user (name);
CREATE UNIQUE INDEX unique_index__user__token ON user (token);

CREATE TABLE host (name TEXT, addr TEXT, addr6 TEXT);
CREATE UNIQUE INDEX unique_index__host__name ON host (name);

CREATE TABLE secret (name TEXT, value TEXT);
CREATE UNIQUE INDEX unique_index__secret__name ON secret (name);

/* proxy and access list */

CREATE TABLE proxy (host TEXT, port INTEGER, type TEXT, config TEXT, label TEXT);
CREATE UNIQUE INDEX unique_index__proxy__host__port__type ON proxy (host, port, type);
CREATE INDEX index__proxy__label ON proxy (label);

CREATE TABLE dns (addr TEXT, detour TEXT, label TEXT);
CREATE UNIQUE INDEX unique_index__dns__addr__detour ON dns (addr, detour);
CREATE INDEX index__dns__label ON dns (label);

CREATE TABLE access (user TEXT, class TEXT, label TEXT);
CREATE UNIQUE INDEX unique_index__access__user__class__label ON access (user, class, label);
CREATE INDEX index__access__user__class ON access (user, class);

/* rules and actions */

CREATE TABLE rule_set (name TEXT, seq INTEGER, config TEXT);
CREATE UNIQUE INDEX unique_index__rule_set__name__seq ON rule_set (name, seq);

CREATE TABLE rule_action (user TEXT, class TEXT, inbound TEXT, rule_set TEXT, rule_action TEXT, config TEXT, priority INTEGER);
CREATE UNIQUE INDEX unique_index__rule_action__user__class__inbound__rule_set__rule_action ON rule_action (user, class, inbound, rule_set, rule_action);
CREATE INDEX index__rule_action__user__class__priority ON rule_action (user, class, priority);
